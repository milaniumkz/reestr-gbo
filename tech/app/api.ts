export class PanelError extends Error {
  constructor(
    public status: number,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}
export async function api(path: string, body?: unknown, method?: string) {
  let response: Response;
  try {
    response = await fetch("/api/v1/technical" + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Technical-Request": "1",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
  } catch {
    throw new PanelError(
      0,
      "Соединение с сервером потеряно. Проверьте сеть и повторите запрос.",
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new PanelError(
      response.status,
      data.message ?? "Не удалось выполнить запрос",
      data.requestId,
    );
  return data;
}
export const states: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  waiting: "Ожидает решения",
  resolved: "Исправлена",
  reopened: "Возникла снова",
  critical: "Критично",
  warning: "Важно",
  info: "Информация",
  connected: "Доступен",
  unavailable: "Проверка не прошла",
  unknown: "Нет данных",
  not_connected: "Не подключено",
  stale: "Данные устарели",
  attention: "Требует внимания",
  no_data: "Нет данных",
  success: "Выполнено",
  denied: "Отказ",
  pending: "Ожидает проверки",
  error: "Ошибка",
  review_required: "Требует проверки",
  manual_review: "Ручная проверка",
  local_checked: "Проверено локально",
  approved: "Подтверждено",
  disabled: "Выключено",
  not_checked: "Не проверено",
  not_configured: "Не подключено",
  passed: "Проверка пройдена",
  failed: "Проверка не пройдена",
  not_verified: "Не проверено",
  owner: "Владелец",
  engineer: "Инженер",
  support: "Специалист поддержки",
  viewer: "Просмотр журналов",
  active: "Активен",
  blocked: "Заблокирован",
  inspection_org: "Инспекционный орган",
  quality_control: "Контроль качества",
  inspector: "Инспектор",
  admin: "Руководитель",
  draft: "Черновик",
  submitted: "Контроль качества",
  quality_approved: "На утверждении",
  rejected: "На исправлении",
  audit: "Действия",
  security: "Безопасность",
  server: "Сервер",
  business_audit: "Бизнес-аудит",
  address: "Адрес инспекции",
  gps_reference_centre: "GPS, приблизительно",
  outside_reference_coverage: "Вне справочного покрытия",
  monitoring: "Мониторинг",
  inspection_geography: "География инспекций",
  inactive: "Не запущен",
  activating: "Запускается",
  deactivating: "Останавливается",
};
export const label = (value: unknown) =>
  value == null
    ? "Нет данных"
    : (states[String(value)] ?? "Другой технический статус");
export function date(value: unknown) {
  if (!value) return "Нет данных";
  const d = new Date(String(value));
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "Asia/Yekaterinburg",
      }).format(d)
    : "Нет данных";
}
export function bytes(value: unknown) {
  if (value == null || !Number.isFinite(Number(value))) return "Нет данных";
  const n = Number(value);
  return n >= 1073741824
    ? (n / 1073741824).toFixed(1) + " ГБ"
    : n >= 1048576
      ? (n / 1048576).toFixed(1) + " МБ"
      : n.toLocaleString("ru-RU") + " Б";
}
