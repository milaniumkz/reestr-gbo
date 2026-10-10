import { accreditationPeriod } from '../lib/accreditation';
import { FormEvent, useEffect, useState } from 'react';
import { Inspection, Organization, OrganizationActivity, UserRow } from '@/lib/api';
import { roleLabel, statusLabel } from '../lib/labels';
import { Info, MiniTable } from './ui-primitives';

type OrganizationDetailPanelProps = {
  organization: Organization & { inspections?: Inspection[] };
  activity: OrganizationActivity | null;
  users: UserRow[];
  canManage: boolean;
  onSave: (
    organization: Organization,
    input: {
      name: string;
      bin: string;
      region: string;
      address: string;
      contactPhone: string;
      contactEmail: string;
      accreditationValidFrom: string;
      accreditationValidUntil: string;
      lat: string;
      lng: string;
    },
  ) => void;
  onAddMember: (input: {
    userId?: string;
    role: string;
    fullName?: string;
    phone?: string;
    iin?: string;
  }) => void;
  onRemoveMember?: (organization: Organization, memberId: string) => void;
  onDelete?: (organization: Organization) => void;
  onClose: () => void;
};

export function OrganizationDetailPanel({
  organization,
  activity,
  users,
  canManage,
  onSave,
  onAddMember,
  onRemoveMember,
  onDelete,
  onClose,
}: OrganizationDetailPanelProps) {
  const inspections = activity?.inspections ?? organization.inspections ?? [];
  const members = activity?.members ?? organization.members ?? [];
  const isInspectionOrg = organization.type === 'inspection_org';
  const canManageMembers = canManage && ['inspection_org', 'government', 'nca'].includes(organization.type);
  const createdCount = activity?.stats?.createdCount ?? inspections.length;
  const submittedCount = activity?.stats?.submittedCount ?? inspections.filter((item) => item.submittedAt || item.status === 'submitted' || item.status === 'approved').length;
  const publishedCount = activity?.stats?.publishedCount ?? inspections.filter((item) => item.certificate || item.status === 'approved').length;
  const [name, setName] = useState(organization.name);
  const [bin, setBin] = useState(organization.bin);
  const [region, setRegion] = useState(organization.region ?? '');
  const [address, setAddress] = useState(organization.address ?? '');
  const [contactPhone, setContactPhone] = useState(organization.contactPhone ?? '');
  const [accreditationValidFrom, setAccreditationValidFrom] = useState(organization.accreditationValidFrom?.slice(0, 10) ?? '');
  const [accreditationValidUntil, setAccreditationValidUntil] = useState(organization.accreditationValidUntil?.slice(0, 10) ?? '');
  const [contactEmail, setContactEmail] = useState(organization.contactEmail ?? '');
  const [lat, setLat] = useState(organization.lat === undefined ? '' : String(organization.lat));
  const [lng, setLng] = useState(organization.lng === undefined ? '' : String(organization.lng));
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState(isInspectionOrg ? (members.length ? 'inspector' : 'admin') : 'government');
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');
  const [memberIin, setMemberIin] = useState('');

  useEffect(() => {
    setMemberUserId('');
    setMemberRole(isInspectionOrg ? (members.length ? 'inspector' : 'admin') : 'government');
    setMemberName('');
    setMemberPhone('');
    setMemberIin('');
  }, [organization.id, members.length]);

  function submitMember(event: FormEvent) {
    event.preventDefault();
    onAddMember(memberUserId
      ? { userId: memberUserId, role: memberRole }
      : {
          role: memberRole,
          fullName: memberName,
          phone: memberPhone,
          iin: memberIin,
        });
  }

  return (
    <section className="detailPanel">
      <div className="tableHeader">
        <h2>{organization.name}</h2>
        <div className="inlineActions">
          {canManage && onDelete && <button className="smallButton" type="button" onClick={() => onDelete(organization)}>Удалить организацию</button>}
        <button className="smallButton" type="button" onClick={onClose}>Назад</button>
        </div>
      </div>
      {canManage && (
        <form
          className="wideForm flatForm"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(organization, { name, bin, region, address, contactPhone, contactEmail, accreditationValidFrom, accreditationValidUntil, lat, lng });
          }}
        >
          <input placeholder="Название" value={name} onChange={(event) => setName(event.target.value)} />
          <input placeholder="БИН" value={bin} onChange={(event) => setBin(event.target.value)} />
          <input placeholder="Регион" value={region} onChange={(event) => setRegion(event.target.value)} />
          <input placeholder="Адрес" value={address} onChange={(event) => setAddress(event.target.value)} />
          <input placeholder="Контактный телефон" value={contactPhone} onChange={(event) => setContactPhone(normalizeKzPhone(event.target.value))} />
          <input placeholder="Контактный email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
          {isInspectionOrg && <>
            <label>Аттестат аккредитации от<input type="date" required value={accreditationValidFrom} max={accreditationValidUntil || undefined} onChange={(event) => setAccreditationValidFrom(event.target.value)} /></label>
            <label>Аттестат аккредитации до<input type="date" required value={accreditationValidUntil} min={accreditationValidFrom || undefined} onChange={(event) => setAccreditationValidUntil(event.target.value)} /></label>
          </>}
          <input placeholder="Широта" value={lat} onChange={(event) => setLat(event.target.value)} />
          <input placeholder="Долгота" value={lng} onChange={(event) => setLng(event.target.value)} />
          <button type="submit">Сохранить ИО</button>
        </form>
      )}
      <div className="detailGrid">
        {isInspectionOrg && <Info label="Аттестат аккредитации" value={accreditationPeriod(organization)} />}
        <Info label="БИН" value={organization.bin} />
        <Info label="Статус" value={statusLabel(organization.status)} />
        <Info label="Город/регион" value={organization.region ?? '-'} />
        <Info label="Адрес" value={organization.address ?? '-'} />
        <Info label="Контактный телефон" value={organization.contactPhone ?? '-'} />
        <Info label="Контактный email" value={organization.contactEmail ?? '-'} />
        <Info label="Координаты" value={coords(organization.lat, organization.lng)} />
        <Info label="Инспекции" value={`${createdCount} создано, ${submittedCount} отправлено, ${publishedCount} опубликовано`} />
      </div>
      {organization.type !== 'installer' && <h3>Руководители и сотрудники</h3>}
      {canManageMembers && (
        <form className="wideForm flatForm" onSubmit={submitMember}>
          <select value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)}>
            <option value="">Новый пользователь</option>
            {users.map((row) => (
              <option key={row.id} value={row.id}>
                {row.fullName} · {row.phone}
              </option>
            ))}
          </select>
          <input
            placeholder="ФИО сотрудника"
            value={memberName}
            disabled={Boolean(memberUserId)}
            onChange={(event) => setMemberName(event.target.value)}
          />
          <input
            placeholder="Телефон сотрудника"
            value={memberPhone}
            disabled={Boolean(memberUserId)}
            onChange={(event) => setMemberPhone(normalizeKzPhone(event.target.value))}
          />
          <input
            placeholder="ИИН сотрудника"
            value={memberIin}
            disabled={Boolean(memberUserId)}
            onChange={(event) => setMemberIin(event.target.value)}
          />
          <select value={memberRole} onChange={(event) => setMemberRole(event.target.value)}>
            {isInspectionOrg ? (
              <>
                <option value="admin">Руководитель ИО</option>
                <option value="inspector">Сотрудник ИО</option>
                <option value="quality_control">Контроль качества</option>
              </>
            ) : (
              <>
                <option value="government">Контрольный орган</option>
                <option value="nca">НЦА</option>
              </>
            )}
          </select>
          <button type="submit">{isInspectionOrg ? (members.length ? 'Добавить сотрудника' : 'Добавить руководителя') : 'Добавить номер'}</button>
        </form>
      )}
      {organization.type !== 'installer' && (
        <MiniTable
          headers={canManageMembers ? ['ФИО', 'Телефон', 'Роль', 'Последний вход', 'Действие'] : ['ФИО', 'Телефон', 'Роль', 'Последний вход']}
          rows={members.map((member) => [
            member.user?.fullName ?? '-',
            member.user?.phone ?? '-',
            memberRoleLabel(member.role, organization.type),
            member.user?.lastLoginAt ? new Date(member.user.lastLoginAt).toLocaleString('ru-RU') : 'не входил',
            ...(canManageMembers ? [`Удалить: ${member.id}`] : []),
          ])}
        />
      )}
      {canManageMembers && onRemoveMember && members.length > 0 && (
        <div className="inlineActions">
          {members.map((member) => (
            <button className="smallButton" type="button" key={member.id} onClick={() => onRemoveMember(organization, member.id)}>
              Удалить {member.user?.fullName || member.user?.phone || member.id}
            </button>
          ))}
        </div>
      )}
      <h3>Последние инспекции</h3>
      <MiniTable
        headers={['Дата', 'Госномер / VIN', 'Свидетельство', 'Статус', 'Сотрудник']}
        rows={inspections.slice(0, 20).map((inspection) => [
          new Date(inspection.createdAt).toLocaleString('ru-RU'),
          [inspection.vehicle?.plateNumber, inspection.vehicle?.vin].filter(Boolean).join(' · ') || '-',
          inspection.certificate?.number ?? inspection.certificateNumber ?? '-',
          statusLabel(inspection.status),
          inspection.createdBy ? `${inspection.createdBy.fullName} · ${inspection.createdBy.phone}` : '-',
        ])}
      />
      <h3>Последние действия</h3>
      <MiniTable
        headers={['Время', 'Пользователь', 'Действие']}
        rows={(activity?.audit ?? []).slice(0, 12).map((row) => [
          new Date(row.createdAt).toLocaleString('ru-RU'),
          row.actor?.phone ?? '-',
          row.action,
        ])}
      />
    </section>
  );
}

function normalizeKzPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '+7';
  if (digits.startsWith('7')) return `+${digits}`;
  if (digits.startsWith('8')) return `+7${digits.slice(1)}`;
  return `+7${digits}`;
}

function coords(lat?: number, lng?: number) {
  return typeof lat === 'number' && typeof lng === 'number' ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '-';
}

function memberRoleLabel(role: string, organizationType: string) {
  if (organizationType !== 'inspection_org') {
    return role === 'nca' ? 'НЦА' : 'Контрольный орган';
  }
  return roleLabel(role);
}
