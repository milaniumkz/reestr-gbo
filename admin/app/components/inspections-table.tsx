import { accreditationPeriod } from '../lib/accreditation';
import { Inspection, Organization } from '@/lib/api';
import { statusLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

type InspectionsTableProps = {
  inspections: Inspection[];
  organizations: Organization[];
  canManage: boolean;
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
  onStatusChange: (row: Inspection, status: string) => void;
  onCheck: (row: Inspection) => void;
  onOpen: (row: Inspection) => void;
  onOpenCertificate: (number: string) => void;
};

export function InspectionsTable({
  inspections,
  organizations,
  canManage,
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
  onStatusChange,
  onCheck,
  onOpen,
  onOpenCertificate,
}: InspectionsTableProps) {
  return (
    <>
      <section className="filterBar">
        <select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}>
          <option value="all">Все статусы</option>
          <option value="draft">Черновик</option>
          <option value="submitted">На проверке</option>
          <option value="approved">В реестре</option>
          <option value="rejected">Отклонено</option>
        </select>
        <select value={organizationFilter} onChange={(event) => onOrganizationFilter(event.target.value)}>
          <option value="">Все ИО</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(event) => onDateFrom(event.target.value)} />
        <input type="date" value={dateTo} onChange={(event) => onDateTo(event.target.value)} />
        <button type="button" onClick={onApplyFilters}>Применить</button>
        <button type="button" className="ghostButton" onClick={onResetFilters}>Сбросить</button>
      </section>
      <section className="table">
        <table>
          <thead>
            <tr>
              <th>VIN</th>
              <th>Госномер</th>
              <th>Организация</th>
              <th>Статус</th>
              <th>Файлы</th>
              <th>Владелец</th>
              <th>Сотрудник</th>
              <th>Руководитель</th>
              <th>Место инспекции</th>
              <th>Отправлено</th>
              <th>Опубликовано</th>
              <th>Свидетельство</th>
              <th>Создано</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!inspections.length && <EmptyTableRow colSpan={14} />}
            {inspections.map((row) => (
              <tr key={row.id}>
                <td>{row.vehicle?.vin ?? '-'}</td>
                <td>{row.vehicle?.plateNumber ?? '-'}</td>
                <td>{row.organization?.name ?? '-'}<div className="muted">{accreditationPeriod(row.organization)}</div></td>
                <td><span className="pill">{statusLabel(row.status)}</span></td>
                <td>{row.photos?.length ?? 0}</td>
                <td>
                  {row.vehicle?.owners?.[0]?.fullName ?? '-'}
                  {row.vehicle?.owners?.[0]?.address && (
                    <div className="muted">{row.vehicle.owners[0].address}</div>
                  )}
                </td>
                <td>
                  {row.createdBy?.fullName ?? row.submittedBy?.fullName ?? '-'}
                  {(row.createdBy?.phone || row.submittedBy?.phone) && (
                    <div className="muted">{row.createdBy?.phone ?? row.submittedBy?.phone}</div>
                  )}
                  {row.submittedAt && <div className="muted">на проверку: {new Date(row.submittedAt).toLocaleString('ru-RU')}</div>}
                </td>
                <td>
                  {row.approvedBy?.fullName ?? '-'}
                  {row.approvedBy?.phone && <div className="muted">{row.approvedBy.phone}</div>}
                  {row.approvedAt && <div className="muted">в реестр: {new Date(row.approvedAt).toLocaleString('ru-RU')}</div>}
                </td>
                <td>
                  {row.address ?? '-'}
                  {typeof row.lat === 'number' && typeof row.lng === 'number' && (
                    <div className="muted">
                      <a
                        className="link"
                        href={`https://www.openstreetmap.org/?mlat=${row.lat}&mlon=${row.lng}#map=18/${row.lat}/${row.lng}`}
                        target="_blank"
                      >
                        {row.lat.toFixed(6)}, {row.lng.toFixed(6)}
                      </a>
                    </div>
                  )}
                </td>
                <td>{row.submittedAt ? new Date(row.submittedAt).toLocaleString('ru-RU') : '-'}</td>
                <td>{row.approvedAt ? new Date(row.approvedAt).toLocaleString('ru-RU') : '-'}</td>
                <td>
                  {row.certificate ? (
                    <button
                      className="smallButton"
                      type="button"
                      onClick={() => onOpenCertificate(row.certificate!.number)}
                    >
                      {row.certificate.number}
                    </button>
                  ) : row.certificateNumber ?? '-'}
                </td>
                <td>{new Date(row.createdAt).toLocaleDateString('ru-RU')}</td>
                <td className="actions">
                  <button className="smallButton" type="button" onClick={() => onOpen(row)}>
                    Открыть
                  </button>
                  <button className="smallButton" type="button" onClick={() => onCheck(row)}>
                    Готовность
                  </button>
                  {canManage && (
                    <select
                      aria-label={`Статус инспекции ${row.id}`}
                      value={row.status}
                      onChange={(event) => onStatusChange(row, event.target.value)}
                    >
                      <option value="draft">Черновик</option>
                      <option value="submitted">На проверке</option>
                      <option value="rejected">Отклонено</option>
                      <option value="blocked">Заблокировано</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
