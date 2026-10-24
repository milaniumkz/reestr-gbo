import { describe, it, expect, jest } from "@jest/globals";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { BankInvoicesService } from "./bank-invoices.service";
import {
  parseInvoiceAmount,
  formatInvoiceAmount,
  invoiceAmountInWords,
} from "./invoice-money";
import { InvoiceSnapshot, renderBankInvoice } from "./bank-invoice-pdf";
function setup() {
  const records = new Map<string, any>();
  const organization: any = {
    id: "org1",
    type: "inspection_org",
    name: "ТОО Тестовый ИО",
    legalName: "ТОО Юридическое название",
    bin: "001140000001",
    region: "Астана",
    address: "Улица Испытательная, 1",
    billingNumber: 42,
    status: "active",
  };
  const supplier = {
    name: "ИП Тестовый поставщик",
    iin: "111111111111",
    address: "Тестовый адрес",
    bank: "Тестовый банк",
    iban: "KZ" + "1".repeat(18),
    bik: "TESTKZKA",
    kbe: "19",
    vat: "Без НДС",
  };
  const db: any = {
    $executeRaw: jest.fn(),
    organization: { findUnique: jest.fn(async () => organization) },
    organizationMember: { findFirst: jest.fn(async () => ({ role: "admin" })) },
    technicalSetting: {
      findUnique: jest.fn(async () => ({ value: supplier })),
    },
    bankInvoice: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id
          ? records.get(where.id)
          : [...records.values()].find(
              (r) =>
                r.organizationId ===
                  where.organizationId_requestKey.organizationId &&
                r.requestKey === where.organizationId_requestKey.requestKey,
            ),
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: "invoice1",
          number: 1,
          createdAt: new Date("2026-10-24T20:30:00Z"),
          status: "issued",
          ...data,
        };
        records.set(row.id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = { ...records.get(where.id), ...data };
        records.set(row.id, row);
        return row;
      }),
      findMany: jest.fn(async () => [...records.values()]),
    },
    auditLog: { create: jest.fn(async () => ({})) },
    balance: { upsert: jest.fn(), update: jest.fn() },
    payment: { create: jest.fn() },
  };
  db.$transaction = async (fn: any) => fn(db);
  const user = {
    sub: "manager1",
    phone: "+77000000000",
    roles: ["inspection_org"],
  };
  return {
    db,
    organization,
    supplier,
    records,
    user,
    service: new BankInvoicesService(db),
  };
}
describe("invoice money", () => {
  it("uses exact tiyn and consistent formatting for spaces, comma and dot", () => {
    expect(parseInvoiceAmount("12 345,67")).toBe(1234567n);
    expect(parseInvoiceAmount("0.01")).toBe(1n);
    expect(formatInvoiceAmount(1234567n)).toBe("12 345,67");
    expect(formatInvoiceAmount(100n)).toBe("1,00");
  });
  it.each(["0", "-1", "1.001", "1e3", "NaN", "100000000.01", "", "1,"])(
    "rejects invalid amount %s",
    (value) =>
      expect(() => parseInvoiceAmount(value)).toThrow(BadRequestException),
  );
  it("spells genders, teen exceptions and fractional currency correctly", () => {
    expect(invoiceAmountInWords(210100n)).toBe(
      "Две тысячи сто один тенге ноль тиынов",
    );
    expect(invoiceAmountInWords(101n)).toBe("Один тенге один тиын");
    expect(invoiceAmountInWords(1112n)).toBe(
      "Одиннадцать тенге двенадцать тиынов",
    );
    expect(invoiceAmountInWords(10000000000n)).toBe(
      "Сто миллионов тенге ноль тиынов",
    );
  });
});
describe("bank advance invoices", () => {
  it("issues a complete PDF using server profile and snapshots without changing balances or invoking a payment provider", async () => {
    const { service, db, records, user } = setup();
    const summary = await service.create(
      user,
      "org1",
      "12 345,67",
      "a".repeat(32),
    );
    expect(summary.number).toBe("ERSI-2026-000001");
    expect(summary.date).toBe("25.10.2026");
    expect(summary.amount).toBe("12 345,67");
    const record = records.get("invoice1");
    expect(record.amountMinor).toBe(1234567n);
    expect(record.pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(record.snapshot).toMatchObject({
      buyerLegalName: "ТОО Юридическое название",
      buyerBin: "001140000001",
      orgSystemName: "ТОО Тестовый ИО",
      orgPaymentId: "IO-000042",
      amountMinor: "1234567",
      amountLabel: "12 345,67",
    });
    expect(summary.purpose).toContain(
      "ИО: ТОО Тестовый ИО. ID: IO-000042. Счёт № ERSI-2026-000001",
    );
    expect(db.balance.upsert).not.toHaveBeenCalled();
    expect(db.balance.update).not.toHaveBeenCalled();
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it("reuses one issued invoice on retries and rejects a changed amount under the same request key", async () => {
    const { service, db, user } = setup();
    const first = await service.create(user, "org1", "1000", "b".repeat(32));
    expect(
      await service.create(user, "org1", "1000.00", "b".repeat(32)),
    ).toEqual(first);
    expect(db.bankInvoice.create).toHaveBeenCalledTimes(1);
    await expect(
      service.create(user, "org1", "2000", "b".repeat(32)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("re-downloads identical archived PDF bytes after organization or supplier changes", async () => {
    const { service, user, organization, supplier } = setup();
    const invoice = await service.create(user, "org1", "50.01", "c".repeat(32));
    const before = await service.pdf(user, invoice.id);
    organization.name = "Измененное название";
    supplier.address = "Другой адрес";
    expect(
      (await service.pdf(user, invoice.id)).bytes.equals(before.bytes),
    ).toBe(true);
    expect((await service.list(user, "org1")).items[0].purpose).toContain(
      "ИО: ТОО Тестовый ИО.",
    );
  });
  it("denies staff and another organization manager before exposing an invoice", async () => {
    const { service, user, db } = setup();
    const invoice = await service.create(user, "org1", "100", "d".repeat(32));
    db.organizationMember.findFirst.mockResolvedValue(null);
    await expect(
      service.pdf({ ...user, sub: "other" }, invoice.id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list(user, "org1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.create(user, "org1", "100", "e".repeat(32)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.bankInvoice.create).toHaveBeenCalledTimes(1);
  });
  it("refuses incomplete buyer details or missing supplier settings instead of issuing a blank template", async () => {
    const { service, user, db, organization } = setup();
    organization.address = null;
    await expect(
      service.create(user, "org1", "100", "f".repeat(32)),
    ).rejects.toBeInstanceOf(BadRequestException);
    organization.address = "Street";
    db.technicalSetting.findUnique.mockResolvedValue(null);
    await expect(
      service.create(user, "org1", "100", "f".repeat(32)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.bankInvoice.create).not.toHaveBeenCalled();
  });
  it("blocks new invoices for a blocked IO while retaining access to already-issued documents", async () => {
    const { service, user, organization } = setup();
    const invoice = await service.create(user, "org1", "100", "1".repeat(32));
    organization.status = "blocked";
    await expect(
      service.create(user, "org1", "100", "2".repeat(32)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((await service.pdf(user, invoice.id)).bytes.length).toBeGreaterThan(
      1000,
    );
  });
});
