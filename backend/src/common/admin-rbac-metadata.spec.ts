import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { AuditController } from '../audit/audit.controller';
import { CertificatesController } from '../certificates/certificates.controller';
import { InspectionsController } from '../inspections/inspections.controller';
import { NotificationsController } from '../notifications/notifications.controller';
import { OrganizationsController } from '../organizations/organizations.controller';
import { RegistryController } from '../registry/registry.controller';
import { UsersController } from '../users/users.controller';
import { Role } from './roles';
import { ROLES_KEY } from './roles.decorator';

function roles(controller: object, method: string): Role[] {
  return Reflect.getMetadata(ROLES_KEY, controller[method as keyof typeof controller]) ?? [];
}

describe('admin API RBAC metadata', () => {
  it('keeps registry and certificate admin reads limited to admin roles', () => {
    expect(roles(AuditController.prototype, 'list')).toEqual([
      'operator',
      'nca',
      'government',
      'super_admin',
    ]);
    expect(roles(CertificatesController.prototype, 'list')).toEqual([
      'operator',
      'nca',
      'government',
      'super_admin',
    ]);
    expect(roles(RegistryController.prototype, 'publicChecks')).toEqual([
      'operator',
      'nca',
      'government',
      'super_admin',
    ]);
  });

  it('keeps management writes unavailable to read-only government and public roles', () => {
    expect(roles(OrganizationsController.prototype, 'create')).toEqual([
      'operator',
      'nca',
      'super_admin',
    ]);
    expect(roles(UsersController.prototype, 'create')).toEqual([
      'operator',
      'nca',
      'super_admin',
    ]);
    expect(roles(CertificatesController.prototype, 'setStatus')).toEqual([
      'operator',
      'nca',
      'super_admin',
    ]);
    expect(roles(InspectionsController.prototype, 'create')).toEqual([
      'inspection_org',
      'operator',
      'super_admin',
    ]);
  });

  it('keeps user and organization detail screens unavailable to read-only government role', () => {
    expect(roles(OrganizationsController.prototype, 'detail')).toEqual([
      'operator',
      'nca',
      'super_admin',
    ]);
    expect(roles(OrganizationsController.prototype, 'activity')).toEqual([
      'operator',
      'nca',
      'super_admin',
    ]);
    expect(roles(UsersController.prototype, 'detail')).toEqual([
      'operator',
      'nca',
      'super_admin',
    ]);
    expect(roles(UsersController.prototype, 'activity')).toEqual([
      'operator',
      'nca',
      'super_admin',
    ]);
  });

  it('keeps xlsx import available to managing admin roles and inspection organizations', () => {
    expect(roles(CertificatesController.prototype, 'listImportJobs')).toEqual([
      'inspection_org',
      'operator',
      'nca',
      'super_admin',
    ]);
    expect(roles(CertificatesController.prototype, 'importXlsx')).toEqual([
      'inspection_org',
      'operator',
      'nca',
      'super_admin',
    ]);
  });

  it('keeps notification read state available to every role that can list notifications', () => {
    expect(roles(NotificationsController.prototype, 'list')).toEqual([
      'inspection_org',
      'operator',
      'nca',
      'government',
      'super_admin',
    ]);
    expect(roles(NotificationsController.prototype, 'markRead')).toEqual([
      'inspection_org',
      'operator',
      'nca',
      'government',
      'super_admin',
    ]);
  });
});
