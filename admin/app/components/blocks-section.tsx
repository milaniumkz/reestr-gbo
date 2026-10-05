import { AuditRow, CertificateRow, Organization, UserRow } from '@/lib/api';
import { roleLabel, statusLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

type BlocksSectionProps = {
  organizations: Organization[];
  users: UserRow[];
  certificates: CertificateRow[];
  audit: AuditRow[];
  canManage: boolean;
  reason: string;
  onReason: (value: string) => void;
  onToggleOrganization: (org: Organization) => void;
  onToggleUser: (user: UserRow) => void;
  onToggleCertificate: (certificate: CertificateRow) => void;
  onOpenOrganization: (org: Organization) => void;
  onOpenUser: (user: UserRow) => void;
  onOpenCertificate: (certificate: CertificateRow) => void;
};

export function BlocksSection({
  organizations,
  users,
  certificates,
  audit,
  canManage,
  reason,
  onReason,
  onToggleOrganization,
  onToggleUser,
  onToggleCertificate,
  onOpenOrganization,
  onOpenUser,
  onOpenCertificate,
}: BlocksSectionProps) {
  return (
    <>
      {canManage && (
        <div className="uploadBar">
          <span className="label">Причина блокировки</span>
          <input placeholder="Причина" value={reason} onChange={(event) => onReason(event.target.value)} />
        </div>
      )}
      <BlockedSummary
        organizations={organizations.filter((item) => item.status === 'blocked')}
        users={users.filter((item) => item.isBlocked)}
        certificates={certificates.filter((item) => item.status !== 'active')}
        audit={audit}
      />
      <BlockManagementTables
        organizations={organizations}
        users={users}
        certificates={certificates}
        audit={audit}
        canManage={canManage}
        onToggleOrganization={onToggleOrganization}
        onToggleUser={onToggleUser}
        onToggleCertificate={onToggleCertificate}
        onOpenOrganization={onOpenOrganization}
        onOpenUser={onOpenUser}
        onOpenCertificate={onOpenCertificate}
      />
    </>
  );
}

function BlockedSummary({
  organizations,
  users,
  certificates,
  audit,
}: {
  organizations: Organization[];
  users: UserRow[];
  certificates: CertificateRow[];
  audit: AuditRow[];
}) {
  const rows = [
    ...organizations.map((item) => {
      const info = blockAuditInfo(audit, 'organization', item.id);
      return ['ИО', item.name, info.reason, info.actor, info.createdAt];
    }),
    ...users.map((item) => {
      const info = blockAuditInfo(audit, 'user', item.id);
      return ['Пользователь', `${item.fullName} · ${item.phone}`, info.reason, info.actor, info.createdAt];
    }),
    ...certificates.map((item) => {
      const info = certificateAuditInfo(audit, item);
      return ['Свидетельство', `${item.number} · ${item.status}`, info.reason, info.actor, info.createdAt];
    }),
  ];
  return (
    <section className="detailPanel compactPanel">
      <div className="tableHeader">
        <h2>Детали блокировок</h2>
      </div>
      <SimpleTable headers={['Тип', 'Объект', 'Причина', 'Кто', 'Когда']} rows={rows} />
    </section>
  );
}

function BlockManagementTables({
  organizations,
  users,
  certificates,
  audit,
  canManage,
  onToggleOrganization,
  onToggleUser,
  onToggleCertificate,
  onOpenOrganization,
  onOpenUser,
  onOpenCertificate,
}: {
  organizations: Organization[];
  users: UserRow[];
  certificates: CertificateRow[];
  audit: AuditRow[];
  canManage: boolean;
  onToggleOrganization: (org: Organization) => void;
  onToggleUser: (user: UserRow) => void;
  onToggleCertificate: (certificate: CertificateRow) => void;
  onOpenOrganization: (org: Organization) => void;
  onOpenUser: (user: UserRow) => void;
  onOpenCertificate: (certificate: CertificateRow) => void;
}) {
  return (
    <>
      <section className="table sectionGap">
        <div className="tableHeader">
          <h2>Инспекционные органы</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>ИО</th>
              <th>БИН</th>
              <th>Регион</th>
              <th>Статус</th>
              <th>Причина</th>
              <th>Кто / когда</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!organizations.length && <EmptyTableRow colSpan={7} />}
            {organizations.map((org) => {
              const info = blockAuditInfo(audit, 'organization', org.id);
              return (
                <tr key={org.id}>
                  <td>{org.name}</td>
                  <td>{org.bin}</td>
                  <td>{org.region ?? '-'}</td>
                  <td><span className="pill">{statusLabel(org.status)}</span></td>
                  <td>{org.status === 'blocked' ? info.reason : '-'}</td>
                  <td>{org.status === 'blocked' ? `${info.actor} · ${info.createdAt}` : '-'}</td>
                  <td className="actions">
                    <button className="smallButton" type="button" onClick={() => onOpenOrganization(org)}>Открыть</button>
                    {canManage && (
                      <button className="smallButton" type="button" onClick={() => onToggleOrganization(org)}>
                        {org.status === 'blocked' ? 'Разблокировать' : 'Блокировать'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="table sectionGap">
        <div className="tableHeader">
          <h2>Пользователи</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Телефон</th>
              <th>Роли</th>
              <th>Статус</th>
              <th>Причина</th>
              <th>Кто / когда</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!users.length && <EmptyTableRow colSpan={7} />}
            {users.map((row) => {
              const info = blockAuditInfo(audit, 'user', row.id);
              return (
                <tr key={row.id}>
                  <td>{row.fullName}</td>
                  <td>{row.phone}</td>
                  <td>{row.roles.map((item) => roleLabel(item.role)).join(', ')}</td>
                  <td><span className="pill">{statusLabel(row.isBlocked ? 'blocked' : 'active')}</span></td>
                  <td>{row.isBlocked ? info.reason : '-'}</td>
                  <td>{row.isBlocked ? `${info.actor} · ${info.createdAt}` : '-'}</td>
                  <td className="actions">
                    <button className="smallButton" type="button" onClick={() => onOpenUser(row)}>Открыть</button>
                    {canManage && (
                      <button className="smallButton" type="button" onClick={() => onToggleUser(row)}>
                        {row.isBlocked ? 'Разблокировать' : 'Блокировать'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="table sectionGap">
        <div className="tableHeader">
          <h2>Свидетельства</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Номер</th>
              <th>ТС</th>
              <th>ИО</th>
              <th>Статус</th>
              <th>Причина</th>
              <th>Кто / когда</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!certificates.length && <EmptyTableRow colSpan={7} />}
            {certificates.map((certificate) => {
              const info = certificateAuditInfo(audit, certificate);
              return (
                <tr key={certificate.id}>
                  <td>{certificate.number}</td>
                  <td>{certificate.vehicle ? `${certificate.vehicle.plateNumber} · ${certificate.vehicle.vin}` : '-'}</td>
                  <td>{certificate.inspection?.organization?.name ?? '-'}</td>
                  <td><span className="pill">{statusLabel(certificate.status)}</span></td>
                  <td>{certificate.status !== 'active' ? info.reason : '-'}</td>
                  <td>{certificate.status !== 'active' ? `${info.actor} · ${info.createdAt}` : '-'}</td>
                  <td className="actions">
                    <button className="smallButton" type="button" onClick={() => onOpenCertificate(certificate)}>Открыть</button>
                    {canManage && (
                      <button className="smallButton" type="button" onClick={() => onToggleCertificate(certificate)}>
                        {certificate.status === 'active' ? 'Ограничить' : 'Вернуть в активные'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

function blockAuditInfo(audit: AuditRow[], entity: string, entityId: string) {
  const row = latestAudit(audit, (item) =>
    item.entity === entity && item.entityId === entityId && item.action.endsWith('.block')
  );
  const reason = row?.metadata?.reason;
  return {
    reason: typeof reason === 'string' && reason.trim() ? reason : '-',
    actor: row?.actor ? `${row.actor.fullName} · ${row.actor.phone}` : '-',
    createdAt: row?.createdAt ? new Date(row.createdAt).toLocaleString('ru-RU') : '-',
  };
}

function certificateAuditInfo(audit: AuditRow[], certificate: CertificateRow) {
  const row = latestAudit(audit, (item) =>
    item.entity === 'certificate' &&
    (item.entityId === certificate.number || item.entityId === certificate.id) &&
    item.action === 'certificate.status.update'
  );
  const reason = row?.metadata?.reason;
  return {
    reason: typeof reason === 'string' && reason.trim() ? reason : '-',
    actor: row?.actor ? `${row.actor.fullName} · ${row.actor.phone}` : '-',
    createdAt: row?.createdAt ? new Date(row.createdAt).toLocaleString('ru-RU') : '-',
  };
}

function latestAudit(audit: AuditRow[], predicate: (item: AuditRow) => boolean) {
  return audit
    .filter(predicate)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table className="miniTable">
      <thead>
        <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={headers.length}>Нет данных</td></tr>
        ) : rows.map((row, index) => (
          <tr key={`${row.join('-')}-${index}`}>
            {row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
