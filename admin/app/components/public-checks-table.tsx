'use client';

import { PublicCertificateCheckRow } from '@/lib/api';
import { EmptyTableRow } from './ui-primitives';

export function PublicChecksTable({
  rows,
  found,
  onFound,
  plate,
  certificateNumber,
  dateFrom,
  dateTo,
  onPlate,
  onCertificateNumber,
  onDateFrom,
  onDateTo,
  onApply,
  onReset,
  onOpenCertificate,
}: {
  rows: PublicCertificateCheckRow[];
  found: string;
  onFound: (value: string) => void;
  plate: string;
  certificateNumber: string;
  dateFrom: string;
  dateTo: string;
  onPlate: (value: string) => void;
  onCertificateNumber: (value: string) => void;
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
  onOpenCertificate: (number: string) => void;
}) {
  return (
    <>
      <form className="wideForm" onSubmit={(event) => { event.preventDefault(); onApply(); }}>
        <select value={found} onChange={(event) => onFound(event.target.value)}>
          <option value="all">Все проверки</option>
          <option value="found">Найдено</option>
          <option value="not_found">Не найдено</option>
        </select>
        <input placeholder="Госномер" value={plate} onChange={(event) => onPlate(event.target.value.toUpperCase().replace(/\s+/g, ''))} />
        <input placeholder="Номер свидетельства" value={certificateNumber} onChange={(event) => onCertificateNumber(event.target.value)} />
        <input type="date" value={dateFrom} onChange={(event) => onDateFrom(event.target.value)} />
        <input type="date" value={dateTo} onChange={(event) => onDateTo(event.target.value)} />
        <button type="submit">Фильтр</button>
        <button type="button" className="ghostButton" onClick={onReset}>Сбросить</button>
        <span className="label">На странице: {rows.length}</span>
      </form>
      <section className="table">
        <table>
          <thead>
            <tr>
              <th>Время</th>
              <th>Госномер</th>
              <th>VIN 3</th>
              <th>Результат</th>
              <th>Свидетельство</th>
              <th>Адрес / координаты</th>
              <th>IP</th>
              <th>User-Agent</th>
              <th>Карта</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && <EmptyTableRow colSpan={9} />}
            {rows.map((row) => {
              const hasLocation = typeof row.lat === 'number' && typeof row.lng === 'number';
              const mapUrl = hasLocation
                ? `https://www.openstreetmap.org/?mlat=${row.lat}&mlon=${row.lng}#map=18/${row.lat}/${row.lng}`
                : '';
              return (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString('ru-RU')}</td>
                  <td>{row.plateNumber}</td>
                  <td>{row.vinLast3}</td>
                  <td><span className="pill">{row.found ? 'найдено' : 'не найдено'}</span></td>
                  <td>
                    {row.certificateNumber ? (
                      <button className="smallButton" type="button" onClick={() => onOpenCertificate(row.certificateNumber!)}>
                        {row.certificateNumber}
                      </button>
                    ) : '-'}
                  </td>
                  <td>
                    {row.address ?? '-'}
                    {hasLocation && <div className="muted">{row.lat?.toFixed(6)}, {row.lng?.toFixed(6)}</div>}
                  </td>
                  <td>{row.ipAddress ?? '-'}</td>
                  <td className="truncateCell" title={row.userAgent ?? ''}>{row.userAgent ?? '-'}</td>
                  <td>
                    {hasLocation ? (
                      <a className="smallButton" href={mapUrl} target="_blank" rel="noreferrer">Открыть на карте</a>
                    ) : '-'}
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
