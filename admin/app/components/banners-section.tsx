import { FormEvent } from 'react';
import { API_BASE_URL, BannerRow } from '@/lib/api';
import { statusLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

type BannersSectionProps = {
  banners: BannerRow[];
  title: string;
  linkUrl: string;
  durationSeconds: string;
  startsAt: string;
  endsAt: string;
  onTitle: (value: string) => void;
  onLinkUrl: (value: string) => void;
  onDurationSeconds: (value: string) => void;
  onStartsAt: (value: string) => void;
  onEndsAt: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggle: (banner: BannerRow) => void;
  onDelete: (banner: BannerRow) => void;
};

export function BannersSection({
  banners,
  title,
  linkUrl,
  durationSeconds,
  startsAt,
  endsAt,
  onTitle,
  onLinkUrl,
  onDurationSeconds,
  onStartsAt,
  onEndsAt,
  onSubmit,
  onToggle,
  onDelete,
}: BannersSectionProps) {
  return (
    <>
      <form className="wideForm" onSubmit={onSubmit}>
        <input name="file" type="file" accept="image/*" required />
        <input placeholder="Название" value={title} onChange={(event) => onTitle(event.target.value)} />
        <input placeholder="Ссылка для перехода" value={linkUrl} onChange={(event) => onLinkUrl(event.target.value)} />
        <input placeholder="Секунд на баннер" value={durationSeconds} onChange={(event) => onDurationSeconds(event.target.value)} />
        <input type="datetime-local" value={startsAt} onChange={(event) => onStartsAt(event.target.value)} />
        <input type="datetime-local" value={endsAt} onChange={(event) => onEndsAt(event.target.value)} />
        <button type="submit">Загрузить баннер</button>
      </form>
      <section className="table">
        <table>
          <thead>
            <tr>
              <th>Фото</th>
              <th>Название</th>
              <th>Ссылка</th>
              <th>Листание</th>
              <th>Срок</th>
              <th>Статус</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!banners.length && <EmptyTableRow colSpan={7} />}
            {banners.map((banner) => (
              <tr key={banner.id}>
                <td>
                  <img className="bannerThumb" src={absoluteUrl(banner.imageUrl)} alt={banner.title} />
                </td>
                <td>{banner.title}</td>
                <td className="truncateCell">{banner.linkUrl || '-'}</td>
                <td>{banner.durationSeconds || 5} сек.</td>
                <td>
                  <div className="stackText">
                    <span>{banner.startsAt ? new Date(banner.startsAt).toLocaleString('ru-RU') : 'сразу'}</span>
                    <span>{banner.endsAt ? new Date(banner.endsAt).toLocaleString('ru-RU') : 'без срока'}</span>
                  </div>
                </td>
                <td><span className="pill">{statusLabel(banner.isActive ? 'active' : 'hidden')}</span></td>
                <td>
                  <div className="actions">
                    <button className="smallButton" type="button" onClick={() => onToggle(banner)}>
                      {banner.isActive ? 'Скрыть' : 'Показать'}
                    </button>
                    <button className="smallButton dangerButton" type="button" onClick={() => onDelete(banner)}>
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

function absoluteUrl(value: string) {
  if (!value) return '';
  if (/^https?:\/\//.test(value)) return value;
  return `${API_BASE_URL.replace(/\/api\/v1$/, '')}${value}`;
}
