import { ListSummary } from '@/lib/api';
import { Metric } from './ui-primitives';

export function ListStatistics({ kind, summary }: { kind: 'inspections' | 'certificates'; summary?: ListSummary }) {
  if (!summary) return <p role="status">Статистика загружается…</p>;
  const count = (status: string) => summary.byStatus[status] ?? 0;
  const metrics: [string, number][] = kind === 'inspections'
    ? [
        ['Всего инспекций', summary.total],
        ['Выдано свидетельств', summary.issuedCertificates ?? 0],
        ['В работе', count('draft') + count('submitted') + count('quality_approved')],
        ['На исправлении / заблокировано', count('rejected') + count('blocked')],
      ]
    : [
        ['Всего выдано свидетельств', summary.total],
        ['Активные', count('active')],
        ['Ограниченные', count('suspended')],
        ['Аннулированные', count('revoked')],
      ];
  return <section aria-label={kind === 'inspections' ? 'Статистика инспекций' : 'Статистика свидетельств'}>
    <p className="muted">По выбранному ИО и фильтрам · все страницы</p>
    <div className="grid">{metrics.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>
  </section>;
}
