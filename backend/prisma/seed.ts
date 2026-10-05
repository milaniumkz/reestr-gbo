import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const cylinderManufacturers = [
  'STEP Fevzi Çakmak Mahallesi Büsan San. Sitesi Kosgeb Cad. 10646 Sk. No: 10-12-14 Karatay / KONYA / TURKEY',
  'ООО «Харпромтех» (Украина) Исполкомовская улица, 32, Харьков',
  'ОАО «Новогрудский завод газовой аппаратуры» (Беларусь) 231400, Новогрудок, Мицкевича, 109',
  'ООО «Балсити» г. Москва, улица Медиков, дом 12, пом. 1 ком. 15',
  'Atiker (Турция) Улица Хорозлухан, дом 5/A, 42120 Сельчуклу, Конья, Турция',
  'SAKA Fevzi Çakmak Mahallesi Büsan San. Sitesi Kosgeb Cad. 10646 Sk. No: 10-12-14 Karatay / KONYA / TURKEY',
  'STAKO Польша, 76-200 Slupsk ul. Poznanska 54',
  'ООО «Сфера» г. Саранск, поселок Ялга, ул. Пионерская, д. 10',
  'Polmokon Польша, производитель ELPIGAZ',
  'Kia Motors Corporation. 12, Хеолленг-ро, Сочо-гу, Сеул 06797, Южная Корея',
  'PPH BORMECH 76-270 Устка, Чарново 3, тел.: +48 598461134',
  'GASITALY Via Санта-Мария-Валле, 3 — 20123 Ломбардия, Милан, Италия',
  'JSC «ATRAMA» Raudondvario pl. 162, Lithuania',
  'BORMECH Польша, производство ELPIGAZ',
  '7 Baharestan, Karafarinan Blv, Industrial Pole, Shahrekord, Iran',
  '«СевКавГаз» 357340, Россия, Ставропольский край, г. Лермонтов, ул. Горная 9',
];

async function main() {
  const org = await prisma.organization.upsert({
    where: { bin: '123456789012' },
    update: {},
    create: {
      type: 'inspection_org',
      name: 'EcoGas Service',
      bin: '123456789012',
      address: 'Алматы, проспект Абая 12',
      region: 'Алматы',
      lat: 43.238949,
      lng: 76.889709,
      rating: 4.8,
    },
  });

  const user = await prisma.user.upsert({
    where: { phone: '+77001234567' },
    update: {},
    create: {
      phone: '+77001234567',
      fullName: 'Иванов Иван Иванович',
      iin: '900101300000',
      roles: { create: [{ role: 'vehicle_owner' }, { role: 'super_admin' }] },
    },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { vin: 'XTA210990Y1234567' },
    update: {},
    create: {
      vin: 'XTA210990Y1234567',
      plateNumber: '777 AAA 02',
      make: 'Lada',
      model: 'Vesta',
      year: 2022,
      owners: { create: [{ userId: user.id, fullName: user.fullName, iin: user.iin }] },
      cylinders: {
        create: [{
          serialNumber: 'GBO-2024-88421',
          manufacturer: 'TorusGas',
          volumeLiters: 54,
          validUntil: new Date('2027-08-15'),
        }],
      },
    },
  });

  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: 'vehicle_owner' } },
    update: {},
    create: { userId: user.id, role: 'vehicle_owner' },
  });
  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: 'super_admin' } },
    update: {},
    create: { userId: user.id, role: 'super_admin' },
  });

  const existingCertificate = await prisma.certificate.findUnique({
    where: { number: 'ERSI-2026-000001' },
    include: { inspection: true },
  });

  const inspection = existingCertificate?.inspection ?? await prisma.inspection.create({
    data: {
      organizationId: org.id,
      vehicleId: vehicle.id,
      status: 'approved',
      inspectorName: 'Ахметов Н.',
      submittedAt: new Date(),
      approvedAt: new Date(),
    },
  });

  await prisma.certificate.upsert({
    where: { number: 'ERSI-2026-000001' },
    update: {},
    create: {
      number: 'ERSI-2026-000001',
      vehicleId: vehicle.id,
      inspectionId: inspection.id,
      validUntil: new Date('2027-08-15'),
      qrPayload: 'ERSI-2026-000001:XTA210990Y1234567',
    },
  });

  const camera = await prisma.camera.findFirst({
    where: { organizationId: org.id, name: 'CAM-08' },
  });
  if (!camera) {
    await prisma.camera.create({ data: {
      organizationId: org.id,
      name: 'CAM-08',
      rtspUrlEncrypted: 'encrypted://demo',
      hlsPath: '/media/hls/cam-08/index.m3u8',
    } });
  }

  await prisma.tariff.upsert({
    where: { code: 'inspection_single' },
    update: {},
    create: {
      code: 'inspection_single',
      name: 'Одна инспекция ТС',
      amount: 2500,
      periodDays: 730,
    },
  });
  await prisma.tariff.upsert({
    where: { code: 'org_monthly' },
    update: {},
    create: {
      code: 'org_monthly',
      name: 'Месячный пакет инспекционного органа',
      amount: 45000,
      periodDays: 30,
    },
  });

  for (const name of cylinderManufacturers) {
    await prisma.gboEquipmentItem.upsert({
      where: { type_name: { type: 'cylinder_manufacturer', name } },
      update: { isActive: true },
      create: { type: 'cylinder_manufacturer', name },
    });
  }
}

main().finally(async () => prisma.$disconnect());
