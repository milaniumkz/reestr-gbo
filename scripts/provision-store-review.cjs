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
  if (existing) {
    console.log('Existing review account preserved');
    return;
  }
  await prisma.user.create({ data: {
    phone, fullName: 'Store Review — ERSI GBO',
    passwordHash: await bcrypt.hash(password, 12), mustChangePassword: false,
    roles: { create: [{ role: 'vehicle_owner' }] },
  } });
  console.log('Review account created with vehicle_owner access');
}
main().finally(() => prisma.$disconnect()).catch((error) => {
  console.error('Review provisioning failed:', error.code || error.name,
    error.message === 'Review phone already belongs to another account' ? error.message : '');
  process.exitCode = 1;
});
