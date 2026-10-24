import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RequestUser } from "../common/current-user";
import {
  formatInvoiceAmount,
  invoiceAmountInWords,
  parseInvoiceAmount,
} from "./invoice-money";
import { InvoiceSnapshot, renderBankInvoice } from "./bank-invoice-pdf";
export const BANK_SUPPLIER_KEY = "bank-invoice-supplier";
@Injectable()
export class BankInvoicesService {
  constructor(private readonly prisma: PrismaService) {}
  private async organization(tx: any, user: RequestUser, id: string) {
    if (typeof id !== "string" || !id || id.length > 100)
      throw new BadRequestException("Укажите инспекционный орган");
    const organization = await tx.organization.findUnique({ where: { id } });
    if (!organization || organization.type !== "inspection_org")
      throw new NotFoundException("Инспекционный орган не найден");
    if (
      !user.roles.some((role) => ["super_admin", "operator"].includes(role))
    ) {
      const member = await tx.organizationMember.findFirst({
        where: {
          organizationId: id,
          userId: user.sub,
          role: { in: ["admin", "manager"] },
        },
      });
      if (!member)
        throw new ForbiddenException(
          "Счета доступны только руководителю своего ИО",
        );
    }
    return organization;
  }
  private summary(invoice: any) {
    const s = invoice.snapshot as InvoiceSnapshot;
    return {
      id: invoice.id,
      number: s.number,
      date: s.date,
      amount: s.amountLabel,
      purpose: s.purpose,
      status: invoice.status,
      createdAt: invoice.createdAt,
    };
  }
  async create(
    user: RequestUser,
    organizationId: string,
    amount: string,
    requestKey: string,
  ) {
    const minor = parseInvoiceAmount(amount);
    if (!/^[a-f0-9]{32}$/.test(requestKey))
      throw new BadRequestException("Неверный идентификатор запроса");
    return this.prisma.$transaction(
      async (tx) => {
        const org = await this.organization(tx, user, organizationId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId + ":" + requestKey},3))`;
        const existing = await tx.bankInvoice.findUnique({
          where: { organizationId_requestKey: { organizationId, requestKey } },
        });
        if (existing) {
          if (existing.amountMinor !== minor)
            throw new BadRequestException(
              "Этот запрос уже использован для другой суммы",
            );
          return this.summary(existing);
        }
        if (org.status !== "active")
          throw new ForbiddenException(
            "ИО заблокирован: создание нового счёта недоступно",
          );
        const legalName = (org.legalName ?? org.name).trim();
        if (
          !legalName ||
          !/^\d{12}$/.test(org.bin) ||
          !org.address?.trim() ||
          [legalName, org.name, org.address].some((value) =>
            /{{|}}|<<|>>/.test(value),
          )
        )
          throw new BadRequestException(
            "Для счёта заполните наименование, БИН и адрес в карточке ИО",
          );
        const configured = await tx.technicalSetting.findUnique({
          where: { key: BANK_SUPPLIER_KEY },
        });
        const supplier = configured?.value as
          InvoiceSnapshot["supplier"] | undefined;
        if (
          !supplier ||
          !/^\d{12}$/.test(supplier.iin) ||
          !/^KZ[A-Z0-9]{18}$/.test(supplier.iban) ||
          ![
            supplier.name,
            supplier.address,
            supplier.bank,
            supplier.bik,
            supplier.kbe,
            supplier.vat,
          ].every((v) => typeof v === "string" && v.trim())
        )
          throw new BadRequestException(
            "Реквизиты поставщика для выставления счетов не настроены",
          );
        const invoice = await tx.bankInvoice.create({
          data: {
            organizationId,
            issuedById: user.sub,
            requestKey,
            amountMinor: minor,
            snapshot: {},
            pdf: Buffer.alloc(0),
          },
        });
        const date = new Intl.DateTimeFormat("ru-RU", {
          timeZone: "Asia/Almaty",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(invoice.createdAt);
        const number =
          "ERSI-" +
          date.slice(-4) +
          "-" +
          String(invoice.number).padStart(6, "0");
        const orgPaymentId = "IO-" + String(org.billingNumber).padStart(6, "0");
        const purpose = `Пополнение авансового баланса ЕРСИ ГБО. ИО: ${org.name}. ID: ${orgPaymentId}. Счёт № ${number} от ${date}. ${supplier.vat}.`;
        const snapshot: InvoiceSnapshot = {
          templateVersion: "bank-invoice-v1",
          number,
          date,
          issuedAt: invoice.createdAt.toISOString(),
          amountMinor: minor.toString(),
          amountLabel: formatInvoiceAmount(minor),
          amountWords: invoiceAmountInWords(minor),
          buyerLegalName: legalName,
          buyerBin: org.bin,
          buyerAddress: [org.region, org.address].filter(Boolean).join(", "),
          orgSystemName: org.name,
          orgPaymentId,
          purpose,
          supplier,
        };
        const pdf = await renderBankInvoice(snapshot);
        const saved = await tx.bankInvoice.update({
          where: { id: invoice.id },
          data: { snapshot: JSON.parse(JSON.stringify(snapshot)), pdf },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.sub,
            action: "bank_invoice.issue",
            entity: "bank_invoice",
            entityId: invoice.id,
            metadata: {
              organizationId,
              number,
              amountMinor: minor.toString(),
              currency: "KZT",
              templateVersion: snapshot.templateVersion,
              status: "issued",
            },
          },
        });
        return this.summary(saved);
      },
      { timeout: 30000 },
    );
  }
  async list(user: RequestUser, organizationId: string) {
    await this.organization(this.prisma, user, organizationId);
    const rows = await this.prisma.bankInvoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        number: true,
        snapshot: true,
        status: true,
        createdAt: true,
      },
    });
    return { items: rows.map((row) => this.summary(row)) };
  }
  async pdf(user: RequestUser, id: string) {
    const invoice = await this.prisma.bankInvoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException("Счёт не найден");
    if (invoice.organizationId)
      await this.organization(this.prisma, user, invoice.organizationId);
    else if (
      !user.roles.some((role) => ["super_admin", "operator"].includes(role))
    )
      throw new ForbiddenException("Нет доступа к счёту");
    return {
      bytes: Buffer.from(invoice.pdf),
      filename:
        (invoice.snapshot as unknown as InvoiceSnapshot).number + ".pdf",
    };
  }
}
