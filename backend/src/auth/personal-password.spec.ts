import { describe, it, expect, jest } from "@jest/globals";
import bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
async function setup() {
  const user = {
    id: "u1",
    phone: "+77001234567",
    passwordHash: await bcrypt.hash("Previous123!", 4),
    passwordVersion: 3,
    isBlocked: false,
  };
  const db: any = {
    $executeRaw: jest.fn(),
    technicalRateLimit: { upsert: jest.fn(async () => ({ count: 1 })) },
    user: {
      findUnique: jest.fn(async () => user),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    organizationMember: { findFirst: jest.fn(async () => ({ id: "m1" })) },
    session: { updateMany: jest.fn() },
    passwordRecovery: { updateMany: jest.fn() },
    passwordRecoveryRequest: { updateMany: jest.fn() },
  };
  db.$transaction = async (f: any) => f(db);
  const auth = new AuthService(
    db,
    {} as any,
    {} as any,
    { log: jest.fn() } as any,
  );
  const input = {
    bin: "123456789012",
    phone: "87001234567",
    oldPassword: "Previous123!",
    newPassword: "Personal123!",
    confirmation: "Personal123!",
  };
  return { auth, db, input };
}
describe("personal password change", () => {
  it("checks identity and password then revokes sessions and recovery grants", async () => {
    const { auth, db, input } = await setup();
    await auth.changePersonalPassword("u1", input, "ip");
    const update = db.user.updateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({
      id: "u1",
      passwordVersion: 3,
      isBlocked: false,
    });
    expect(
      await bcrypt.compare(input.newPassword, update.data.passwordHash),
    ).toBe(true);
    expect(db.session.updateMany).toHaveBeenCalled();
    expect(db.passwordRecovery.updateMany).toHaveBeenCalled();
  });
  it("rejects wrong old password and another phone without updates", async () => {
    const { auth, db, input } = await setup();
    await expect(
      auth.changePersonalPassword("u1", { ...input, oldPassword: "Wrong123!" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      auth.changePersonalPassword("u1", { ...input, phone: "+77009999999" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
  it("rejects missing membership, mismatched confirmation and concurrent change", async () => {
    const { auth, db, input } = await setup();
    db.organizationMember.findFirst.mockResolvedValue(null);
    await expect(
      auth.changePersonalPassword("u1", input),
    ).rejects.toBeInstanceOf(BadRequestException);
    db.organizationMember.findFirst.mockResolvedValue({ id: "m" });
    await expect(
      auth.changePersonalPassword("u1", {
        ...input,
        confirmation: "different",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    db.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      auth.changePersonalPassword("u1", input),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
