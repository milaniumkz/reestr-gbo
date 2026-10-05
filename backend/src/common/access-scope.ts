import { ForbiddenException } from '@nestjs/common';
import { RequestUser } from './current-user';

const globalRoles = new Set(['operator', 'nca', 'government', 'super_admin']);

export function hasGlobalAccess(user?: RequestUser) {
  return Boolean(user?.roles.some((role) => globalRoles.has(role)));
}

export async function userOrganizationIds(
  prisma: {
    organizationMember: {
      findMany(input: {
        where: { userId: string };
        select: { organizationId: true };
      }): Promise<Array<{ organizationId: string }>>;
    };
  },
  user?: RequestUser,
) {
  if (!user?.sub) return [];
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.sub },
    select: { organizationId: true },
  });
  return memberships.map((item) => item.organizationId);
}

export async function assertOrganizationAccess(
  prisma: Parameters<typeof userOrganizationIds>[0],
  organizationId: string,
  user?: RequestUser,
) {
  if (hasGlobalAccess(user)) return;
  const allowed = await userOrganizationIds(prisma, user);
  if (!allowed.includes(organizationId)) {
    throw new ForbiddenException('Organization is outside user scope');
  }
}
