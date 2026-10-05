import { FormEvent } from 'react';
import { CertificateImportJob, CertificateRow, Organization } from '@/lib/api';
import { statusLabel } from '../lib/labels';
import { EmptyTableRow, Info, MiniTable } from './ui-primitives';

type XlsxImportsTableProps = {
  importJobs: CertificateImportJob[];
  organizations: Organization[];
  canManage: boolean;
  selected: CertificateImportJob | null;
  statusFilter: string;
  organizationFilter: string;
  dateFrom: string;
  dateTo: string;
  onStatusFilter: (value: string) => void;
  onOrganizationFilter: (value: string) => void;
  onDateFrom: (value: string) => void;
  onDateTo: (value: string) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onUpload: (event: FormEvent<HTMLFormElement>) => void;
  onOpen: (row: CertificateImportJob) => void;
  onOpenCertificate: (row: CertificateRow) => void;
  onClose: () => void;
};

export function XlsxImportsTable({
  importJobs,
  organizations,
  canManage,
  selected,
  statusFilter,
  organizationFilter,
  dateFrom,
  dateTo,
  onStatusFilter,
  onOrganizationFilter,
  onDateFrom,
  onDateTo,
  onApplyFilters,
  onResetFilters,
  onUpload,
  onOpen,
  onOpenCertificate,
  onClose,
}: XlsxImportsTableProps) {
  const selectedVehicle = selected?.certificate?.vehicle;
  const selectedOwner = selectedVehicle?.owners?.[0];
  const selectedCylinder = selectedVehicle?.cylinders?.[0];
  const selectedInspection = selected?.certificate?.inspection;
  const selectedOrganization = selected?.organization ?? selectedInspection?.organization;

  if (selected) {
    return (
      <section className="detailPanel">
        <div className="tableHeader">
          <h2>{selected.filename}</h2>
          <button className="smallButton" type="button" onClick={onClose}>
            Назад
          </button>
        </div>
        <div className="detailGrid">
          <Info label="Статус" value={statusLabel(selected.status)} />
          <Info label="Файл" value={selected.objectKey} />
          <Info label="Создано" value={String(selected.createdCount)} />
          <Info label="Обновлено" value={String(selected.updatedCount)} />
          <Info label="Пропущено" value={String(selected.skippedCount)} />
          <Info label="Ошибки" value={String(selected.errorCount)} />
          <Info label="ИО" value={selectedOrganization?.name ?? selected.organizationId ?? '-'} />
          <Info label="Свидетельство" value={selected.certificate?.number ?? '-'} />
          <Info label="ТС" value={selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}` : '-'} />
          <Info label="VIN" value={selectedVehicle?.vin ?? '-'} />
          <Info label="Госномер" value={selectedVehicle?.plateNumber ?? '-'} />
          <Info label="Завершено" value={selected.finishedAt ? new Date(selected.finishedAt).toLocaleString('ru-RU') : '-'} />
        </div>
        {selected.certificate && (
          <div className="uploadBar">
            <button className="smallButton" type="button" onClick={() => onOpenCertificate(selected.certificate!)}>
              Открыть свидетельство
            </button>
          </div>
        )}
        <h3>Распознанные поля</h3>
        <MiniTable headers={['Поле', 'Значение']} rows={summaryRows(selected.summary)} />
        <h3>Созданные данные</h3>
        <MiniTable
          headers={['Сущность', 'Данные']}
          rows={[
            ['Свидетельство', selected.certificate?.number ?? '-'],
            ['ТС', selectedVehicle ? `${selectedVehicle.plateNumber} · ${selectedVehicle.vin}` : '-'],
            ['Владелец', selectedOwner ? `${selectedOwner.fullName ?? '-'} · ${selectedOwner.iin ?? '-'}` : '-'],
            ['Баллон', selectedCylinder ? `${selectedCylinder.serialNumber} · ${selectedCylinder.volumeLiters ?? '-'} л` : '-'],
            ['Инспекция', selectedInspection?.id ?? '-'],
            ['ИО', selectedOrganization?.name ?? selected.organizationId ?? '-'],
          ]}
        />
        <h3>Ошибки</h3>
        <MiniTable
          headers={['Ячейка/поле', 'Ошибка', 'Значение']}
          rows={(selected.errors ?? []).map((row) => [row.field ?? '-', row.message, row.rawValue ?? '-'])}
        />
      </section>
    );
  }

  return (
    <>
      <section className="table">
        <form
          className="inlineForm"
          onSubmit={(event) => {
            event.preventDefault();
            onApplyFilters();
          }}
        >
          <select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)}>
            <option value="all">Все статусы</option>
            <option value="processing">В обработке</option>
            <option value="completed">Завершено</option>
            <option value="failed">Ошибка</option>
          </select>
          <select value={organizationFilter} onChange={(event) => onOrganizationFilter(event.target.value)}>
            <option value="">Все ИО</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <input type="date" value={dateFrom} onChange={(event) => onDateFrom(event.target.value)} />
          <input type="date" value={dateTo} onChange={(event) => onDateTo(event.target.value)} />
          <button type="submit">Фильтр</button>
          <button type="button" className="ghostButton" onClick={onResetFilters}>
            Сбросить
          </button>
        </form>
        {canManage && (
          <form className="wideForm" onSubmit={onUpload}>
            <select name="organizationBin" defaultValue="">
              <option value="">ИО из файла</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.bin}>
                  {org.name} · {org.bin}
                </option>
              ))}
            </select>
            <input name="file" type="file" accept=".xlsx" required />
            <button type="submit">Загрузить XLSX</button>
          </form>
        )}
        <table>
          <thead>
            <tr>
              <th>Файл</th>
              <th>Статус</th>
              <th>Создано</th>
              <th>Обновлено</th>
              <th>Пропущено</th>
              <th>Ошибки</th>
              <th>ИО</th>
              <th>Свидетельство</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!importJobs.length && <EmptyTableRow colSpan={9} />}
            {importJobs.map((job) => {
              const organizationName = job.organization?.name ?? job.certificate?.inspection?.organization?.name ?? job.organizationId ?? '-';
              return (
                <tr key={job.id}>
                  <td>{job.filename}</td>
                  <td>
                    <span className="pill">{statusLabel(job.status)}</span>
                  </td>
                  <td>{job.createdCount}</td>
                  <td>{job.updatedCount}</td>
                  <td>{job.skippedCount}</td>
                  <td>{job.errorCount}</td>
                  <td>{organizationName}</td>
                  <td>{job.certificate?.number ?? '-'}</td>
                  <td>
                    <button className="smallButton" type="button" onClick={() => onOpen(job)}>
                      Детали
                    </button>
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

function summaryRows(summary?: Record<string, unknown>) {
  const entries = Object.entries(summary ?? {});
  if (!entries.length) return [];
  return entries.map(([key, value]) => [key, formatSummaryValue(value)]);
}

function formatSummaryValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
