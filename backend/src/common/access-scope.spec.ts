import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, jest } from '@jest/globals';
import { assertOrganizationAccess, hasGlobalAccess, userOrganizationIds } from './access-scope';
import { RequestUser } from './current-user';

function prisma(ids: string[]) {
  return {
    organizationMember: {
      findMany: jest.fn(async () => ids.map((organizationId) => ({ organizationId }))),
    },
  };
}

describe('access scope', () => {
  const scopedUser: RequestUser = {
    sub: 'user_1',
    phone: '+77001234567',
    roles: ['inspection_org'],
  };

  it('detects global roles', () => {
    expect(hasGlobalAccess(scopedUser)).toBe(false);
    expect(hasGlobalAccess({ ...scopedUser, roles: ['operator'] })).toBe(true);
    expect(hasGlobalAccess({ ...scopedUser, roles: ['super_admin'] })).toBe(true);
  });

  it('loads organization ids for scoped users', async () => {
    await expect(userOrganizationIds(prisma(['org_1', 'org_2']), scopedUser)).resolves.toEqual(['org_1', 'org_2']);
  });

  it('allows own organization access', async () => {
    await expect(assertOrganizationAccess(prisma(['org_1']), 'org_1', scopedUser)).resolves.toBeUndefined();
  });

  it('rejects foreign organization access', async () => {
    await expect(assertOrganizationAccess(prisma(['org_1']), 'org_2', scopedUser)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows global roles without membership lookup', async () => {
    const db = prisma([]);
    await expect(assertOrganizationAccess(db, 'org_2', { ...scopedUser, roles: ['nca'] })).resolves.toBeUndefined();
    expect(db.organizationMember.findMany).not.toHaveBeenCalled();
  });
});
