import { accreditationPeriod } from '../lib/accreditation';
import { FormEvent } from 'react';
import { Organization, UserRow } from '@/lib/api';
import { roleLabel, statusLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

type OrganizationsTableProps = {
  organizations: Organization[];
  users?: UserRow[];
  onToggle: (org: Organization) => void;
  onOpen?: (org: Organization) => void;
  canManage?: boolean;
  compact?: boolean;
  name?: string;
  bin?: string;
  region?: string;
  address?: string;
  contactPhone?: string;
  contactEmail?: string;
  accreditationValidFrom?: string;
  accreditationValidUntil?: string;
  onAccreditationValidFrom?: (value: string) => void;
  onAccreditationValidUntil?: (value: string) => void;
  lat?: string;
  lng?: string;
  memberOrgId?: string;
  memberUserId?: string;
  memberRole?: string;
  memberName?: string;
  memberPhone?: string;
  memberIin?: string;
  statusFilter?: string;
  regionFilter?: string;
  onName?: (value: string) => void;
  onBin?: (value: string) => void;
  onRegion?: (value: string) => void;
  onAddress?: (value: string) => void;
  onContactPhone?: (value: string) => void;
  onContactEmail?: (value: string) => void;
  onLat?: (value: string) => void;
  onLng?: (value: string) => void;
  onMemberOrgId?: (value: string) => void;
  onMemberUserId?: (value: string) => void;
  onMemberRole?: (value: string) => void;
  onMemberName?: (value: string) => void;
  onMemberPhone?: (value: string) => void;
  onMemberIin?: (value: string) => void;
  onStatusFilter?: (value: string) => void;
  onRegionFilter?: (value: string) => void;
  onApplyFilters?: () => void;
  onResetFilters?: () => void;
  onSubmit?: (event: FormEvent) => void;
  onMemberSubmit?: (event: FormEvent) => void;
  onRemoveMember?: (org: Organization, memberId: string) => void;
};

export function OrganizationsTable({
  organizations,
  users = [],
  onToggle,
  onOpen,
  canManage = false,
  compact = false,
  name = '',
  bin = '',
  region = '',
  address = '',
  contactPhone = '',
  contactEmail = '',
  accreditationValidFrom = '',
  accreditationValidUntil = '',
  onAccreditationValidFrom,
  onAccreditationValidUntil,
  lat = '',
  lng = '',
  memberOrgId = '',
  memberUserId = '',
  memberRole = 'inspector',
  memberName = '',
  memberPhone = '',
  memberIin = '',
  statusFilter = 'all',
  regionFilter = '',
  onName,
  onBin,
  onRegion,
  onAddress,
  onContactPhone,
  onContactEmail,
  onLat,
  onLng,
  onMemberOrgId,
  onMemberUserId,
  onMemberRole,
  onMemberName,
  onMemberPhone,
  onMemberIin,
  onStatusFilter,
  onRegionFilter,
  onApplyFilters,
  onResetFilters,
  onSubmit,
  onMemberSubmit,
  onRemoveMember,
}: OrganizationsTableProps) {
  return (
    <>
      {!compact && onApplyFilters && (
        <form
          className="inlineForm"
          onSubmit={(event) => {
            event.preventDefault();
            onApplyFilters();
          }}
        >
          <select value={statusFilter} onChange={(event) => onStatusFilter?.(event.target.value)}>
            <option value="all">Все статусы</option>
            <option value="active">Активно</option>
            <option value="blocked">Заблокировано</option>
          </select>
          <input placeholder="Регион" value={regionFilter} onChange={(event) => onRegionFilter?.(event.target.value)} />
          <button type="submit">Фильтр</button>
          <button type="button" className="ghostButton" onClick={onResetFilters}>
            Сбросить
          </button>
        </form>
      )}
      {!compact && onSubmit && canManage && (
        <form className="wideForm" onSubmit={onSubmit}>
          <input placeholder="Название инспекционного органа" value={name} onChange={(event) => onName?.(event.target.value)} />
          <input placeholder="БИН" value={bin} onChange={(event) => onBin?.(event.target.value)} />
          <input placeholder="Регион" value={region} onChange={(event) => onRegion?.(event.target.value)} />
          <input placeholder="Адрес" value={address} onChange={(event) => onAddress?.(event.target.value)} />
          <input placeholder="Контактный телефон" value={contactPhone} onChange={(event) => onContactPhone?.(normalizeKzPhone(event.target.value))} />
          <input placeholder="Контактный email" value={contactEmail} onChange={(event) => onContactEmail?.(event.target.value)} />
          <label>Аттестат аккредитации от<input type="date" required value={accreditationValidFrom} max={accreditationValidUntil || undefined} onChange={(event) => onAccreditationValidFrom?.(event.target.value)} /></label>
          <label>Аттестат аккредитации до<input type="date" required value={accreditationValidUntil} min={accreditationValidFrom || undefined} onChange={(event) => onAccreditationValidUntil?.(event.target.value)} /></label>
          <input placeholder="Широта" value={lat} onChange={(event) => onLat?.(event.target.value)} />
          <input placeholder="Долгота" value={lng} onChange={(event) => onLng?.(event.target.value)} />
          <button type="submit">Создать организацию</button>
        </form>
      )}
      {!compact && onMemberSubmit && canManage && (
        <form className="wideForm" onSubmit={onMemberSubmit}>
          <select value={memberOrgId} onChange={(event) => onMemberOrgId?.(event.target.value)}>
            <option value="">Организация</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <select value={memberUserId} onChange={(event) => onMemberUserId?.(event.target.value)}>
            <option value="">Новый пользователь</option>
            {users.map((row) => (
              <option key={row.id} value={row.id}>
                {row.fullName} · {row.phone}
              </option>
            ))}
          </select>
          <input
            placeholder="ФИО нового участника"
            value={memberName}
            disabled={Boolean(memberUserId)}
            onChange={(event) => onMemberName?.(event.target.value)}
          />
          <input
            placeholder="Телефон нового участника"
            value={memberPhone}
            disabled={Boolean(memberUserId)}
            onChange={(event) => onMemberPhone?.(normalizeKzPhone(event.target.value))}
          />
          <input
            placeholder="ИИН нового участника"
            value={memberIin}
            disabled={Boolean(memberUserId)}
            onChange={(event) => onMemberIin?.(event.target.value)}
          />
          <select value={memberRole} onChange={(event) => onMemberRole?.(event.target.value)}>
            <option value="admin">Руководитель ИО</option>
            <option value="inspector">Сотрудник ИО</option>
          </select>
          <button type="submit">Добавить участника</button>
        </form>
      )}
      <section className="table">
        <table>
          <thead>
            <tr>
              <th>Инспекционный орган</th>
              <th>БИН</th>
              <th>Регион</th>
              <th>Контакты</th>
              <th>Участники</th>
              <th>Последний вход</th>
              <th>Статус</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!organizations.length && <EmptyTableRow colSpan={8} />}
            {organizations.map((org) => {
              const members = org.members ?? [];
              return (
                <tr key={org.id}>
                  <td>{org.name}{org.type === "inspection_org" && <div className="muted">{accreditationPeriod(org)}</div>}</td>
                  <td>{org.bin}</td>
                  <td>{org.region ?? '-'}</td>
                  <td>
                    <div className="stackText">
                      <span>{org.contactPhone ?? '-'}</span>
                      <span>{org.contactEmail ?? '-'}</span>
                    </div>
                  </td>
                  <td className="memberList">
                    {members.length
                      ? members.map((member) => (
                          <span className="memberPill" key={member.id}>
                            {member.user?.fullName ?? member.id} · {roleLabel(member.role)}
                            {!compact && canManage && onRemoveMember && (
                              <button type="button" onClick={() => onRemoveMember(org, member.id)}>×</button>
                            )}
                          </span>
                        ))
                      : '-'}
                  </td>
                  <td>
                    {members.length
                      ? members.map((member) => (
                          <div className="muted" key={`${member.id}-login`}>
                            {member.user?.phone ?? '-'} · {member.user?.lastLoginAt ? new Date(member.user.lastLoginAt).toLocaleString('ru-RU') : 'не входил'}
                          </div>
                        ))
                      : '-'}
                  </td>
                  <td><span className="pill">{statusLabel(org.status)}</span></td>
                  <td className="actions">
                    {onOpen && (
                      <button className="smallButton" type="button" onClick={() => onOpen(org)}>
                        Открыть
                      </button>
                    )}
                    {!compact && canManage && (
                      <button className="smallButton" type="button" onClick={() => onToggle(org)}>
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
    </>
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
