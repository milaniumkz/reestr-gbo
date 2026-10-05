import { FormEvent } from 'react';
import { Organization, UserRow } from '@/lib/api';
import { roleLabel, statusLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

type UsersTableProps = {
  users: UserRow[];
  organizations: Organization[];
  canManage: boolean;
  name: string;
  phone: string;
  iin: string;
  role: string;
  phoneFilter: string;
  fullNameFilter: string;
  roleFilter: string;
  statusFilter: string;
  organizationFilter: string;
  lastLoginFrom: string;
  lastLoginTo: string;
  filterRoleOptions: string[];
  roleOptions: string[];
  canGrantSystemRoles: boolean;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onIin: (value: string) => void;
  onRole: (value: string) => void;
  onPhoneFilter: (value: string) => void;
  onFullNameFilter: (value: string) => void;
  onRoleFilter: (value: string) => void;
  onStatusFilter: (value: string) => void;
  onOrganizationFilter: (value: string) => void;
  onLastLoginFrom: (value: string) => void;
  onLastLoginTo: (value: string) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onSubmit: (event: FormEvent) => void;
  onToggle: (user: UserRow) => void;
  onGrantRole: (user: UserRow, role: string) => void;
  onRevokeRole: (user: UserRow, role: string) => void;
  onOpen?: (user: UserRow) => void;
};

export function UsersTable({
  users,
  organizations,
  canManage,
  name,
  phone,
  iin,
  role,
  phoneFilter,
  fullNameFilter,
  roleFilter,
  statusFilter,
  organizationFilter,
  lastLoginFrom,
  lastLoginTo,
  filterRoleOptions,
  roleOptions,
  canGrantSystemRoles,
  onName,
  onPhone,
  onIin,
  onRole,
  onPhoneFilter,
  onFullNameFilter,
  onRoleFilter,
  onStatusFilter,
  onOrganizationFilter,
  onLastLoginFrom,
  onLastLoginTo,
  onApplyFilters,
  onResetFilters,
  onSubmit,
  onToggle,
  onGrantRole,
  onRevokeRole,
  onOpen,
}: UsersTableProps) {
  return (
    <>
      <form
        className="inlineForm"
        onSubmit={(event) => {
          event.preventDefault();
          onApplyFilters();
        }}
      >
        <input placeholder="Телефон" value={phoneFilter} onChange={(event) => onPhoneFilter(normalizeKzPhone(event.target.value))} />
        <input placeholder="ФИО" value={fullNameFilter} onChange={(event) => onFullNameFilter(event.target.value)} />
        <select value={roleFilter} onChange={(event) => onRoleFilter(event.target.value)}>
          <option value="">Все роли</option>
          {filterRoleOptions.map((item) => (
            <option key={item} value={item}>{roleLabel(item)}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}>
          <option value="all">Все статусы</option>
          <option value="active">Активно</option>
          <option value="blocked">Заблокировано</option>
        </select>
        <select value={organizationFilter} onChange={(event) => onOrganizationFilter(event.target.value)}>
          <option value="">Все организации</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
        <input aria-label="Последний вход от" type="date" value={lastLoginFrom} onChange={(event) => onLastLoginFrom(event.target.value)} />
        <input aria-label="Последний вход до" type="date" value={lastLoginTo} onChange={(event) => onLastLoginTo(event.target.value)} />
        <button type="submit">Фильтр</button>
        <button type="button" className="ghostButton" onClick={onResetFilters}>Сбросить</button>
      </form>
      {canManage && (
        <form className="wideForm" onSubmit={onSubmit}>
          <input placeholder="ФИО" value={name} onChange={(event) => onName(event.target.value)} />
          <input placeholder="Телефон" value={phone} onChange={(event) => onPhone(normalizeKzPhone(event.target.value))} />
          <input placeholder="ИИН" value={iin} onChange={(event) => onIin(event.target.value)} />
          <select value={role} onChange={(event) => onRole(event.target.value)}>
            {roleOptions.map((item) => (
              <option key={item} value={item}>{roleLabel(item)}</option>
            ))}
          </select>
          <button type="submit">Создать пользователя</button>
        </form>
      )}
      <section className="table">
        <table>
          <thead>
            <tr>
              <th>Пользователь</th>
              <th>Телефон</th>
              <th>Роли</th>
              <th>Организация</th>
              <th>Последний вход</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {!users.length && <EmptyTableRow colSpan={7} />}
            {users.map((row) => (
                <tr key={row.id}>
                  <td>{row.fullName}</td>
                  <td>{row.phone}</td>
                  <td>{row.roles.map((item) => roleLabel(item.role)).join(', ')}</td>
                  <td>
                    {(row.memberships ?? []).length ? (
                      <div className="stackText">
                        {(row.memberships ?? []).map((item) => (
                          <span key={`${row.id}-${item.organization?.id ?? item.role}`}>
                            {item.organization?.name ?? 'Организация'} · {roleLabel(item.role)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">Нет членства</span>
                    )}
                  </td>
                  <td>{row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString('ru-RU') : 'не входил'}</td>
                  <td><span className="pill">{statusLabel(row.isBlocked ? 'blocked' : 'active')}</span></td>
                  <td className="actions">
                    {onOpen && (
                      <button className="smallButton" type="button" onClick={() => onOpen(row)}>
                        Открыть
                      </button>
                    )}
                    {canManage && (
                      <button className="smallButton" type="button" onClick={() => onToggle(row)}>
                        {row.isBlocked ? 'Разблокировать' : 'Блокировать'}
                      </button>
                    )}
                    {canManage && canGrantSystemRoles && (
                      <select
                        aria-label={`Назначить или снять роль ${row.fullName}`}
                        defaultValue=""
                        onChange={(event) => {
                          const [action, roleValue] = event.target.value.split(':');
                          event.target.value = '';
                          if (!roleValue) return;
                          if (action === 'add') onGrantRole(row, roleValue);
                          if (action === 'remove') onRevokeRole(row, roleValue);
                        }}
                      >
                        <option value="">Роли</option>
                        {roleOptions.map((roleValue) => {
                          const hasRole = row.roles.some((item) => item.role === roleValue);
                          return (
                            <option
                              key={roleValue}
                              value={`${hasRole ? 'remove' : 'add'}:${roleValue}`}
                            >
                              {hasRole ? `Убрать ${roleLabel(roleValue)}` : `Дать ${roleLabel(roleValue)}`}
                            </option>
                          );
                        })}
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

function normalizeKzPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '+7';
  if (digits.startsWith('7')) return `+${digits}`;
  if (digits.startsWith('8')) return `+7${digits.slice(1)}`;
  return `+7${digits}`;
}
