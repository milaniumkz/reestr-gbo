import { accreditationPeriod } from '../lib/accreditation';
import { AuditRow, Inspection, Organization, UserRow } from '@/lib/api';
import { roleLabel, statusLabel } from '../lib/labels';
import { Info, MiniTable } from './ui-primitives';

type UserDetailPanelProps = {
  user: UserRow & { memberships?: Array<{ role: string; organization?: Organization }>; createdInspections?: Inspection[] };
  activity: { audit?: AuditRow[]; created?: Inspection[]; submitted?: Inspection[]; approved?: Inspection[] } | null;
  onClose: () => void;
};

export function UserDetailPanel({
  user,
  activity,
  onClose,
}: UserDetailPanelProps) {
  const userInspections = uniqueInspections([
    ...(activity?.created ?? []),
    ...(activity?.submitted ?? []),
    ...(activity?.approved ?? []),
    ...(user.createdInspections ?? []),
  ]);

  return (
    <section className="detailPanel">
      <div className="tableHeader">
        <h2>{user.fullName}</h2>
        <button className="smallButton" type="button" onClick={onClose}>Назад</button>
      </div>
      <div className="detailGrid">
        <Info label="Телефон" value={user.phone} />
        <Info label="ИИН" value={user.iin ?? '-'} />
        <Info label="Роли" value={user.roles.map((item) => roleLabel(item.role)).join(', ')} />
        <Info label="Статус" value={statusLabel(user.isBlocked ? 'blocked' : 'active')} />
        <Info label="Последний вход" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ru-RU') : 'не входил'} />
        <Info label="Инспекции" value={`${activity?.created?.length ?? 0} создано, ${activity?.submitted?.length ?? 0} отправлено, ${activity?.approved?.length ?? 0} опубликовано`} />
      </div>
      <h3>Членство в ИО</h3>
      <MiniTable
        headers={['Организация', 'БИН', 'Роль']}
        rows={(user.memberships ?? []).map((item) => [
          item.organization?.type === 'inspection_org' ? `${item.organization.name} · ${accreditationPeriod(item.organization)}` : item.organization?.name ?? '-',
          item.organization?.bin ?? '-',
          roleLabel(item.role),
        ])}
      />
      <h3>История входов</h3>
      <MiniTable
        headers={['Время входа', 'Устройство', 'IP', 'Статус']}
        rows={(user.sessions ?? []).map((session) => [
          new Date(session.createdAt).toLocaleString('ru-RU'),
          session.deviceName ?? '-',
          session.ipAddress ?? '-',
          session.revokedAt
            ? `вышел ${new Date(session.revokedAt).toLocaleString('ru-RU')}`
            : `активна до ${new Date(session.expiresAt).toLocaleString('ru-RU')}`,
        ])}
      />
      <h3>Инспекции пользователя</h3>
      <MiniTable
        headers={['Дата', 'ИО', 'Госномер / VIN', 'Свидетельство', 'Статус']}
        rows={userInspections.slice(0, 20).map((inspection) => [
          new Date(inspection.createdAt).toLocaleString('ru-RU'),
          `${inspection.organization?.name ?? '-'} · ${accreditationPeriod(inspection.organization)}`,
          [inspection.vehicle?.plateNumber, inspection.vehicle?.vin].filter(Boolean).join(' · ') || '-',
          inspection.certificate?.number ?? inspection.certificateNumber ?? '-',
          statusLabel(inspection.status),
        ])}
      />
      <h3>Последние действия</h3>
      <MiniTable
        headers={['Время', 'Действие', 'Сущность']}
        rows={(activity?.audit ?? []).slice(0, 12).map((row) => [
          new Date(row.createdAt).toLocaleString('ru-RU'),
          row.action,
          row.entity,
        ])}
      />
    </section>
  );
}

function uniqueInspections(items: Inspection[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
