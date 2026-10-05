import { ListMeta, Organization } from '@/lib/api';
import { OrganizationsTable } from './organizations-table';
import { Metric } from './ui-primitives';

export function DashboardSection({
  organizations,
  inspectionsCount,
  importJobsCount,
  registryCount,
  listMeta,
  canManage,
  onToggleOrganization,
}: {
  organizations: Organization[];
  inspectionsCount: number;
  importJobsCount: number;
  registryCount: number;
  listMeta: Record<string, ListMeta>;
  canManage: boolean;
  onToggleOrganization: (organization: Organization) => void;
}) {
  return (
    <>
      <section className="grid">
        <Metric label="Организации" value={listMeta.organizations?.total ?? organizations.length} />
        <Metric label="Инспекции" value={listMeta.inspections?.total ?? inspectionsCount} />
        <Metric label="XLSX импорты" value={listMeta.importJobs?.total ?? importJobsCount} />
        <Metric label="ТС в реестре" value={listMeta.registry?.total ?? registryCount} />
      </section>
      {canManage && (
        <OrganizationsTable
          organizations={organizations.slice(0, 8)}
          onToggle={onToggleOrganization}
          compact
        />
      )}
    </>
  );
}
