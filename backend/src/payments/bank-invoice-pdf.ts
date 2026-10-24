import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
export type InvoiceSnapshot = {
  templateVersion: string;
  issuedByUserId: string;
  number: string;
  date: string;
  issuedAt: string;
  amountMinor: string;
  amountLabel: string;
  amountWords: string;
  buyerLegalName: string;
  buyerBin: string;
  buyerAddress: string;
  orgSystemName: string;
  orgPaymentId: string;
  purpose: string;
  supplier: {
    name: string;
    iin: string;
    address: string;
    bank: string;
    iban: string;
    bik: string;
    kbe: string;
    vat: string;
  };
};
export async function renderBankInvoice(s: InvoiceSnapshot): Promise<Buffer> {
  const regular = [
    resolve(process.cwd(), "../assets/fonts/Roboto-Regular.ttf"),
    "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
  ].find(existsSync);
  const bold =
    [
      resolve(process.cwd(), "../assets/fonts/Roboto-Bold.ttf"),
      "/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ].find(existsSync) ?? regular;
  if (!regular) throw new Error("Шрифт для печати кириллицы не установлен");
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 42.5,
      info: {
        Title: "Счёт на оплату № " + s.number,
        Author: s.supplier.name,
        CreationDate: new Date(s.issuedAt),
        ModDate: new Date(s.issuedAt),
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.registerFont("regular", regular);
    doc.registerFont("bold", bold!);
    doc.font("regular").fontSize(10.5).fillColor("black");
    const left = 42.5,
      width = 510;
    function room(height: number) {
      if (doc.y + height > 785) doc.addPage();
    }
    function paragraph(text: string, strong = false, size = 10.5) {
      doc.font(strong ? "bold" : "regular").fontSize(size);
      const h = doc.heightOfString(text, { width, lineGap: 2 });
      room(h + 7);
      doc.text(text, left, doc.y, { width, lineGap: 2 });
      doc.moveDown(0.35);
    }
    function table(rows: string[][], widths: number[], header = false) {
      rows.forEach((row, index) => {
        doc.font(header && index === 0 ? "bold" : "regular").fontSize(10);
        const heights = row.map((text, i) =>
          doc.heightOfString(text, { width: widths[i] - 12, lineGap: 1 }),
        );
        const height = Math.max(24, ...heights.map((h) => h + 12));
        room(height);
        const y = doc.y;
        let x = left;
        row.forEach((text, i) => {
          doc.lineWidth(0.6).rect(x, y, widths[i], height).stroke();
          doc.text(text, x + 6, y + 6, { width: widths[i] - 12, lineGap: 1 });
          x += widths[i];
        });
        doc.y = y + height;
      });
      doc.moveDown(0.5);
    }
    table(
      [
        ["Получатель: " + s.supplier.name, "ИИН", s.supplier.iin],
        ["Банк получателя: " + s.supplier.bank, "БИК", s.supplier.bik],
        ["ИИК: " + s.supplier.iban, "КБе", s.supplier.kbe],
        ["Валюта платежа: казахстанский тенге", "Код валюты", "KZT"],
      ],
      [317, 65, 128],
    );
    paragraph("Счёт на оплату № " + s.number + " от " + s.date, true, 14);
    paragraph("Поставщик: " + s.supplier.name, true);
    paragraph("Адрес поставщика: " + s.supplier.address);
    paragraph("Покупатель: " + s.buyerLegalName, true);
    paragraph("БИН покупателя: " + s.buyerBin);
    paragraph("Адрес покупателя: " + s.buyerAddress);
    table(
      [
        ["№", "Наименование", "Кол-во", "Ед.", "Цена, KZT", "Сумма, KZT"],
        [
          "1",
          "Аванс за услуги информационной системы «ЕРСИ ГБО» (пополнение авансового баланса)",
          "1",
          "услуга",
          s.amountLabel,
          s.amountLabel,
        ],
      ],
      [22, 230, 42, 48, 84, 84],
      true,
    );
    paragraph("Итого: " + s.amountLabel + " KZT", true);
    paragraph("НДС: " + s.supplier.vat);
    paragraph("Всего к оплате: " + s.amountLabel + " KZT", true);
    paragraph("Сумма прописью: " + s.amountWords);
    paragraph("В назначении платежа обязательно укажите:", true);
    paragraph(s.purpose);
    paragraph(
      "Индивидуальный предприниматель  __________________  Штрахова В. И.",
    );
    paragraph(
      "Счёт предназначен для внесения аванса. Не является актом оказанных услуг, электронным счётом-фактурой (ЭСФ) или подтверждением оплаты.",
      false,
      9,
    );
    doc.end();
  });
}
