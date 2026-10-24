"use strict";
const { PrismaClient } = require(
  require.resolve("@prisma/client", { paths: [process.cwd()] }),
);
const fs = require("node:fs");
const db = new PrismaClient();
(async () => {
  if (
    ![
      require("node:path").resolve(process.cwd(), "../assets/fonts/Roboto-Regular.ttf"),
      "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      "/Library/Fonts/Arial Unicode.ttf",
    ].some((path) => fs.existsSync(path))
  )
    throw Error("Cyrillic PDF font unavailable");
  const raw = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const fields = [
    "name",
    "iin",
    "address",
    "bank",
    "iban",
    "bik",
    "kbe",
    "vat",
  ];
  const value = Object.fromEntries(
    fields.map((key) => [key, String(raw[key] ?? "").trim()]),
  );
  if (
    fields.some((key) => !value[key] || value[key].length > 1000) ||
    !/^\d{12}$/.test(value.iin) ||
    !/^KZ[A-Z0-9]{18}$/.test(value.iban) ||
    !/^[A-Z0-9]{8}$/.test(value.bik) ||
    !/^\d{2}$/.test(value.kbe)
  )
    throw Error("Invalid supplier configuration");
  await db.$transaction(async (tx) => {
    await tx.technicalSetting.upsert({
      where: { key: "bank-invoice-supplier" },
      update: { value },
      create: { key: "bank-invoice-supplier", value },
    });
    await tx.auditLog.create({
      data: {
        action: "bank_invoice.supplier_configure",
        entity: "configuration",
        entityId: "bank-invoice-supplier",
        metadata: { source: "owner-authorized-support", fields },
      },
    });
  });
  console.log(
    "Bank invoice supplier configured; balance and payment settings unchanged",
  );
})()
  .catch((error) => {
    const message = ["Cyrillic PDF font unavailable", "Invalid supplier configuration"].includes(error.message) ? error.message : "Supplier configuration failed";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
