const roleLabels: Record<string, string> = {
  vehicle_owner: 'Проверка свидетельств',
  inspection_org: 'Инспекционный орган',
  operator: 'Оператор',
  nca: 'НЦА',
  government: 'Контрольный орган',
  super_admin: 'Суперадминистратор',
  admin: 'Руководитель ИО',
  inspector: 'Сотрудник ИО',
  quality_control: 'Контроль качества',
};

const statusLabels: Record<string, string> = {
  active: 'Активно',
  blocked: 'Заблокировано',
  hidden: 'Скрыто',
  draft: 'Черновик',
  submitted: 'Контроль качества',
  quality_approved: 'На утверждении руководителя',
  approved: 'В реестре',
  rejected: 'Отклонено',
  suspended: 'Ограничено',
  revoked: 'Аннулировано',
  completed: 'Завершено',
  failed: 'Ошибка',
  processing: 'В обработке',
  pending: 'Ожидает',
  read: 'Прочитано',
  new: 'Новое',
  system: 'Системное',
};

const organizationTypeLabels: Record<string, string> = {
  inspection_org: 'Инспекционный орган',
  installer: 'Установщик',
  government: 'Контрольный орган',
  nca: 'НЦА',
  operator: 'Оператор',
};

const fileTypeLabels: Record<string, string> = {
  cylinder_label: 'Фото бирки баллона',
  vehicle_photo: 'Фото автомобиля',
  tech_passport: 'Техпаспорт',
  gas_work_record: 'Рабочая запись ГБО',
  cylinder_work_record: 'Рабочая запись баллона',
  gas_inspection_report: 'Отчет инспекции ГБО',
  cylinder_inspection_report: 'Отчет инспекции баллона',
  certificate_document: 'Свидетельство',
};

export function roleLabel(value?: string | null) {
  return value ? roleLabels[value] ?? value : '-';
}

export function rolesLabel(values?: Array<{ role: string }> | string[]) {
  if (!values?.length) return '-';
  return values.map((item) => roleLabel(typeof item === 'string' ? item : item.role)).join(', ');
}

export function statusLabel(value?: string | null) {
  return value ? statusLabels[value] ?? value : '-';
}

export function organizationTypeLabel(value?: string | null) {
  return value ? organizationTypeLabels[value] ?? value : '-';
}

export function fileTypeLabel(value?: string | null) {
  return value ? fileTypeLabels[value] ?? value : '-';
}
