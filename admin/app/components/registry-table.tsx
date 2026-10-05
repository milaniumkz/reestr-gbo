import { Organization, RegistryVehicle } from '@/lib/api';
import { statusLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

type RegistryTableProps = {
  rows: RegistryVehicle[];
  organizations: Organization[];
  statusFilter: string;
  organizationFilter: string;
  dateFrom: string;
  dateTo: string;
  onStatusFilter: (value: string) => void;
  onOrganizationFilter: (value: string) => void;
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onOpenCertificate: (number: string) => void;
};

export function RegistryTable({
  rows,
  organizations,
  statusFilter,
  organizationFilter,
  dateFrom,
  dateTo,
  onStatusFilter,
  onOrganizationFilter,
  onDateFrom,
  onDateTo,
  onApplyFilters,
  onResetFilters,
  onOpenCertificate,
}: RegistryTableProps) {
  return (
    <>
      <form
        className="inlineForm"
        onSubmit={(event) => {
          event.preventDefault();
          onApplyFilters();
        }}
      >
        <select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}>
          <option value="all">Все статусы</option>
          <option value="active">Активно</option>
          <option value="suspended">Ограничено</option>
          <option value="revoked">Аннулировано</option>
        </select>
        <select value={organizationFilter} onChange={(event) => onOrganizationFilter(event.target.value)}>
          <option value="">Все ИО</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(event) => onDateFrom(event.target.value)} />
        <input type="date" value={dateTo} onChange={(event) => onDateTo(event.target.value)} />
        <button type="submit">Фильтр</button>
        <button type="button" className="ghostButton" onClick={onResetFilters}>Сбросить</button>
      </form>
      <section className="table">
        <table>
          <thead>
            <tr>
              <th>VIN</th>
              <th>Госномер</th>
              <th>ТС</th>
              <th>Владелец</th>
              <th>ИО</th>
              <th>Свидетельство</th>
              <th>Статус / срок</th>
              <th>Баллон</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <EmptyTableRow colSpan={8} />}
            {rows.map((row) => {
              const certificate = row.certificates?.[0];
              const cylinder = row.cylinders?.[0];
              const owner = row.owners?.[0];
              return (
                <tr key={row.id}>
                  <td>{row.vin}</td>
                  <td>{row.plateNumber}</td>
                  <td>{row.make} {row.model}</td>
                  <td>{owner?.fullName ?? '-'}</td>
                  <td>{certificate?.inspection?.organization?.name ?? '-'}</td>
                  <td className="actions">
                    {certificate ? (
                      <button className="smallButton" type="button" onClick={() => onOpenCertificate(certificate.number)}>
                        {certificate.number}
                      </button>
                    ) : '-'}
                  </td>
                  <td>
                    {certificate ? (
                      <>
                        <span className="pill">{statusLabel(certificate.status)}</span>
                        <div className="muted">до {new Date(certificate.validUntil).toLocaleDateString('ru-RU')}</div>
                      </>
                    ) : '-'}
                  </td>
                  <td>{cylinder?.serialNumber ?? '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
