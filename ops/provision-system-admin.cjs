'use strict';
const fs = require('node:fs');
const { PrismaClient } = require(require.resolve('@prisma/client', { paths: [process.cwd()] }));
const db = new PrismaClient();
(async () => {
  const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (!/^\+7\d{10}$/.test(config.phone) || !/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(config.passwordHash)) {
    throw new Error('Invalid administrator configuration');
  }
  await db.$transaction(async tx => {
    const existing = await tx.user.findUnique({ where: { phone: config.phone } });
    if (existing?.isBlocked) throw new Error('Account is blocked; explicit unblock required');
    const user = await tx.user.upsert({
      where: { phone: config.phone },
      create: { phone: config.phone, fullName: 'Администратор системы', passwordHash: config.passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
      update: { passwordHash: config.passwordHash, mustChangePassword: false, passwordVersion: { increment: 1 }, passwordChangedAt: new Date(), failedPasswordAttempts: 0, passwordLockedUntil: null },
    });
    await tx.userRole.upsert({ where: { userId_role: { userId: user.id, role: 'super_admin' } }, update: {}, create: { userId: user.id, role: 'super_admin' } });
    await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({ data: { action: 'support.system_admin.provision', entity: 'user', entityId: user.id, metadata: { source: 'owner-request', role: 'super_admin', runId: process.env.GITHUB_RUN_ID ?? null } } });
    const result = await tx.user.findUnique({ where: { id: user.id }, include: { roles: true } });
    if (!result || !result.roles.some(r => r.role === 'super_admin') || result.mustChangePassword) throw new Error('Administrator verification failed');
    console.log(JSON.stringify({ systemAdminReady: true, userId: user.id, role: 'super_admin' }));
  });
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
