// Run on the production host from the backend directory after a backup.
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const backendRequire = createRequire(`${process.cwd()}/package.json`);
const { PrismaClient } = backendRequire('@prisma/client');
const bcrypt = backendRequire('bcryptjs');
const prisma = new PrismaClient();
async function main() {
  const { password } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  if (typeof password !== 'string' || password.length < 20) throw Error('Missing strong review password');
  const phone = '+77000000991';
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing && existing.fullName !== 'Store Review — ERSI GBO') throw Error('Review phone already belongs to another account');
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    const user = existing || await tx.user.create({ data: {
      phone, fullName: 'Store Review — ERSI GBO', passwordHash,
      mustChangePassword: false,
    } });
    for (const role of ['vehicle_owner', 'inspection_org', 'operator']) {
      await tx.userRole.upsert({ where: { userId_role: { userId: user.id, role } }, update: {}, create: { userId: user.id, role } });
    }
    for (const [bin, type, name, role] of [
      ['000000009901', 'inspection_org', 'ТЕСТ — Store Review — Инспекционный орган', 'inspector'],
      ['000000009902', 'operator', 'ТЕСТ — Store Review — Установщик', 'operator'],
    ]) {
      const org = await tx.organization.findUnique({ where: { bin } });
      if (org && org.name !== name) throw Error('Review organization identifier collision');
      const organization = org || await tx.organization.create({ data: { bin, type, name, status: 'active', region: 'Тестовые данные', address: 'Тестовая организация для проверки магазинами; не оказывает услуги' } });
      await tx.organizationMember.upsert({ where: { organizationId_userId_role: { organizationId: organization.id, userId: user.id, role } }, update: {}, create: { organizationId: organization.id, userId: user.id, role } });
      if (type === 'inspection_org') {
        await tx.organizationMember.upsert({ where: { organizationId_userId_role: { organizationId: organization.id, userId: user.id, role: 'admin' } }, update: {}, create: { organizationId: organization.id, userId: user.id, role: 'admin' } });
        await tx.balance.upsert({ where: { organizationId: organization.id }, update: {}, create: { organizationId: organization.id, amount: 0, currency: 'KZT' } });
        const qualityPhone = '+77000000993';
        const qualityName = 'Store Review Quality — ERSI GBO';
        const existingQuality = await tx.user.findUnique({ where: { phone: qualityPhone } });
        if (existingQuality && existingQuality.fullName !== qualityName) throw Error('Review quality phone identifier collision');
        if (existingQuality && !await bcrypt.compare(password, existingQuality.passwordHash)) throw Error('Review quality password differs; no reset performed');
        const quality = existingQuality || await tx.user.create({ data: { phone: qualityPhone, fullName: qualityName, passwordHash, mustChangePassword: false } });
        const otherMembership = await tx.organizationMember.findFirst({ where: { userId: quality.id, organizationId: { not: organization.id } } });
        if (otherMembership) throw Error('Review quality account belongs to another organization');
        await tx.userRole.upsert({ where: { userId_role: { userId: quality.id, role: 'inspection_org' } }, update: {}, create: { userId: quality.id, role: 'inspection_org' } });
        await tx.organizationMember.upsert({ where: { organizationId_userId_role: { organizationId: organization.id, userId: quality.id, role: 'quality_control' } }, update: {}, create: { organizationId: organization.id, userId: quality.id, role: 'quality_control' } });
      }
    }
  });
  console.log('Review account and two explicitly labelled test organizations prepared');
}
main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error('Review provisioning failed:', error.code || error.name,
    error.message === 'Review phone already belongs to another account' ? error.message : '');
  process.exitCode = 1;
});
