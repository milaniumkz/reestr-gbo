import { FormEvent } from 'react';
import { NotificationRow } from '@/lib/api';
import { roleLabel, statusLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

type NotificationsTableProps = {
  rows: NotificationRow[];
  canManage: boolean;
  title: string;
  body: string;
  role: string;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
  onRole: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onRead: (row: NotificationRow) => void;
  onDelete: (row: NotificationRow) => void;
};

export function NotificationsTable({
  rows,
  canManage,
  title,
  body,
  role,
  onTitle,
  onBody,
  onRole,
  onSubmit,
  onRead,
  onDelete,
}: NotificationsTableProps) {
  return (
    <>
      {canManage && (
        <form className="inlineForm" onSubmit={onSubmit}>
          <input placeholder="Заголовок" value={title} onChange={(event) => onTitle(event.target.value)} />
          <input placeholder="Текст уведомления" value={body} onChange={(event) => onBody(event.target.value)} />
          <select value={role} onChange={(event) => onRole(event.target.value)}>
            <option value="vehicle_owner">Проверка свидетельств</option>
            <option value="inspection_org">Инспекционный орган</option>
            <option value="operator">Оператор</option>
            <option value="nca">НЦА</option>
            <option value="government">Контрольный орган</option>
          </select>
          <button type="submit">Создать</button>
        </form>
      )}
      <section className="table">
        <table>
          <thead>
            <tr>
              <th>Заголовок</th>
              <th>Текст</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Дата</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <EmptyTableRow colSpan={6} />}
            {rows.map((row) => {
              const system = isSystemNotification(row);
              const personal = Boolean(row.userId);
              return (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{row.body}</td>
                  <td>{roleLabel(row.role)}</td>
                  <td><span className="pill">{statusLabel(system ? 'system' : row.readAt ? 'read' : 'new')}</span></td>
                  <td>{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
                  <td className="actions">
                    {system ? (
                      <span className="muted">Системное</span>
                    ) : (
                      <>
                        {personal && !row.readAt && (
                          <button className="smallButton" type="button" onClick={() => onRead(row)}>
                            Прочитано
                          </button>
                        )}
                        {canManage && (
                          <button className="smallButton" type="button" onClick={() => onDelete(row)}>
                            Удалить
                          </button>
                        )}
                      </>
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

function isSystemNotification(row: NotificationRow) {
  return row.id.includes(':');
}
