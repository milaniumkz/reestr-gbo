import { AuditRow, Inspection } from '@/lib/api';
import { statusLabel } from '../lib/labels';
import { Info, MiniTable } from './ui-primitives';
import { MediaViewer } from './media-viewer';

type InspectionDetailPanelProps = {
  inspection: Inspection;
  audit: AuditRow[];
  onClose: () => void;
};

export function InspectionDetailPanel({
  inspection,
  audit,
  onClose,
}: InspectionDetailPanelProps) {
  const owner = inspection.vehicle?.owners?.[0];
  const cylinder = inspection.vehicle?.cylinders?.[0];

  return (
    <section className="detailPanel">
      <div className="tableHeader">
        <h2>Инспекция {inspection.certificate?.number ?? inspection.id.slice(0, 8)}</h2>
        <button className="smallButton" type="button" onClick={onClose}>Назад</button>
      </div>
      <div className="detailGrid">
        <Info label="Статус" value={statusLabel(inspection.status)} />
        <Info label="Свидетельство" value={inspection.certificate?.number ?? inspection.certificateNumber ?? '-'} />
        <Info label="ИО" value={inspection.organization?.name ?? '-'} />
        <Info label="VIN" value={inspection.vehicle?.vin ?? '-'} />
        <Info label="Госномер" value={inspection.vehicle?.plateNumber ?? '-'} />
        <Info label="ТС" value={inspection.vehicle ? `${inspection.vehicle.make ?? '-'} ${inspection.vehicle.model ?? ''}`.trim() : '-'} />
        <Info label="Год ТС" value={inspection.vehicle?.year ? String(inspection.vehicle.year) : '-'} />
        <Info label="Владелец" value={owner?.fullName ?? '-'} />
        <Info label="ИИН/БИН владельца" value={owner?.iin ?? '-'} />
        <Info label="Адрес проживания" value={owner?.address ?? '-'} />
        <Info label="Баллон" value={cylinder?.serialNumber ?? '-'} />
        <Info label="Производитель баллона" value={cylinder?.manufacturer ?? '-'} />
        <Info label="Объем баллона" value={cylinder?.volumeLiters ? `${cylinder.volumeLiters} л` : '-'} />
        <Info label="Срок баллона" value={cylinder?.validUntil ? new Date(cylinder.validUntil).toLocaleDateString('ru-RU') : '-'} />
        <Info label="Редуктор" value={cylinder?.reducerName ?? '-'} />
        <Info label="ЭБУ" value={cylinder?.controlUnitName ?? '-'} />
        <Info label="Место инспекции" value={inspection.address ?? coords(inspection.lat, inspection.lng)} />
        <Info label="Сотрудник" value={inspection.createdBy ? `${inspection.createdBy.fullName} · ${inspection.createdBy.phone}` : '-'} />
        <Info label="Отправил на проверку" value={inspection.submittedBy ? `${inspection.submittedBy.fullName} · ${inspection.submittedBy.phone}` : '-'} />
        <Info label="Руководитель" value={inspection.approvedBy ? `${inspection.approvedBy.fullName} · ${inspection.approvedBy.phone}` : '-'} />
        <Info label="Создано" value={new Date(inspection.createdAt).toLocaleString('ru-RU')} />
        <Info label="Отправлено на проверку" value={inspection.submittedAt ? new Date(inspection.submittedAt).toLocaleString('ru-RU') : '-'} />
        <Info label="Опубликовано в реестре" value={inspection.approvedAt ? new Date(inspection.approvedAt).toLocaleString('ru-RU') : '-'} />
        <Info label="Автопубликация" value={inspection.autoPublishAt ? new Date(inspection.autoPublishAt).toLocaleString('ru-RU') : '-'} />
      </div>
      <h3>Фото и документы</h3>
      <div className="mediaGrid">
        <MediaViewer items={inspection.photos ?? []} />
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
    </section>
  );
}

function coords(lat?: number, lng?: number) {
  return typeof lat === 'number' && typeof lng === 'number' ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '-';
}
