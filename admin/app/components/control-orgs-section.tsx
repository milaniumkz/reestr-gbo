import { FormEvent } from 'react';
import { Organization } from '@/lib/api';
import { roleLabel, statusLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

type ControlOrgsSectionProps = {
  organizations: Organization[];
  name: string;
  bin: string;
  phone: string;
  fullName: string;
  role: string;
  organizationId: string;
  onName: (value: string) => void;
  onBin: (value: string) => void;
  onPhone: (value: string) => void;
  onFullName: (value: string) => void;
  onRole: (value: string) => void;
  onOrganizationId: (value: string) => void;
  onCreate: (event: FormEvent) => void;
  onAddPhone: (event: FormEvent) => void;
  onOpen: (org: Organization) => void;
  onDelete: (org: Organization) => void;
  onRemoveMember: (org: Organization, memberId: string) => void;
};

export function ControlOrgsSection({
  organizations,
  name,
  bin,
  phone,
  fullName,
  role,
  organizationId,
  onName,
  onBin,
  onPhone,
  onFullName,
  onRole,
  onOrganizationId,
  onCreate,
  onAddPhone,
  onOpen,
  onDelete,
  onRemoveMember,
}: ControlOrgsSectionProps) {
  return (
    <>
      <form className="wideForm" onSubmit={onCreate}>
        <input placeholder="Название контрольного органа" value={name} onChange={(event) => onName(event.target.value)} />
        <input placeholder="БИН контрольного органа" value={bin} onChange={(event) => onBin(event.target.value)} />
        <button type="submit">Создать контрольный орган</button>
      </form>
      <form className="wideForm" onSubmit={onAddPhone}>
        <select value={organizationId} onChange={(event) => onOrganizationId(event.target.value)}>
          <option value="">Контрольный орган</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name} · {org.bin}
            </option>
          ))}
        </select>
        <input placeholder="ФИО" value={fullName} onChange={(event) => onFullName(event.target.value)} />
        <input placeholder="Телефон доступа" value={phone} onChange={(event) => onPhone(normalizeKzPhone(event.target.value))} />
        <select value={role} onChange={(event) => onRole(event.target.value)}>
          <option value="government">Контрольный орган</option>
          <option value="nca">НЦА</option>
        </select>
        <button type="submit">Добавить номер</button>
      </form>
      <section className="table">
        <table>
          <thead>
            <tr>
              <th>Контрольный орган</th>
              <th>БИН</th>
              <th>Номера доступа</th>
              <th>Статус</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!organizations.length && <EmptyTableRow colSpan={5} />}
            {organizations.map((org) => (
              <tr key={org.id}>
                <td>{org.name}</td>
                <td>{org.bin}</td>
                <td className="memberList">
                  {org.members?.length
                    ? org.members.map((member) => (
                        <span className="memberPill" key={member.id}>
                          {member.user?.phone ?? '-'} · {roleLabel(member.role)}
                          <button className="pillRemove" type="button" onClick={() => onRemoveMember(org, member.id)}>
                            ×
                          </button>
                        </span>
                      ))
                    : '-'}
                </td>
                <td><span className="pill">{statusLabel(org.status)}</span></td>
                <td>
                  <div className="actions">
                    <button className="smallButton" type="button" onClick={() => onOpen(org)}>
                      Открыть
                    </button>
                    <button className="smallButton dangerButton" type="button" onClick={() => onDelete(org)}>
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
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
