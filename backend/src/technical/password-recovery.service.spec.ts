import { describe, it, expect, jest } from "@jest/globals";
import {
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import { PasswordRecoveryService } from "./password-recovery.service";
import { digest } from "../observability/safe-data";
function setup() {
  const request = {
    id: "r1",
    userId: "employee",
    organizationId: "org1",
    status: "pending",
    expiresAt: new Date(Date.now() + 60_000),
  };
  const db: any = {
    technicalRateLimit: { upsert: jest.fn(async () => ({ count: 1 })) },
    $executeRaw: jest.fn(),
    organizationMember: {
      findFirst: jest.fn(async () => ({
        userId: "employee",
        organizationId: "org1",
        user: { fullName: "Иванов Иван Иванович" },
      })),
      findMany: jest.fn(async () => [
        { organizationId: "org1", userId: "manager" },
      ]),
    },
    passwordRecoveryRequest: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => [request]),
      findUnique: jest.fn(async () => request),
      create: jest.fn(async () => request),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    user: {
      findUnique: jest.fn(async () => ({ id: "employee", isBlocked: false })),
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    organization: { findMany: jest.fn(async () => []) },
    passwordRecovery: {
      findUnique: jest.fn(),
      create: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    session: { updateMany: jest.fn(async () => ({ count: 1 })) },
    notification: { create: jest.fn(async () => ({})) },
  };
  db.$transaction = async (f: any) => f(db);
  const ledger: any = { write: jest.fn(async () => {}) };
  return {
    db,
    ledger,
    request,
    service: new PasswordRecoveryService(db, ledger),
  };
}
describe("employee password recovery", () => {
  it("normalizes identity and creates only a pending request and manager notification", async () => {
    const { service, db } = setup();
    const result = await service.request(
      "87001234567",
      "ip",
      "123456789012",
      "  ИВАНОВ   Иван Иванович ",
    );
    expect(result).not.toHaveProperty("token");
    expect(db.passwordRecoveryRequest.create).toHaveBeenCalled();
    expect(db.passwordRecovery.create).not.toHaveBeenCalled();
    expect(db.notification.create).toHaveBeenCalled();
    expect(db.organizationMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: { phone: "+77001234567", isBlocked: false },
        }),
      }),
    );
  });
  it("uses the same public response for invalid identity without creating a request", async () => {
    const { service, db } = setup();
    const result = await service.request(
      "7001234567",
      "ip",
      "123456789012",
      "Иванов Иван Иванович",
    );
    db.passwordRecoveryRequest.create.mockClear();
    expect(
      await service.request(
        "7001234567",
        "ip",
        "123456789012",
        "Другой человек",
      ),
    ).toEqual(result);
    expect(db.passwordRecoveryRequest.create).not.toHaveBeenCalled();
  });
  it("deduplicates requests and scopes manager queue to their organizations", async () => {
    const { service, db, request } = setup();
    db.passwordRecoveryRequest.findFirst.mockResolvedValue(request);
    await service.request(
      "7001234567",
      "ip",
      "123456789012",
      "Иванов Иван Иванович",
    );
    expect(db.notification.create).not.toHaveBeenCalled();
    await service.requests("manager");
    expect(db.passwordRecoveryRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: { in: ["org1"] } }),
      }),
    );
  });
  it("blocks approval by another organization or the requesting user", async () => {
    const { service, db } = setup();
    db.organizationMember.findMany.mockResolvedValue([
      { organizationId: "other" },
    ]);
    await expect(service.approve("r1", "outsider")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.approve("r1", "employee")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.passwordRecovery.create).not.toHaveBeenCalled();
  });
  it("approves once, stores only a digest and audits manager identity", async () => {
    const { service, db, ledger } = setup();
    const result = await service.approve("r1", "manager");
    expect(result.token).toMatch(/^[\w-]{43}$/);
    expect(db.passwordRecovery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tokenHash: digest(result.token) }),
    });
    expect(ledger.write).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "manager",
        action: "password.recovery.issue",
      }),
      db,
    );
    db.passwordRecoveryRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approve("r1", "manager")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it("rejects expired requests and removed memberships", async () => {
    const { service, db, request } = setup();
    request.expiresAt = new Date(0);
    await expect(service.approve("r1", "manager")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    request.expiresAt = new Date(Date.now() + 60000);
    db.organizationMember.findFirst.mockResolvedValue(null);
    await expect(service.approve("r1", "manager")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it("hashes a new password, revokes sessions and rejects token replay", async () => {
    const { service, db } = setup();
    const token = "A".repeat(43);
    db.passwordRecovery.findUnique.mockResolvedValue({
      id: "g",
      userId: "employee",
      expiresAt: new Date(Date.now() + 60000),
      usedAt: null,
    });
    await service.consume(token, "Personal123!", "Personal123!", "ip");
    expect(
      await bcrypt.compare(
        "Personal123!",
        db.user.updateMany.mock.calls[0][0].data.passwordHash,
      ),
    ).toBe(true);
    expect(db.session.updateMany).toHaveBeenCalled();
    db.passwordRecovery.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.consume(token, "Personal123!", "Personal123!", "ip"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it("rejects expired grants without updating the password", async () => {
    const { service, db } = setup();
    db.passwordRecovery.findUnique.mockResolvedValue({
      id: "g",
      userId: "employee",
      expiresAt: new Date(0),
    });
    await expect(
      service.consume("A".repeat(43), "Personal123!", "Personal123!", "ip"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
});
