import { ListMeta } from '@/lib/api';

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="infoBox">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function MiniTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (!rows.length) return <div className="emptyBox">Нет данных</div>;
  return (
    <div className="miniTable">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyTableRow({ colSpan, label = 'Нет данных' }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td className="muted" colSpan={colSpan}>{label}</td>
    </tr>
  );
}

export function PaginationBar({
  meta,
  onPrev,
  onNext,
}: {
  meta: ListMeta;
  onPrev: () => void;
  onNext: () => void;
}) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.page * meta.limit, meta.total);
  const canPrev = meta.page > 1;
  const canNext = to < meta.total;

  return (
    <div className="paginationBar">
      <span>
        {from}-{to} из {meta.total}
      </span>
      <div className="paginationActions">
        <button className="smallButton" type="button" onClick={onPrev} disabled={!canPrev}>
          Назад
        </button>
        <span>Стр. {meta.page}</span>
        <button className="smallButton" type="button" onClick={onNext} disabled={!canNext}>
          Далее
        </button>
      </div>
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
