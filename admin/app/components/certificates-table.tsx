import { accreditationPeriod } from '../lib/accreditation';
import { CertificateRow, Organization } from '@/lib/api';
import { statusLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

type CertificatesTableProps = {
  rows: CertificateRow[];
  organizations: Organization[];
  canManage: boolean;
  plate: string;
  vinLast3: string;
  status: string;
  organizationId: string;
  dateFrom: string;
  dateTo: string;
  onPlate: (value: string) => void;
  onVinLast3: (value: string) => void;
  onStatus: (value: string) => void;
  onOrganizationId: (value: string) => void;
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onStatusChange: (row: CertificateRow, status: string) => void;
  onOpen: (row: CertificateRow) => void;
};

export function CertificatesTable({
  rows,
  organizations,
  canManage,
  plate,
  vinLast3,
  status,
  organizationId,
  dateFrom,
  dateTo,
  onPlate,
  onVinLast3,
  onStatus,
  onOrganizationId,
  onDateFrom,
  onDateTo,
  onApplyFilters,
  onResetFilters,
  onStatusChange,
  onOpen,
}: CertificatesTableProps) {
  return (
    <section className="table">
      <form
        className="wideForm"
        onSubmit={(event) => {
          event.preventDefault();
          onApplyFilters();
        }}
      >
        <input placeholder="Госномер" value={plate} onChange={(event) => onPlate(event.target.value.toUpperCase().replace(/\s+/g, ''))} />
        <input placeholder="Последние 3 VIN" maxLength={3} value={vinLast3} onChange={(event) => onVinLast3(event.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 3))} />
        <select value={status} onChange={(event) => onStatus(event.target.value)}>
          <option value="all">Все статусы</option>
          <option value="active">Активно</option>
          <option value="suspended">Ограничено</option>
          <option value="revoked">Аннулировано</option>
        </select>
        <select value={organizationId} onChange={(event) => onOrganizationId(event.target.value)}>
          <option value="">Любой ИО</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(event) => onDateFrom(event.target.value)} />
        <input type="date" value={dateTo} onChange={(event) => onDateTo(event.target.value)} />
        <button type="submit">Фильтр</button>
        <button type="button" className="ghostButton" onClick={onResetFilters}>Сбросить</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Номер</th>
            <th>ТС</th>
            <th>Владелец</th>
            <th>Организация</th>
            <th>Статус</th>
            <th>Выдано</th>
            <th>Срок</th>
            <th>Просмотры</th>
            <th>Действие</th>
          </tr>
        </thead>
        <tbody>
          {!rows.length && <EmptyTableRow colSpan={9} />}
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.number}</td>
              <td>{row.vehicle ? `${row.vehicle.vin} · ${row.vehicle.plateNumber}` : '-'}</td>
              <td>{row.vehicle?.owners?.[0]?.fullName ?? '-'}</td>
              <td>{row.inspection?.organization?.name ?? '-'}<div className="muted">{accreditationPeriod(row.inspection?.organization)}</div></td>
              <td><span className="pill">{statusLabel(row.status)}</span></td>
              <td>{new Date(row.issuedAt).toLocaleDateString('ru-RU')}</td>
              <td>{new Date(row.validUntil).toLocaleDateString('ru-RU')}</td>
              <td>{row._count?.views ?? 0}</td>
              <td className="actions">
                <button className="smallButton" type="button" onClick={() => onOpen(row)}>
                  Открыть
                </button>
                {canManage && (
                  <select
                    aria-label={`Статус свидетельства ${row.number}`}
                    value={row.status}
                    onChange={(event) => onStatusChange(row, event.target.value)}
                  >
                    <option value="active">Активно</option>
                    <option value="suspended">Ограничено</option>
                    <option value="revoked">Аннулировано</option>
                  </select>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
