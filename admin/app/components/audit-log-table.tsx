import { AuditRow, Organization, UserRow } from '@/lib/api';
import { roleLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

type AuditLogTableProps = {
  rows: AuditRow[];
  entity: string;
  action: string;
  actorId: string;
  organizationId: string;
  dateFrom: string;
  dateTo: string;
  users: UserRow[];
  organizations: Organization[];
  onEntity: (value: string) => void;
  onAction: (value: string) => void;
  onActorId: (value: string) => void;
  onOrganizationId: (value: string) => void;
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

export function AuditLogTable({
  rows,
  entity,
  action,
  actorId,
  organizationId,
  dateFrom,
  dateTo,
  users,
  organizations,
  onEntity,
  onAction,
  onActorId,
  onOrganizationId,
  onDateFrom,
  onDateTo,
  onApply,
  onReset,
}: AuditLogTableProps) {
  return (
    <>
      <form
        className="wideForm"
        onSubmit={(event) => {
          event.preventDefault();
          onApply();
        }}
      >
        <input placeholder="Сущность" value={entity} onChange={(event) => onEntity(event.target.value)} />
        <input placeholder="Действие" value={action} onChange={(event) => onAction(event.target.value)} />
        {users.length ? (
          <select value={actorId} onChange={(event) => onActorId(event.target.value)}>
            <option value="">Любой пользователь</option>
            {users.map((row) => (
              <option key={row.id} value={row.id}>
                {row.fullName} · {row.phone}
              </option>
            ))}
          </select>
        ) : (
          <input
            placeholder="Телефон или ФИО пользователя"
            value={actorId}
            onChange={(event) => onActorId(event.target.value)}
          />
        )}
        <select value={organizationId} onChange={(event) => onOrganizationId(event.target.value)}>
          <option value="">Любая организация</option>
          {organizations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(event) => onDateFrom(event.target.value)} />
        <input type="date" value={dateTo} onChange={(event) => onDateTo(event.target.value)} />
        <button type="submit">Фильтр</button>
        <button type="button" className="ghostButton" onClick={onReset}>
          Сбросить
        </button>
      </form>
      <section className="table">
        <table>
          <thead>
            <tr>
              <th>Время</th>
              <th>Актор</th>
              <th>Роль</th>
              <th>Действие</th>
              <th>Сущность</th>
              <th>Entity ID</th>
              <th>IP</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <EmptyTableRow colSpan={8} />}
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
                <td>{row.actor ? `${row.actor.fullName} · ${row.actor.phone}` : '-'}</td>
                <td>{row.actor?.roles?.map((item) => roleLabel(item.role)).join(', ') || '-'}</td>
                <td>{row.action}</td>
                <td>{row.entity}</td>
                <td>{row.entityId ?? '-'}</td>
                <td>{row.ipAddress ?? '-'}</td>
                <td><code>{JSON.stringify(row.metadata ?? {})}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
