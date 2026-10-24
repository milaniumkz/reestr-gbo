import { BadRequestException } from "@nestjs/common";
export function parseInvoiceAmount(value: unknown): bigint {
  if (typeof value !== "string")
    throw new BadRequestException("Введите сумму в тенге");
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(value.replace(/\s/g, ""));
  if (!match)
    throw new BadRequestException(
      "Сумма должна быть положительным числом, не более двух знаков после запятой",
    );
  const amount =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (amount <= 0n || amount > 10_000_000_000n)
    throw new BadRequestException(
      "Допустимая сумма: от 0,01 до 100 000 000 тенге",
    );
  return amount;
}
export function formatInvoiceAmount(amount: bigint): string {
  return (
    (amount / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") +
    "," +
    (amount % 100n).toString().padStart(2, "0")
  );
}
const units = [
  "",
  "один",
  "два",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
];
const teens = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];
const tens = [
  "",
  "",
  "двадцать",
  "тридцать",
  "сорок",
  "пятьдесят",
  "шестьдесят",
  "семьдесят",
  "восемьдесят",
  "девяносто",
];
const hundreds = [
  "",
  "сто",
  "двести",
  "триста",
  "четыреста",
  "пятьсот",
  "шестьсот",
  "семьсот",
  "восемьсот",
  "девятьсот",
];
function form(n: number, forms: string[]) {
  return n % 100 >= 11 && n % 100 <= 14
    ? forms[2]
    : n % 10 === 1
      ? forms[0]
      : n % 10 >= 2 && n % 10 <= 4
        ? forms[1]
        : forms[2];
}
function triad(n: number, female = false) {
  const out = [hundreds[Math.floor(n / 100)]];
  n %= 100;
  if (n >= 10 && n <= 19) out.push(teens[n - 10]);
  else {
    out.push(tens[Math.floor(n / 10)]);
    n %= 10;
    out.push(female && n === 1 ? "одна" : female && n === 2 ? "две" : units[n]);
  }
  return out.filter(Boolean).join(" ");
}
function words(n: number) {
  if (!n) return "ноль";
  const out: string[] = [];
  const scales = [
    {
      value: 1_000_000_000,
      forms: ["миллиард", "миллиарда", "миллиардов"],
      female: false,
    },
    {
      value: 1_000_000,
      forms: ["миллион", "миллиона", "миллионов"],
      female: false,
    },
    { value: 1000, forms: ["тысяча", "тысячи", "тысяч"], female: true },
  ];
  for (const scale of scales) {
    const count = Math.floor(n / scale.value);
    if (count) {
      out.push(triad(count, scale.female), form(count, scale.forms));
      n %= scale.value;
    }
  }
  if (n) out.push(triad(n));
  return out.join(" ");
}
export function invoiceAmountInWords(amount: bigint) {
  const whole = words(Number(amount / 100n));
  const cents = Number(amount % 100n);
  const value =
    whole +
    " тенге " +
    words(cents) +
    " " +
    form(cents, ["тиын", "тиына", "тиынов"]);
  return value[0].toUpperCase() + value.slice(1);
}
