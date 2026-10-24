import { safeText } from "../observability/safe-data";
const actions: Record<string, string> = {
  "inspection.photo.rejected":"Отклонение загрузки фотографии",
  "bank_invoice.issue": "Выставление счёта на аванс без зачисления средств",
  "auth.offer_accepted": "Принятие публичной оферты при входе",
  "auth.login": "Вход в приложение",
  "auth.password_failed": "Неудачная попытка входа",
  "auth.logout": "Выход из приложения",
  "auth.refresh": "Продление сеанса",
  "auth.password_changed": "Смена пароля",
  "technical.login": "Вход владельца в техническую панель",
  "technical.logout": "Выход из технической панели",
  "technical.reauthenticate": "Подтверждение пароля владельца",
  "inspection.create": "Создание инспекции",
  "inspection.data.update": "Изменение данных инспекции",
  "inspection.status.update": "Изменение статуса инспекции",
  "inspection.photo.rotate": "Поворот фотографии инспекции",
  "inspection.photo.upload": "Загрузка документа инспекции",
  "organization.member.add": "Добавление сотрудника ИО",
  "organization.member.remove": "Удаление сотрудника ИО",
};
export const roleName = (role: string) =>
  (
    ({
      owner: "Владелец технической панели",
      inspection_org: "Сотрудник ИО",
      inspector: "Инспектор",
      quality_control: "Контроль качества",
      admin: "Руководитель",
      government: "Контрольный орган",
      nca: "НЦА",
      operator: "Оператор",
      super_admin: "Администратор реестра",
      vehicle_owner: "Наблюдатель",
      support: "Поддержка",
      engineer: "Инженер",
      viewer: "Просмотр журналов",
    }) as Record<string, string>
  )[role] ?? "Другая роль";
export function actionName(action: string) {
  if (actions[action]) return actions[action];
  const route = action.replace(/^(GET|POST|PATCH|PUT|DELETE|HEAD) /, "");
  if (/technical\/auth\/me/.test(route))
    return "Проверка входа в техническую панель";
  if (/technical\/auth\/login/.test(route))
    return "Вход владельца в техническую панель";
  if (/\/auth\/(login|password)/.test(route)) return "Вход в приложение";
  if (/\/auth\/refresh/.test(route)) return "Продление сеанса приложения";
  const sections: [string, string][] = [
    ["technical/overview", "обзора технической панели"],
    ["technical/problems", "проблем технической панели"],
    ["technical/events", "журнала действий"],
    ["technical/", "раздела технической панели"],
    ["inspections", "инспекций"],
    ["certificates", "свидетельств"],
    ["organizations", "инспекционных органов"],
    ["users", "пользователей"],
    ["registry", "реестра"],
    ["media", "документа"],
  ];
  const section = sections.find(([part]) => route.includes(part));
  if (section)
    return `${action.startsWith("GET ") ? "Просмотр" : "Операция в разделе"} ${section[1]}`;
  return "Операция приложения";
}
const reasons: Record<string, string> = {
  credentials_invalid:
    "Телефон или пароль не прошли проверку. Личность вошедшего не подтверждена.",
  login_locked: "Вход временно ограничен после неудачных попыток.",
  session_expired:
    "Срок действия сохранённого сеанса истёк. Требуется повторный вход.",
  session_revoked: "Сохранённый сеанс отозван. Требуется повторный вход.",
  session_version_changed:
    "Сеанс выдан до изменения пароля. Требуется повторный вход.",
  account_blocked: "Учётная запись заблокирована.",
  password_change_required: "Требуется обязательная смена временного пароля.",
  organization_membership_missing:
    "У пользователя нет требуемого членства в выбранной организации.",
};
export function activityPresentation(event: any) {
  const details = event.details ?? {},
    status = Number(details.statusCode) || null;
  const technical =
    event.action.startsWith("technical.") ||
    event.action.includes("/technical/");
  const actionLabel = actionName(event.action);
  const exact =
    typeof details.message === "string" &&
    details.message.trim() &&
    !["Unauthorized", "Forbidden", "Not Found"].includes(details.message)
      ? safeText(details.message, 500)
      : null;
  const cause =
    reasons[details.reasonCode] ??
    exact ??
    (status === 401
      ? "Сервер не получил действующий сеанс. Точная причина отказа в этой записи не сохранена."
      : status === 403
        ? "Сервер отказал в доступе. Точное основание в этой записи не сохранено."
        : status === 429
          ? "Превышено ограничение частоты запросов."
          : status && status >= 500
            ? "Сервер не смог выполнить операцию. Причина требует проверки по номеру обращения."
            : event.explanation);
  return {
    actionLabel,
    sourceLabel: technical ? "Техническая панель" : "Приложение реестра",
    statusCode: status,
    outcomeLabel:
      status && status >= 500
        ? "Ошибка сервера"
        : status && status >= 400
          ? "Операция не выполнена"
          : event.result === "success"
            ? "Выполнено"
            : event.result === "denied"
              ? "Отказ"
              : event.result === "pending"
                ? "Требуется следующий шаг"
                : "Требует проверки",
    message: cause,
    clientMessage: exact,
    exactMessage: !!exact,
    verified: typeof details.verified === "boolean" ? details.verified : null,
  };
}
export function problemName(problem: any) {
  const action = actionName(
    `${problem.details?.method ?? "GET"} ${problem.route ?? ""}`,
  );
  return `${problem.code === "401" ? "Вход или сеанс не подтверждён" : problem.code === "403" ? "Доступ запрещён" : problem.code === "429" ? "Слишком частые запросы" : "Ошибка сервера"} · ${action.toLowerCase()}`;
}
