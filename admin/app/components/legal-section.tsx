import { FormEvent } from 'react';
import { LegalDocumentRow } from '@/lib/api';
import { statusLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

type Props = {
  items: LegalDocumentRow[];
  title: string;
  excerpt: string;
  body: string;
  onTitle: (value: string) => void;
  onExcerpt: (value: string) => void;
  onBody: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggle: (item: LegalDocumentRow) => void;
  onDelete: (item: LegalDocumentRow) => void;
};

export function LegalSection({
  items,
  title,
  excerpt,
  body,
  onTitle,
  onExcerpt,
  onBody,
  onSubmit,
  onToggle,
  onDelete,
}: Props) {
  return (
    <>
      <form className="wideForm" onSubmit={onSubmit}>
        <input placeholder="Название закона" value={title} onChange={(event) => onTitle(event.target.value)} />
        <input placeholder="Короткая вырезка для карточки" value={excerpt} onChange={(event) => onExcerpt(event.target.value)} />
        <textarea placeholder="Полный текст закона" value={body} onChange={(event) => onBody(event.target.value)} rows={8} />
        <button type="submit">Добавить закон</button>
      </form>
      <section className="table">
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th>Вырезка</th>
              <th>Статус</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!items.length && <EmptyTableRow colSpan={4} />}
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td>
                <td className="truncateCell">{item.excerpt || item.body}</td>
                <td><span className="pill">{statusLabel(item.isActive ? 'active' : 'hidden')}</span></td>
                <td>
                  <div className="actions">
                    <button className="smallButton" type="button" onClick={() => onToggle(item)}>
                      {item.isActive ? 'Скрыть' : 'Показать'}
                    </button>
                    <button className="smallButton dangerButton" type="button" onClick={() => onDelete(item)}>
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
