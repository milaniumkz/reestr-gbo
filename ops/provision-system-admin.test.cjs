const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(__dirname + '/provision-system-admin.cjs', 'utf8');
async function run(config, existing = null) {
  const writes = [], errors = [], output = [];
  const tx = {
    user: { findUnique: async () => existing ?? { id: 'requested', roles: [{ role: 'super_admin' }], mustChangePassword: false }, upsert: async args => { writes.push(['user', args]); return { id: 'requested' }; } },
    userRole: { upsert: async args => writes.push(['role', args]) },
    session: { updateMany: async args => writes.push(['session', args]) },
    auditLog: { create: async args => writes.push(['audit', args]) },
  };
  let done;
  const completed = new Promise(resolve => { done = resolve; });
  const req = Object.assign(name => name === 'node:fs' ? { readFileSync: () => JSON.stringify(config) } : { PrismaClient: class { $transaction(fn) { return fn(tx); } $disconnect() { done(); } } }, { resolve: () => 'prisma' });
  const processMock = { argv: ['', '', 'config'], cwd: () => '.', env: {} };
  vm.runInNewContext(code, { require: req, console: { log: value => output.push(value), error: value => errors.push(value) }, process: processMock, Date });
  await completed;
  return { writes, errors, output, exitCode: processMock.exitCode };
}
const config = { phone: '+77000000000', passwordHash: '$2b$12$' + 'a'.repeat(53) };
test('provisions only requested phone and system role, revokes only its sessions', async () => {
  const result = await run(config);
  assert.equal(result.errors.length, 0);
  assert.equal(result.writes[0][1].where.phone, config.phone);
  assert.equal(result.writes[1][1].create.role, 'super_admin');
  assert.equal(result.writes[2][1].where.userId, 'requested');
  assert.equal(result.writes[3][1].data.entityId, 'requested');
  assert.ok(result.output.every(value => !value.includes(config.passwordHash)));
});
test('rejects blocked accounts before any mutation', async () => {
  const result = await run(config, { id: 'blocked', isBlocked: true });
  assert.equal(result.exitCode, 1);
  assert.equal(result.writes.length, 0);
});
test('rejects invalid configuration before any mutation', async () => {
  const result = await run({ ...config, phone: 'invalid' });
  assert.equal(result.exitCode, 1);
  assert.equal(result.writes.length, 0);
});
