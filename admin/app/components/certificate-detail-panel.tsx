import { accreditationPeriod } from '../lib/accreditation';
import { AuditRow, CertificateRow, PublicCertificateCheckRow } from '@/lib/api';
import { statusLabel } from '../lib/labels';
import { Info, MiniTable } from './ui-primitives';
import { MediaViewer } from './media-viewer';

type CertificateDetailPanelProps = {
  certificate: CertificateRow;
  audit: AuditRow[];
  checks: PublicCertificateCheckRow[];
  onClose: () => void;
};

export function CertificateDetailPanel({
  certificate,
  audit,
  checks,
  onClose,
}: CertificateDetailPanelProps) {
  const owner = certificate.vehicle?.owners?.[0];
  const cylinder = certificate.vehicle?.cylinders?.[0];
  const inspection = certificate.inspection;

  return (
    <section className="detailPanel">
      <div className="tableHeader">
        <h2>Свидетельство {certificate.number}</h2>
        <button className="smallButton" type="button" onClick={onClose}>Назад</button>
      </div>
      <div className="detailGrid">
        <Info label="Статус" value={statusLabel(certificate.status)} />
        <Info label="Выдано" value={new Date(certificate.issuedAt).toLocaleDateString('ru-RU')} />
        <Info label="Действует до" value={new Date(certificate.validUntil).toLocaleDateString('ru-RU')} />
        <Info label="ИО" value={inspection?.organization?.name ?? '-'} />
        <Info label="Аттестат аккредитации" value={accreditationPeriod(inspection?.organization)} />
        <Info label="БИН ИО" value={inspection?.organization?.bin ?? '-'} />
        <Info label="Адрес ИО" value={inspection?.organization?.address ?? '-'} />
        <Info label="VIN" value={certificate.vehicle?.vin ?? '-'} />
        <Info label="Госномер" value={certificate.vehicle?.plateNumber ?? '-'} />
        <Info label="ТС" value={certificate.vehicle ? `${certificate.vehicle.make} ${certificate.vehicle.model}` : '-'} />
        <Info label="Год" value={certificate.vehicle?.year ? String(certificate.vehicle.year) : '-'} />
        <Info label="Владелец" value={owner?.fullName ?? '-'} />
        <Info label="ИИН/БИН владельца" value={owner?.iin ?? '-'} />
        <Info label="Адрес владельца" value={owner?.address ?? '-'} />
        <Info label="Телефон владельца" value={owner?.user?.phone ?? '-'} />
        <Info label="Баллон" value={cylinder?.serialNumber ?? '-'} />
        <Info label="Производитель" value={cylinder?.manufacturer ?? '-'} />
        <Info label="Объем" value={cylinder?.volumeLiters ? `${cylinder.volumeLiters} л` : '-'} />
        <Info label="Редуктор" value={cylinder?.reducerName ?? '-'} />
        <Info label="ЭБУ" value={cylinder?.controlUnitName ?? '-'} />
        <Info label="Место инспекции" value={inspection?.address ?? coords(inspection?.lat, inspection?.lng)} />
        <Info label="Сотрудник" value={person(inspection?.createdBy)} />
        <Info label="Отправил на проверку" value={person(inspection?.submittedBy)} />
        <Info label="Руководитель ИО" value={person(inspection?.approvedBy)} />
        <Info label="Отправлено на проверку" value={inspection?.submittedAt ? new Date(inspection.submittedAt).toLocaleString('ru-RU') : '-'} />
        <Info label="Опубликовано в реестре" value={inspection?.approvedAt ? new Date(inspection.approvedAt).toLocaleString('ru-RU') : '-'} />
      </div>
      <h3>Фото и документы</h3>
      <div className="mediaGrid">
        <MediaViewer items={inspection?.photos ?? []} />
      </div>
      <h3>Audit</h3>
      <MiniTable
        headers={['Время', 'Пользователь', 'Действие']}
        rows={audit.map((row) => [
          new Date(row.createdAt).toLocaleString('ru-RU'),
          row.actor?.phone ?? '-',
          row.action,
        ])}
      />
      <h3>Проверки свидетельства</h3>
      <MiniTable
        headers={['Время', 'Госномер', 'VIN-3', 'Результат', 'Адрес']}
        rows={checks.map((row) => [
          new Date(row.createdAt).toLocaleString('ru-RU'),
          row.plateNumber,
          row.vinLast3,
          row.found ? 'найдено' : 'не найдено',
          row.address ?? coords(row.lat, row.lng),
        ])}
      />
    </section>
  );
}

function coords(lat?: number, lng?: number) {
  return typeof lat === 'number' && typeof lng === 'number' ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '-';
}

function person(value?: { fullName?: string; phone?: string }) {
  if (!value) return '-';
  return [value.fullName, value.phone].filter(Boolean).join(' · ') || '-';
}
