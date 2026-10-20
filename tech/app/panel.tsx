"use client";
import PushControls from "./push-controls";
import { consentLocation } from "./location";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  FormEvent,
  ReactNode,
} from "react";
import { api, PanelError, label, date, bytes, states } from "./api";

type User = {
  account: { id: string; login: string; fullName: string; role: string };
  permissions: string[];
};
type Section =
  | "deviations"
  | "overview"
  | "problems"
  | "services"
  | "events"
  | "security"
  | "files"
  | "backups"
  | "releases"
  | "alerts"
  | "accounts"
  | "settings";
const navigation: {
  id: Section;
  title: string;
  icon: string;
  permission: string;
}[] = [
  {
    id: "deviations",
    title: "Отклонения инспекций",
    icon: "⚑",
    permission: "people.read",
  },
  {
    id: "overview",
    title: "Обзор системы",
    icon: "◫",
    permission: "overview.read",
  },
  {
    id: "problems",
    title: "Проблемы и ошибки",
    icon: "△",
    permission: "issues.read",
  },
  {
    id: "services",
    title: "Сервер и сервисы",
    icon: "▤",
    permission: "infrastructure.read",
  },
  {
    id: "events",
    title: "Действия пользователей",
    icon: "◷",
    permission: "events.read",
  },
  {
    id: "security",
    title: "Безопасность",
    icon: "◇",
    permission: "security.read",
  },
  {
    id: "files",
    title: "Файлы и фотографии",
    icon: "▧",
    permission: "files.read",
  },
  {
    id: "backups",
    title: "Резервные копии",
    icon: "▣",
    permission: "backups.read",
  },
  {
    id: "releases",
    title: "Обновления системы",
    icon: "↥",
    permission: "releases.read",
  },
  { id: "alerts", title: "Уведомления", icon: "♧", permission: "alerts.read" },
  {
    id: "accounts",
    title: "Доступ сотрудников",
    icon: "♙",
    permission: "accounts.read",
  },
  {
    id: "settings",
    title: "Настройки",
    icon: "⚙",
    permission: "settings.read",
  },
];
const descriptions: Record<Section, string> = {
  deviations:
    "Отклонения по городам инспектора и владельца и результатам повторной проверки фотографий. Проверка не является обвинением.",
  overview: "Сначала — то, что требует вашего внимания.",
  problems: "Повторения ошибок объединены в расследования.",
  services: "Состояние компонентов, подтверждённое доступными источниками.",
  events: "Действия и окончательные результаты операций на сервере.",
  security:
    "Сигналы для проверки. Подозрение не является доказательством нарушения.",
  files: "Проверки файлов, точные повторы и защищённый просмотр.",
  backups: "Наличие файла копии не подтверждает возможность восстановления.",
  releases: "История выпусков из серверного сборщика.",
  alerts: "Внутренние уведомления и обработка тревог.",
  accounts: "Технический доступ отделён от ролей реестра.",
  settings: "Правила уведомлений, хранение событий и инструкции обслуживания.",
};
function Badge({ value, text }: { value: unknown; text?: string }) {
  return <span className={"tag " + String(value)}>{text ?? label(value)}</span>;
}
function Details({ value }: { value: unknown }) {
  return (
    <details>
      <summary>Технические подробности</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <span className="symbol">⊙</span>
      {children}
    </div>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dialog">
        <div className="dialog-head">
          <h2>{title}</h2>
          <button
            className="iconbutton"
            aria-label="Закрыть окно"
            onClick={close}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Download({ value, name }: { value: unknown; name: string }) {
  return (
    <button
      className="secondary"
      onClick={() => {
        const u = URL.createObjectURL(
          new Blob([JSON.stringify(value, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = u;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      }}
    >
      Сохранить файл
    </button>
  );
}

function ActorSummary({ actor }: { actor: any }) {
  if (!actor) return <span>Пользователь не установлен</span>;
  return (
    <div className="actor-summary">
      <strong>{actor.name ?? "Пользователь не установлен"}</strong>
      {actor.login && <div>Логин: {actor.login}</div>}
      {actor.phoneMasked && <div>Телефон: {actor.phoneMasked}</div>}
      {actor.roles?.length > 0 && <div>{actor.roles.join(" · ")}</div>}
      {actor.organizations?.map((org: any) => (
        <div key={org.id}>
          <b>{org.name}</b> · {org.role}
        </div>
      ))}
      {actor.verified === false && (
        <div className="identity-warning">
          Аккаунт определён, вход не подтверждён
        </div>
      )}
      {actor.identityNote && (
        <small className="muted">{actor.identityNote}</small>
      )}
    </div>
  );
}
function readableDevice(value: string) {
  const browser = /Edg\//.test(value)
    ? "Microsoft Edge"
    : /Chrome\//.test(value)
      ? "Chrome"
      : /Firefox\//.test(value)
        ? "Firefox"
        : /Safari\//.test(value)
          ? "Safari"
          : /Dart\//.test(value)
            ? "Мобильное приложение"
            : "Клиент не определён";
  const os = /Android/.test(value)
    ? "Android"
    : /iPhone|iPad/.test(value)
      ? "iOS"
      : /Windows/.test(value)
        ? "Windows"
        : /Macintosh/.test(value)
          ? "macOS"
          : /Linux/.test(value)
            ? "Linux"
            : null;
  return [browser, os].filter(Boolean).join(" · ");
}
function ActivityTimeline({
  events,
  openJourney,
}: {
  events: any[];
  openJourney?: (event: any) => void;
}) {
  return (
    <div className="activity-timeline">
      {events.map((event) => (
        <article className="activity-event" key={event.id}>
          <header>
            <strong>{date(event.createdAt)}</strong>
            {openJourney && (
              <button
                type="button"
                className="textbutton"
                onClick={() => openJourney(event)}
              >
                Порядок действий сотрудника
              </button>
            )}
            <Badge
              value={event.result}
              text={event.display?.outcomeLabel ?? label(event.result)}
            />
          </header>
          <div className="activity-event-grid">
            <ActorSummary actor={event.actor} />
            <div>
              <strong>{event.display?.actionLabel ?? event.explanation}</strong>
              <div className="muted">
                {event.display?.sourceLabel ?? "Источник не указан"}
              </div>
              <p>{event.display?.message ?? event.explanation}</p>
              {event.objectContext && (
                <p>
                  <b>{event.objectContext.organization.name}</b> ·{" "}
                  {event.objectContext.vehicle.plateNumber} · Свидетельство{" "}
                  {event.objectContext.certificateNumber ?? "не выпущено"}
                </p>
              )}
              {event.display?.clientMessage &&
                event.display.clientMessage !== event.display.message && (
                  <p>Сообщение пользователю: {event.display.clientMessage}</p>
                )}
              {event.ipAddress && <div>IP подключения: {event.ipAddress}</div>}
              {event.device && (
                <div>Клиент: {readableDevice(event.device)}</div>
              )}
              {event.appVersion && (
                <div>Версия приложения: {event.appVersion}</div>
              )}
              {event.location?.state === "available" ? (
                <div>
                  GPS: {event.location.lat}, {event.location.lng} · точность ±
                  {Math.round(event.location.accuracy)} м<br />
                  <small>
                    Сообщено клиентом · {date(event.location.capturedAt)}
                  </small>
                </div>
              ) : (
                <div className="muted">
                  GPS:{" "}
                  {event.location?.state === "denied"
                    ? "пользователь не разрешил"
                    : event.location?.state === "not_requested"
                      ? "разрешение не запрошено"
                      : "координаты не получены"}
                </div>
              )}
              <Details
                value={{
                  requestId: event.requestId,
                  action: event.action,
                  httpStatus: event.display?.statusCode,
                  sessionId: event.sessionId,
                  details: event.details,
                  device: event.device,
                }}
              />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function Panel() {
  const [user, setUser] = useState<User | null>(null),
    [stage, setStage] = useState<"loading" | "login" | "ready">("loading"),
    [enabled, setEnabled] = useState(true),
    [isolated, setIsolated] = useState(false);
  const [section, setSection] = useState<Section>("overview"),
    [tab, setTab] = useState("events"),
    [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [errorId, setErrorId] = useState(""),
    [notice, setNotice] = useState(""),
    [updated, setUpdated] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [theme, setTheme] = useState("light");
  const [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1),
    [hours, setHours] = useState("24"),
    [problemFilter, setProblemFilter] = useState(""),
    [saved, setSaved] = useState<
      {
        name: string;
        section: Section;
        q: string;
        status: string;
        from: string;
        to: string;
      }[]
    >([]);
  const [accountFilter, setAccountFilter] = useState<{
    id: string;
    kind: string;
    name: string;
  } | null>(null);
  const [dialog, setDialog] = useState<any>(null);
  const requestSequence = useRef(0);
  const has = (permission: string) => !!user?.permissions.includes(permission);
  const displayError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : "Не удалось выполнить операцию");
    setErrorId(e instanceof PanelError ? (e.requestId ?? "") : "");
  }, []);
  useEffect(() => {
    try {
      const t = localStorage.getItem("technical-theme") ?? "light";
      setTheme(t);
      document.body.dataset.theme = t;
      const s = JSON.parse(localStorage.getItem("technical-filters") ?? "[]");
      if (Array.isArray(s)) setSaved(s.slice(0, 20));
    } catch {}
    void (async () => {
      try {
        const state = await api("/auth/status");
        setEnabled(state.enabled);
        setIsolated(state.environment === "isolated");
        if (!state.enabled) {
          setStage("login");
          return;
        }
        const me = await api("/auth/me");
        setUser(me);
        setStage("ready");
      } catch {
        setStage("login");
      }
    })();
  }, []);
  useEffect(() => {
    if (stage !== "ready") return;
    const params = new URLSearchParams(location.search);
    const target = params.get("section");
    if (target && navigation.some((n) => n.id === target)) {
      navigate(target as Section);
      const problem = params.get("problem");
      if (problem && /^[a-f0-9-]{36}$/i.test(problem))
        void api("/problems/" + problem)
          .then((value) => setDialog({ kind: "problem", value }))
          .catch(displayError);
      history.replaceState(null, "", location.pathname);
    }
  }, [stage, displayError]);
  function switchTheme() {
    const t = theme === "light" ? "dark" : "light";
    setTheme(t);
    document.body.dataset.theme = t;
    localStorage.setItem("technical-theme", t);
  }
  const endpoint = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), limit: "25" });
    if (q) p.set("q", q);
    if (accountFilter)
      p.set(
        accountFilter.kind === "technical" ? "techActorId" : "actorId",
        accountFilter.id,
      );
    if (problemFilter && section === "events")
      p.set("problemId", problemFilter);
    if (status) p.set(section === "files" ? "status" : "status", status);
    if (from) p.set("from", from + "T00:00:00+05:00");
    if (to) p.set("to", to + "T23:59:59+05:00");
    let route =
      section === "security"
        ? tab === "organizations"
          ? "organizations"
          : tab === "geography"
            ? "geography"
            : "events"
        : section === "accounts" && tab === "people"
          ? "people"
          : section;
    if (section === "security" && tab === "events")
      p.set("category", "security");
    if (section === "accounts" && tab === "people" && q) p.set("phone", q);
    if (section === "overview") p.set("hours", hours);
    return "/" + route + "?" + p.toString();
  }, [
    section,
    tab,
    page,
    q,
    status,
    from,
    to,
    hours,
    problemFilter,
    accountFilter,
  ]);
  const load = useCallback(
    async (background = false) => {
      if (!user) return;
      const sequence = ++requestSequence.current;
      if (!background) setLoading(true);
      try {
        const value = await api(endpoint());
        if (sequence !== requestSequence.current) return;
        setData(value);
        setUpdated(new Date().toISOString());
        setError("");
        setErrorId("");
      } catch (e) {
        if (sequence !== requestSequence.current) return;
        if (e instanceof PanelError && e.status === 401) {
          setUser(null);
          setStage("login");
        } else displayError(e);
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [user, endpoint, displayError],
  );
  useEffect(() => {
    if (stage !== "ready") return;
    void load();
    const timer = setInterval(() => void load(true), 15000);
    return () => clearInterval(timer);
  }, [stage, load]);
  function navigate(id: Section) {
    requestSequence.current++;
    setSection(id);
    setProblemFilter("");
    setAccountFilter(null);
    setTab(id === "accounts" ? "accounts" : "events");
    setQ("");
    setStatus("");
    setFrom("");
    setTo("");
    setPage(1);
    setData(null);
    setMobile(false);
    setNotice("");
  }
  async function perform(path: string, body?: unknown, method?: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api(path, body, method);
      setNotice("Операция выполнена");
      await load(true);
      return result;
    } catch (e) {
      displayError(e);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api("/auth/login", {
        login: f.get("login"),
        password: f.get("password"),
      });
      setUser(await api("/auth/me"));
      setStage("ready");
    } catch (e) {
      displayError(e);
    } finally {
      setBusy(false);
    }
  }
  async function submitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = Object.fromEntries(new FormData(event.currentTarget).entries());
    const kind = dialog.kind;
    let result: any = null;
    if (kind === "review")
      result = await perform(
        "/files/" + dialog.value.id + "/review",
        f,
        "PATCH",
      );
    if (kind === "user-password")
      result = await perform("/people/" + dialog.value.id + "/password", f);
    if (kind === "user-block")
      result = await perform(
        "/people/" + dialog.value.id + "/block",
        { ...f, blocked: !dialog.value.isBlocked },
        "PATCH",
      );
    if (kind === "deviation")
      result = await perform("/deviations/" + dialog.value.id, f, "PATCH");
    if (kind === "password") result = await perform("/auth/password", f);
    if (kind === "hold")
      result = await perform(
        "/events/" + dialog.value.id + "/hold",
        { ...f, days: Number(f.days) },
        "PATCH",
      );
    if (kind === "reauth") result = await perform("/auth/reauthenticate", f);
    if (kind === "problem")
      result = await perform(
        "/problems/" + dialog.value.id,
        {
          ...f,
          assignedTo:
            f.assignedTo === "me"
              ? user?.account.id
              : f.assignedTo || undefined,
        },
        "PATCH",
      );
    if (kind === "access")
      result = await perform(
        "/accounts/" + dialog.value.id,
        {
          ...f,
          permissions: new FormData(event.currentTarget).getAll("permissions"),
        },
        "PATCH",
      );
    if (kind === "account")
      result = await perform("/accounts", { ...f, permissions: [] });
    if (kind === "residence")
      result = await perform(
        "/people/" + dialog.value.id + "/residence",
        f,
        "PATCH",
      );
    if (kind === "recovery") {
      result = await perform("/people/" + dialog.value.id + "/recovery", f);
      if (result) {
        setDialog({
          kind: "recovery-result",
          value: {
            ...result,
            link: location.origin + "/tech/recovery/#" + result.token,
          },
        });
        return;
      }
    }
    if (kind === "rule")
      result = await perform(
        "/settings/rules/" + dialog.value.category,
        {
          ...f,
          enabled: f.enabled === "true",
          threshold: Number(f.threshold),
          windowMinutes: Number(f.windowMinutes),
          cooldownMinutes: Number(f.cooldownMinutes),
          quietStart: f.quietStart === "" ? null : Number(f.quietStart),
          quietEnd: f.quietEnd === "" ? null : Number(f.quietEnd),
          recipients: String(f.recipients).split(",").filter(Boolean),
        },
        "PATCH",
      );
    if (kind === "mute")
      result = await perform(
        "/alerts/" + dialog.value.id,
        { action: "mute", reason: f.reason, minutes: Number(f.minutes) },
        "PATCH",
      );
    if (result) setDialog(null);
  }
  function saveFilter() {
    const name = window.prompt("Название набора фильтров");
    if (!name?.trim()) return;
    const next = [
      { name: name.trim().slice(0, 60), section, q, status, from, to },
      ...saved,
    ].slice(0, 20);
    setSaved(next);
    localStorage.setItem("technical-filters", JSON.stringify(next));
  }
  const errorBox = error ? (
    <div className="notice error" role="alert">
      <strong>Не удалось выполнить запрос</strong>
      <p>{error}</p>
      {errorId && (
        <p>
          Номер обращения: <code>{errorId}</code>
        </p>
      )}
      <button className="textbutton" onClick={() => void load()}>
        Повторить запрос
      </button>
      {data && (
        <p>
          Ниже показаны ранее полученные данные. Они могут быть неактуальны.
        </p>
      )}
    </div>
  ) : null;
  if (stage === "loading")
    return (
      <div className="loading">
        <span className="loader" />
        Проверяем защищённый сеанс…
      </div>
    );
  if (stage === "login")
    return (
      <div className="login-page">
        <div className="login-intro">
          <div className="brand">
            <span className="brand-icon">◇</span>ЕРСИ ГБО
          </div>
          <h1>
            Всё важное
            <br />
            для надёжной
            <br />
            работы системы.
          </h1>
          <p>
            Технический контур обслуживания. Ошибки, действия пользователей и
            состояние сервисов — в одном защищённом пространстве.
          </p>
          <div className="login-feature">
            <span>⌁</span>
            <div>
              Отдельный технический доступ
              <small>Роли реестра не дают доступа к этой панели</small>
            </div>
          </div>
          <div className="login-feature">
            <span>⛨</span>
            <div>
              Личный доступ владельца
              <small>Вход по логину и паролю</small>
            </div>
          </div>
        </div>
        <div className="login-form-side">
          <div className="login-form">
            <div className="eyebrow">Техническая панель · Защищённый вход</div>
            <h2>Добро пожаловать</h2>
            <p className="muted">Войдите с личной учётной записью владельца.</p>
            {isolated && (
              <div className="notice warning">
                Изолированная тестовая среда. Здесь нет рабочей базы
                пользователей.
              </div>
            )}
            {!enabled && (
              <div className="notice warning">
                Панель ещё не подключена. Обратитесь к владельцу системы.
              </div>
            )}
            {errorBox}
            <form onSubmit={login}>
              <label>
                Логин
                <input
                  name="login"
                  autoComplete="username"
                  required
                  maxLength={48}
                />
              </label>
              <label>
                Пароль
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={72}
                />
              </label>
              <button className="primary" disabled={busy || !enabled}>
                {busy ? "Проверяем…" : "Войти в техническую панель"}
              </button>
            </form>
            <p className="footnote">
              Действия в панели фиксируются в журнале. Доступ к оригиналам
              файлов и опасным операциям выдаётся отдельно.
            </p>
            <button className="textbutton" onClick={switchTheme}>
              {theme === "light" ? "Тёмная тема" : "Светлая тема"}
            </button>
            <p>
              <a href="/tech/recovery/">
                Восстановить доступ к приложению по выданной ссылке
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  const visible = navigation.filter((n) => has(n.permission));
  const title = navigation.find((n) => n.id === section)?.title ?? "";
  const stale = !!updated && Date.now() - Date.parse(updated) > 45000;
  return (
    <div className="app">
      <aside className={mobile ? "open" : ""}>
        <div className="brand">
          <span className="brand-icon">◇</span>ЕРСИ ГБО
        </div>
        <div className="brand-sub">ТЕХНИЧЕСКАЯ ПАНЕЛЬ</div>
        <nav>
          {visible.map((n) => (
            <button
              key={n.id}
              className={section === n.id ? "active" : ""}
              onClick={() => navigate(n.id)}
            >
              <span className="navicon">{n.icon}</span>
              {n.title}
            </button>
          ))}
        </nav>
        <div className="aside-bottom">
          <strong>Защищённый контур</strong>Все административные действия
          фиксируются.<p>Екатеринбург · UTC+5</p>
          <button
            className="textbutton"
            onClick={() => {
              setMobile(false);
              setDialog({ kind: "instructions" });
            }}
          >
            Инструкции обслуживания ↗
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="actions">
            <button
              className="iconbutton mobile-menu"
              aria-label="Открыть меню"
              onClick={() => setMobile(!mobile)}
            >
              ☰
            </button>
            <div>
              <div className="eyebrow">Единый центр обслуживания</div>
              <div className="top-title">Контроль и поддержка системы</div>
            </div>
          </div>
          <div className="toolbar">
            <span className="live">Обновление каждые 15 с</span>
            <button
              className="iconbutton"
              onClick={switchTheme}
              aria-label={
                theme === "light"
                  ? "Включить тёмную тему"
                  : "Включить светлую тему"
              }
            >
              {theme === "light" ? "☾" : "☀"}
            </button>
            <button
              className="secondary"
              onClick={() => void load()}
              disabled={loading}
            >
              Обновить
            </button>
            <div className="account">
              <strong>{user?.account.fullName}</strong>
              {label(user?.account.role)}
            </div>
            <button
              className="iconbutton"
              aria-label="Выйти"
              onClick={async () => {
                if (await perform("/auth/logout", {})) {
                  setUser(null);
                  setStage("login");
                }
              }}
            >
              ↪
            </button>
          </div>
        </header>
        <div className="page-head">
          <div>
            <div className="eyebrow">Операционная поддержка</div>
            <h1>{title}</h1>
            <div className="muted">{descriptions[section]}</div>
          </div>
          <div className="actions">
            {section === "overview" && (
              <select
                aria-label="Период обзора"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              >
                <option value="1">За последний час</option>
                <option value="24">За 24 часа</option>
                <option value="168">За неделю</option>
              </select>
            )}
            <button
              className="secondary"
              onClick={() => setDialog({ kind: "password" })}
            >
              Сменить пароль
            </button>
            <button
              className="secondary"
              onClick={() => setDialog({ kind: "reauth" })}
            >
              Подтвердить личность
            </button>
          </div>
        </div>
        {isolated && (
          <div className="notice warning">
            Изолированная тестовая среда · искусственные записи, реальные
            проверки локальных сервисов.
          </div>
        )}
        {errorBox}
        {accountFilter && (
          <div className="notice">
            Действия аккаунта: <strong>{accountFilter.name}</strong>
            <button
              type="button"
              className="textbutton"
              onClick={() => setAccountFilter(null)}
            >
              Снять фильтр
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            ✓ {notice}
            <button
              className="textbutton"
              style={{ float: "right" }}
              onClick={() => setNotice("")}
            >
              Скрыть
            </button>
          </div>
        )}
        {stale && (
          <div className="notice warning">
            Данные устарели. Последнее успешное обновление: {date(updated)}.
          </div>
        )}
        {section === "security" && (
          <div className="tabs">
            <button
              className={tab === "events" ? "active" : ""}
              onClick={() => {
                setTab("events");
                setPage(1);
                setData(null);
              }}
            >
              Подозрительные события
            </button>
            {has("people.read") && (
              <>
                <button
                  className={tab === "organizations" ? "active" : ""}
                  onClick={() => {
                    setTab("organizations");
                    setPage(1);
                    setData(null);
                  }}
                >
                  Контроль ИО и сотрудников
                </button>
                <button
                  className={tab === "geography" ? "active" : ""}
                  onClick={() => {
                    setTab("geography");
                    setPage(1);
                    setData(null);
                  }}
                >
                  География инспекций
                </button>
              </>
            )}
          </div>
        )}
        {section === "accounts" && (
          <div className="tabs">
            <button
              className={tab === "accounts" ? "active" : ""}
              onClick={() => {
                setTab("accounts");
                setData(null);
              }}
            >
              Технические сотрудники
            </button>
            {has("people.read") && (
              <button
                className={tab === "people" ? "active" : ""}
                onClick={() => {
                  setTab("people");
                  setData(null);
                }}
              >
                Пользователи приложения
              </button>
            )}
          </div>
        )}
        {["events", "problems", "security", "files", "alerts"].includes(
          section,
        ) ||
        (section === "accounts" && tab === "people") ? (
          <div className="filters">
            {section !== "files" && (
              <input
                aria-label="Поиск"
                placeholder={
                  section === "accounts"
                    ? "Телефон пользователя"
                    : "Поиск в разделе"
                }
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            )}
            {section === "problems" && (
              <select
                aria-label="Статус проблемы"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Все статусы</option>
                {["new", "in_progress", "waiting", "resolved", "reopened"].map(
                  (x) => (
                    <option value={x} key={x}>
                      {label(x)}
                    </option>
                  ),
                )}
              </select>
            )}
            {section === "files" && (
              <select
                aria-label="Результат проверки файла"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Все результаты проверки</option>
                {[
                  "manual_review",
                  "local_checked",
                  "not_checked",
                  "approved",
                ].map((x) => (
                  <option value={x} key={x}>
                    {label(x)}
                  </option>
                ))}
              </select>
            )}
            {(section === "events" ||
              (section === "security" && tab === "events")) && (
              <>
                <label>
                  С даты
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <label>
                  По дату
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </>
            )}
            <div className="actions">
              <button className="secondary" onClick={saveFilter}>
                Сохранить фильтр
              </button>
              {saved.some((x) => x.section === section) && (
                <select
                  aria-label="Сохранённые фильтры"
                  defaultValue=""
                  onChange={(e) => {
                    const f = saved[Number(e.target.value)];
                    if (f) {
                      setQ(f.q);
                      setStatus(f.status);
                      setFrom(f.from);
                      setTo(f.to);
                      setPage(1);
                    }
                  }}
                >
                  <option value="">Наборы фильтров</option>
                  {saved.map((f, i) =>
                    f.section === section ? (
                      <option key={i} value={i}>
                        {f.name}
                      </option>
                    ) : null,
                  )}
                </select>
              )}
              {has("events.export") &&
                (section === "events" ||
                  (section === "security" && tab === "events")) && (
                  <button
                    className="secondary"
                    onClick={async () => {
                      const result = await perform(
                        "/events/export?" + endpoint().split("?")[1],
                      );
                      if (result) setDialog({ kind: "export", value: result });
                    }}
                  >
                    Экспорт страницы
                  </button>
                )}
            </div>
          </div>
        ) : null}
        {loading && !data ? (
          <div className="loading">
            <span className="loader" />
            Получаем данные…
          </div>
        ) : !data ? (
          <Empty>Нет данных. Проверьте подключение и повторите запрос.</Empty>
        ) : (
          <>
            {section === "overview" && (
              <Overview
                data={data}
                openProblem={async (id) => {
                  try {
                    setDialog({
                      kind: "problem",
                      value: await api("/problems/" + id),
                    });
                  } catch (e) {
                    displayError(e);
                  }
                }}
                go={navigate}
              />
            )}
            {section === "services" && (
              <Services
                data={data}
                check={() =>
                  void perform("/maintenance/check", {
                    operation: "verify-services",
                    reason: "Проверка сервисов владельцем через панель",
                  })
                }
              />
            )}
            {section === "deviations" && (
              <div className="filters">
                <label>
                  Результат проверки
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">Все отклонения</option>
                    <option value="new">Новые</option>
                    <option value="in_progress">На проверке</option>
                    <option value="resolved">Устранённые</option>
                    <option value="dismissed">Не подтвердились</option>
                  </select>
                </label>
              </div>
            )}
            {section === "alerts" && <PushControls />}
            {section === "settings" && (
              <Settings
                data={data}
                edit={(rule) => setDialog({ kind: "rule", value: rule })}
                manage={has("settings.manage")}
              />
            )}
            {section !== "overview" &&
              section !== "services" &&
              section !== "settings" && (
                <>
                  {section === "backups" && (
                    <div className={"notice " + (data.stale ? "warning" : "")}>
                      {data.explanation}
                      {data.stale ? " Источник устарел." : ""}
                    </div>
                  )}
                  {section === "releases" && (
                    <div className="notice">{data.explanation}</div>
                  )}
                  {section === "security" && tab === "geography" && (
                    <div className="notice">
                      Сравниваются оба города проживания. GPS-оценка
                      приблизительна; отсутствие данных не считается
                      совпадением. Несовпадение — основание для проверки выезда,
                      а не обвинение.
                    </div>
                  )}
                  <DataTable
                    section={section}
                    tab={tab}
                    data={data}
                    has={has}
                    action={async (kind, value) => {
                      if (kind === "journey" || kind === "event-journey") {
                        try {
                          setDialog({
                            kind: "journey",
                            value: await api(
                              "/journey?" +
                                (kind === "event-journey"
                                  ? "eventId="
                                  : "alertId=") +
                                value.id,
                            ),
                          });
                        } catch (e) {
                          displayError(e);
                        }
                        return;
                      }
                      if (kind === "problem") {
                        try {
                          setDialog({
                            kind,
                            value: await api("/problems/" + value.id),
                          });
                        } catch (e) {
                          displayError(e);
                        }
                        return;
                      }
                      if (kind === "ack" || kind === "claim") {
                        await perform(
                          "/alerts/" + value.id,
                          { action: kind === "ack" ? "acknowledge" : "claim" },
                          "PATCH",
                        );
                        return;
                      }
                      if (kind === "block-account") {
                        const reason = window.prompt(
                          "Причина отзыва доступа и всех сеансов",
                        );
                        if (reason)
                          await perform(
                            "/accounts/" + value.id,
                            { active: !value.active, reason },
                            "PATCH",
                          );
                        return;
                      }
                      if (kind === "recheck") {
                        const result = await perform(
                          "/files/" + value.id + "/recheck",
                          {},
                        );
                        if (result) setNotice(result.moderationReason);
                        return;
                      }
                      if (kind === "support") {
                        setDialog({ kind: "user-password", value });
                        return;
                      }
                      if (kind === "photo") {
                        window.open(
                          "/api/v1/technical/files/" + value.id + "/original",
                          "_blank",
                          "noopener,noreferrer",
                        );
                        return;
                      }
                      setDialog({ kind, value });
                    }}
                  />
                  {data.total != null && (
                    <div className="pagination">
                      <span>
                        Всего: {data.total.toLocaleString("ru-RU")} · Страница{" "}
                        {data.page ?? page}
                      </span>
                      <div className="actions">
                        <button
                          className="secondary"
                          disabled={page <= 1}
                          onClick={() => setPage(Math.max(1, page - 1))}
                        >
                          Назад
                        </button>
                        <button
                          className="secondary"
                          disabled={page * (data.limit ?? 25) >= data.total}
                          onClick={() => setPage(page + 1)}
                        >
                          Далее
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
          </>
        )}
        <section className="notice">
          <button
            type="button"
            className="textbutton"
            onClick={async () => {
              await consentLocation();
              setNotice(
                "Разрешение геолокации обработано. В журнал попадут координаты, если браузер их предоставил.",
              );
            }}
          >
            Разрешить GPS для диагностики действий в этой панели
          </button>
        </section>
        <footer className="footnote">
          Последнее успешное обновление: {date(updated)} · Сведения из
          недоступных источников не считаются исправным состоянием.
        </footer>
      </main>
      {dialog && (
        <Modal
          title={
            dialog.kind === "journey"
              ? "Порядок действий сотрудника"
              : dialog.kind === "problem"
                ? "Расследование проблемы"
                : dialog.kind === "reauth"
                  ? "Повторное подтверждение личности"
                  : dialog.kind === "account"
                    ? "Новый технический сотрудник"
                    : dialog.kind === "residence"
                      ? "Город проживания инспектора"
                      : dialog.kind === "recovery"
                        ? "Восстановление доступа пользователя"
                        : dialog.kind === "recovery-result"
                          ? "Одноразовая ссылка восстановления"
                          : dialog.kind === "rule"
                            ? "Правило уведомлений"
                            : dialog.kind === "mute"
                              ? "Временно приглушить уведомление"
                              : dialog.kind === "export"
                                ? "Безопасный экспорт"
                                : dialog.kind === "instructions"
                                  ? "Инструкции обслуживания"
                                  : "Подробности"
          }
          close={() => setDialog(null)}
        >
          {dialog.kind === "instructions" ? (
            <Instructions />
          ) : dialog.kind === "export" ? (
            <>
              <p>
                Выгружена текущая страница. IP и сведения устройства не
                включены.
              </p>
              <Download value={dialog.value} name="Журнал_событий.json" />
            </>
          ) : dialog.kind === "recovery-result" ? (
            <>
              <div className="notice warning">
                Ссылка действует один раз до {date(dialog.value.expiresAt)}. Не
                публикуйте её. Токен не хранится в журнале; закрыв окно,
                повторно получить его нельзя.
              </div>
              <div className="secure-key">{dialog.value.link}</div>
              <button
                className="secondary"
                onClick={() =>
                  void navigator.clipboard.writeText(dialog.value.link)
                }
              >
                Скопировать ссылку
              </button>
              <p>{dialog.value.message}</p>
            </>
          ) : (
            <form onSubmit={submitDialog}>
              {dialog.kind === "journey" && (
                <>
                  <h3>{dialog.value.scope}</h3>
                  <p>{dialog.value.note}</p>
                  <p>
                    Событий: {dialog.value.total}. Страница {dialog.value.page}.
                  </p>
                  <ActivityTimeline events={dialog.value.events ?? []} />
                  <div className="actions">
                    {[dialog.value.page - 1, dialog.value.page + 1]
                      .filter(
                        (p) =>
                          p > 0 &&
                          (p - 1) * dialog.value.limit < dialog.value.total,
                      )
                      .map((p) => (
                        <button
                          type="button"
                          className="secondary"
                          key={p}
                          onClick={async () => {
                            try {
                              setDialog({
                                kind: "journey",
                                value: await api(
                                  "/journey?eventId=" +
                                    dialog.value.anchorId +
                                    "&page=" +
                                    p,
                                ),
                              });
                            } catch (e) {
                              displayError(e);
                            }
                          }}
                        >
                          Страница {p}
                        </button>
                      ))}
                  </div>
                </>
              )}
              {dialog.kind === "user-password" && (
                <>
                  <h3>
                    Временный пароль:{" "}
                    {dialog.value.name ?? dialog.value.fullName}
                  </h3>
                  <p>
                    Все сеансы будут завершены. При следующем входе пользователь
                    обязан установить свой пароль.
                  </p>
                  <label>
                    Временный пароль
                    <input
                      name="password"
                      type="password"
                      minLength={8}
                      maxLength={72}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  <label>
                    Повторите пароль
                    <input
                      name="confirmation"
                      type="password"
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  <label>
                    Основание и подтверждение личности
                    <textarea
                      name="reason"
                      minLength={5}
                      maxLength={1000}
                      required
                    />
                  </label>
                </>
              )}
              {dialog.kind === "user-block" && (
                <>
                  <h3>
                    {dialog.value.isBlocked
                      ? "Разблокировать"
                      : "Заблокировать"}
                    : {dialog.value.name ?? dialog.value.fullName}
                  </h3>
                  <p>
                    Действие и ваше имя будут сохранены в журнале. Все текущие
                    сеансы пользователя завершатся.
                  </p>
                  <label>
                    Основание
                    <textarea
                      name="reason"
                      minLength={5}
                      maxLength={1000}
                      required
                    />
                  </label>
                </>
              )}
              {dialog.kind === "deviation" && (
                <>
                  <h3>{dialog.value.explanation}</h3>
                  <p>
                    {dialog.value.inspection?.organization?.name} ·
                    Свидетельство{" "}
                    {dialog.value.inspection?.certificateNumber ??
                      "не выпущено"}
                  </p>
                  <Details value={dialog.value.facts} />
                  <label>
                    Статус
                    <select name="status" defaultValue={dialog.value.status}>
                      <option value="new">Новая</option>
                      <option value="in_progress">На проверке</option>
                      <option value="resolved">Устранено</option>
                      <option value="dismissed">
                        Нарушение не подтвердилось
                      </option>
                    </select>
                  </label>
                  <label>
                    Результат проверки
                    <textarea
                      name="reason"
                      minLength={5}
                      maxLength={1000}
                      required
                    />
                  </label>
                </>
              )}
              {dialog.kind === "problem" && (
                <>
                  <h3>{dialog.value.title}</h3>
                  <p>
                    <Badge value={dialog.value.severity} />{" "}
                    <Badge value={dialog.value.status} />
                  </p>
                  <dl className="definition">
                    <dt>Первое появление</dt>
                    <dd>{date(dialog.value.firstSeenAt)}</dd>
                    <dt>Последнее появление</dt>
                    <dd>{date(dialog.value.lastSeenAt)}</dd>
                    <dt>Повторений</dt>
                    <dd>{dialog.value.occurrences}</dd>
                    <dt>Определено аккаунтов</dt>
                    <dd>
                      {dialog.value.knownAccounts ?? dialog.value.affectedUsers}
                    </dd>
                    <dt>Попыток без установленного пользователя</dt>
                    <dd>{dialog.value.unidentifiedAttempts ?? "Нет данных"}</dd>
                    <dt>Ответственный</dt>
                    <dd>{dialog.value.assignedName ?? "Не назначен"}</dd>
                    <dt>Причина</dt>
                    <dd>Подтверждённые сведения указаны в событиях ниже</dd>
                  </dl>
                  <div className="notice">{dialog.value.recommendation}</div>
                  <section className="problem-context">
                    <h3>Кто столкнулся с проблемой</h3>
                    {dialog.value.participants?.length ? (
                      dialog.value.participants.map((actor: any) => (
                        <div
                          className="problem-person"
                          key={actor.kind + actor.id}
                        >
                          <ActorSummary actor={actor} />
                          {actor.kind === "application" &&
                            has("credentials.manage") && (
                              <div className="actions">
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() =>
                                    setDialog({
                                      kind: "user-password",
                                      value: actor,
                                    })
                                  }
                                >
                                  Сменить пароль
                                </button>
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() =>
                                    setDialog({
                                      kind: "user-block",
                                      value: actor,
                                    })
                                  }
                                >
                                  {actor.isBlocked
                                    ? "Разблокировать"
                                    : "Заблокировать"}
                                </button>
                              </div>
                            )}
                          <button
                            type="button"
                            className="textbutton"
                            onClick={() => {
                              navigate("events");
                              setAccountFilter({
                                id: actor.id,
                                kind: actor.kind,
                                name: actor.name,
                              });
                              setDialog(null);
                            }}
                          >
                            Все сохранённые действия этого аккаунта ↗
                          </button>
                          <p className="muted">
                            Последний сохранённый успешный вход до этой
                            проблемы:{" "}
                            {actor.lastSuccessfulLoginAt
                              ? date(actor.lastSuccessfulLoginAt)
                              : "В доступном журнале не найден"}
                          </p>
                          <small className="muted">{actor.profileNote}</small>
                        </div>
                      ))
                    ) : (
                      <p>
                        В сохранённых событиях нет подтверждённой связи с
                        аккаунтом. Это не означает, что никто не пытался войти.
                      </p>
                    )}
                  </section>
                  <section className="problem-context">
                    <h3>Что произошло и когда</h3>
                    <p className="muted">{dialog.value.historyNote}</p>
                    <ActivityTimeline
                      events={dialog.value.events ?? []}
                      openJourney={async (event) => {
                        try {
                          setDialog({
                            kind: "journey",
                            value: await api("/journey?eventId=" + event.id),
                          });
                        } catch (e) {
                          displayError(e);
                        }
                      }}
                    />
                    {!dialog.value.events?.length && (
                      <p>
                        Связанные события не найдены. Доступно только сводное
                        описание ошибки выше.
                      </p>
                    )}
                    {dialog.value.events?.length < dialog.value.eventTotal && (
                      <button
                        type="button"
                        className="secondary"
                        onClick={async () => {
                          try {
                            const next = await api(
                              "/problems/" +
                                dialog.value.id +
                                "?eventsPage=" +
                                (dialog.value.eventsPage + 1),
                            );
                            setDialog((current: any) =>
                              current?.value.id === next.id
                                ? {
                                    ...current,
                                    value: {
                                      ...next,
                                      events: [
                                        ...current.value.events,
                                        ...next.events,
                                      ],
                                    },
                                  }
                                : current,
                            );
                          } catch (e) {
                            displayError(e);
                          }
                        }}
                      >
                        Показать более ранние события · всего{" "}
                        {dialog.value.eventTotal}
                      </button>
                    )}
                  </section>

                  <button
                    type="button"
                    className="textbutton"
                    onClick={() => {
                      navigate("events");
                      setProblemFilter(dialog.value.id);
                      setQ("");
                      setDialog(null);
                      setNotice(
                        "Связанный номер обращения: " +
                          dialog.value.lastRequestId,
                      );
                    }}
                  >
                    Открыть журнал событий ↗
                  </button>
                  <Details
                    value={{
                      requestId: dialog.value.lastRequestId,
                      route: dialog.value.route,
                      code: dialog.value.code,
                      details: dialog.value.details,
                      versions: dialog.value.versions,
                    }}
                  />
                  {has("issues.manage") ? (
                    <div className="form-grid">
                      <label>
                        Статус
                        <select
                          name="status"
                          defaultValue={dialog.value.status}
                        >
                          {[
                            "new",
                            "in_progress",
                            "waiting",
                            "resolved",
                            "reopened",
                          ].map((x) => (
                            <option key={x} value={x}>
                              {label(x)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Ответственный
                        <select name="assignedTo" defaultValue="">
                          <option value="">Не изменять</option>
                          <option value="me">Взять на себя</option>
                        </select>
                      </label>
                      <label>
                        Исправляющая версия
                        <input
                          name="resolvedVersion"
                          defaultValue={dialog.value.resolvedVersion ?? ""}
                        />
                      </label>
                      <label>
                        Результат проверки
                        <select
                          name="verificationResult"
                          defaultValue={
                            dialog.value.verificationResult ?? "not_verified"
                          }
                        >
                          <option value="not_verified">Не проверено</option>
                          <option value="passed">
                            Проверка пройдена сотрудником
                          </option>
                          <option value="failed">Проверка не пройдена</option>
                        </select>
                      </label>
                      <label className="full">
                        Способ проверки
                        <textarea
                          name="verificationMethod"
                          defaultValue={dialog.value.verificationMethod ?? ""}
                          placeholder="Где, когда и на каких безопасных данных проверено"
                        />
                      </label>
                      <label className="full">
                        Комментарий без секретов и лишних персональных данных
                        <textarea name="note" required maxLength={2000} />
                      </label>
                    </div>
                  ) : null}
                  {dialog.value.comments?.map((c: any) => (
                    <div className="issue-comment" key={c.id}>
                      <small>
                        {c.authorName ?? "Автор не установлен"} ·{" "}
                        {date(c.createdAt)}
                      </small>
                      <p>{c.note}</p>
                    </div>
                  ))}
                </>
              )}
              {dialog.kind === "review" && (
                <div className="form-grid">
                  <label>
                    Результат ручной проверки
                    <select name="result">
                      <option value="reviewed">Просмотрено вручную</option>
                      <option value="quarantined">
                        Карантин: запретить выдачу файла
                      </option>
                    </select>
                  </label>
                  <label>
                    Основание
                    <textarea name="reason" required />
                  </label>
                  <p className="muted full">
                    Ручной просмотр не утверждает инспекцию и не подтверждает
                    подлинность документа автоматически.
                  </p>
                </div>
              )}
              {dialog.kind === "hold" && (
                <div className="form-grid">
                  <label>
                    Сохранить событие, дней
                    <input
                      name="days"
                      type="number"
                      min={1}
                      max={3650}
                      defaultValue={365}
                      required
                    />
                  </label>
                  <label>
                    Основание расследования
                    <textarea name="reason" required />
                  </label>
                </div>
              )}
              {dialog.kind === "password" && (
                <div className="form-grid">
                  <label className="full">
                    Новый пароль
                    <input
                      name="password"
                      type="password"
                      minLength={12}
                      maxLength={72}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  <label className="full">
                    Повторите пароль
                    <input
                      name="confirmation"
                      type="password"
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  <p className="muted full">
                    Сначала подтвердите личность. Остальные сеансы будут
                    завершены.
                  </p>
                </div>
              )}
              {dialog.kind === "reauth" && (
                <div className="form-grid">
                  <label className="full">
                    Текущий пароль
                    <input
                      name="password"
                      type="password"
                      required
                      autoComplete="current-password"
                    />
                  </label>
                  <div className="notice full">
                    Подтверждение паролем действует пять минут.
                  </div>
                </div>
              )}
              {dialog.kind === "access" && (
                <div className="form-grid">
                  <label>
                    Роль
                    <select name="role" defaultValue={dialog.value.role}>
                      {["support", "viewer", "engineer", "owner"].map(
                        (value) => (
                          <option key={value} value={value}>
                            {label(value)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="full">
                    Дополнительные разрешения сверх роли
                    <select
                      name="permissions"
                      multiple
                      defaultValue={dialog.value.permissions ?? []}
                      size={6}
                    >
                      {[
                        [
                          "people.read",
                          "Персональные данные ИО и пользователей",
                        ],
                        ["files.original", "Оригиналы документов"],
                        ["files.review", "Ручная проверка и карантин файлов"],
                        ["security.ip", "IP и сведения устройств"],
                        [
                          "credentials.manage",
                          "Одноразовое восстановление пароля",
                        ],
                        ["infrastructure.read", "Серверная инфраструктура"],
                      ].map(([value, title]) => (
                        <option key={value} value={value}>
                          {title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="full">
                    Основание изменения
                    <textarea name="reason" required />
                  </label>
                  <p className="muted full">
                    Все действующие сеансы этого технического сотрудника будут
                    отозваны.
                  </p>
                </div>
              )}
              {dialog.kind === "account" && (
                <div className="form-grid">
                  <label>
                    Логин
                    <input
                      name="login"
                      required
                      pattern="[a-z0-9._-]{3,48}"
                      maxLength={48}
                    />
                  </label>
                  <label>
                    ФИО сотрудника
                    <input name="fullName" required maxLength={150} />
                  </label>
                  <label>
                    Техническая роль
                    <select name="role">
                      {["support", "viewer", "engineer", "owner"].map((x) => (
                        <option value={x} key={x}>
                          {label(x)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Начальный личный пароль
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={72}
                      required
                    />
                  </label>
                  <label className="full">
                    Основание предоставления доступа
                    <textarea name="reason" required />
                  </label>
                  <div className="notice full">
                    Создание дополнительных технических аккаунтов отключено.
                    Поддержка не получает права восстановления базы или
                    просмотра оригиналов автоматически.
                  </div>
                </div>
              )}
              {dialog.kind === "residence" && (
                <div className="form-grid">
                  <label className="full">
                    Подтверждённый город проживания
                    <input
                      name="city"
                      placeholder="Например, Астана"
                      required
                    />
                  </label>
                  <label className="full">
                    Источник подтверждения, без копий документов
                    <textarea name="reason" required />
                  </label>
                </div>
              )}
              {dialog.kind === "recovery" && (
                <>
                  <div className="notice warning">
                    Сначала подтвердите личность владельца аккаунта по
                    согласованной процедуре. Будет выдана одноразовая ссылка на
                    10 минут. После её использования прежние сеансы отзываются.
                  </div>
                  <label>
                    Основание и номер обращения
                    <textarea name="reason" required />
                  </label>
                </>
              )}
              {dialog.kind === "mute" && (
                <div className="form-grid">
                  <label>
                    Минуты, максимум 1440
                    <input
                      name="minutes"
                      type="number"
                      min={1}
                      max={1440}
                      defaultValue={30}
                      required
                    />
                  </label>
                  <label>
                    Причина
                    <input name="reason" required />
                  </label>
                </div>
              )}
              {dialog.kind === "rule" && (
                <div className="form-grid">
                  <label>
                    Правило
                    <select
                      name="enabled"
                      defaultValue={String(dialog.value.enabled)}
                    >
                      <option value="true">Включено</option>
                      <option value="false">Выключено</option>
                    </select>
                  </label>
                  <label>
                    Порог событий
                    <input
                      type="number"
                      name="threshold"
                      min={1}
                      max={1000}
                      defaultValue={dialog.value.threshold}
                      required
                    />
                  </label>
                  <label>
                    Окно, минуты
                    <input
                      name="windowMinutes"
                      type="number"
                      min={1}
                      max={1440}
                      defaultValue={dialog.value.windowMinutes}
                      required
                    />
                  </label>
                  <label>
                    Период группировки, минуты
                    <input
                      name="cooldownMinutes"
                      type="number"
                      min={1}
                      max={1440}
                      defaultValue={dialog.value.cooldownMinutes}
                      required
                    />
                  </label>
                  <label>
                    Тихие часы: начало по UTC
                    <input
                      name="quietStart"
                      type="number"
                      min={0}
                      max={23}
                      defaultValue={dialog.value.quietStart ?? ""}
                    />
                  </label>
                  <label>
                    Тихие часы: конец по UTC
                    <input
                      name="quietEnd"
                      type="number"
                      min={0}
                      max={23}
                      defaultValue={dialog.value.quietEnd ?? ""}
                    />
                  </label>
                  <label className="full">
                    Получатели
                    <select
                      name="recipients"
                      defaultValue={
                        dialog.value.recipients?.join(",") ?? "owner,engineer"
                      }
                    >
                      <option value="owner">Владелец</option>
                      <option value="owner,engineer">
                        Владелец и инженеры
                      </option>
                      <option value="owner,engineer,support">
                        Владелец, инженеры и поддержка
                      </option>
                    </select>
                  </label>
                  <label className="full">
                    Основание изменения
                    <textarea name="reason" required />
                  </label>
                  <p className="muted full">
                    Критические уведомления не подавляются тихими часами.
                    Внешняя отправка не подключена.
                  </p>
                </div>
              )}
              {dialog.kind !== "journey" &&
                (dialog.kind !== "problem" || has("issues.manage")) && (
                  <div className="actions section-spacer">
                    <button className="primary" disabled={busy}>
                      {busy
                        ? "Сохраняем…"
                        : dialog.kind === "recovery"
                          ? "Выдать одноразовую ссылку"
                          : "Подтвердить"}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setDialog(null)}
                    >
                      Отмена
                    </button>
                  </div>
                )}
            </form>
          )}
          {error && (
            <div className="notice error">
              {error}
              {errorId && <p>Номер обращения: {errorId}</p>}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Overview({
  data,
  openProblem,
  go,
}: {
  data: any;
  openProblem: (id: string) => void;
  go: (s: Section) => void;
}) {
  const s = data.snapshot,
    c = data.counts;
  return (
    <>
      <div className={"status-banner " + data.status}>
        <span className="status-symbol">
          {data.status === "ok" ? "✓" : data.status === "urgent" ? "!" : "△"}
        </span>
        <div>
          <h2>
            {data.status === "ok"
              ? "Система работает"
              : data.status === "urgent"
                ? "Требуется срочное вмешательство"
                : "Есть проблемы"}
          </h2>
          <small>
            {data.status === "ok"
              ? "Подключённые источники не сообщают об активных проблемах."
              : "Проверьте события и состояние источников ниже."}
          </small>
        </div>
        <div className="time">
          Данные обновлены
          <br />
          {date(data.observedAt)}
        </div>
      </div>
      <div className="stats">
        {[
          {
            name: "Критические проблемы",
            value: c.critical,
            note: "Открытые расследования",
            symbol: "!",
          },
          {
            name: "Ошибки за период",
            value: c.errors,
            note: "За выбранный период",
            symbol: "△",
          },
          {
            name: "Подозрительные входы и отказы",
            value: c.security,
            note: "Сигналы требуют проверки",
            symbol: "◇",
          },
          {
            name: "Недоступные компоненты",
            value: c.unavailable,
            note: "По подключённым проверкам",
            symbol: "▤",
          },
        ].map((x) => (
          <div className="stat" key={x.name}>
            <div className="stat-name">
              {x.name}
              <span className="mini">{x.symbol}</span>
            </div>
            <div className="number">{x.value}</div>
            <small>
              {x.note} · {date(data.observedAt)}
            </small>
          </div>
        ))}
      </div>
      <div className="grid-two">
        <section className="card">
          <div className="card-head">
            <h2>Требует внимания</h2>
            <button className="textbutton" onClick={() => go("problems")}>
              Все проблемы ↗
            </button>
          </div>
          {data.attention.length ? (
            data.attention
              .sort(
                (a: any, b: any) =>
                  (a.severity === "critical" ? -1 : 1) -
                  (b.severity === "critical" ? -1 : 1),
              )
              .map((p: any) => (
                <div className="problem-row" key={p.id}>
                  <span className="problem-icon">△</span>
                  <div className="problem-text">
                    <strong>{p.title}</strong>
                    <small>
                      Последнее событие: {date(p.lastSeenAt)} · Повторений:{" "}
                      {p.occurrences}
                    </small>
                    <small>
                      Причина требует расследования ·{" "}
                      {p.assignedTo
                        ? "Есть ответственный"
                        : "Ответственный не назначен"}
                    </small>
                  </div>
                  <div>
                    <Badge value={p.severity} />
                    <p>
                      <button
                        className="textbutton"
                        onClick={() => openProblem(p.id)}
                      >
                        Разобраться →
                      </button>
                    </p>
                  </div>
                </div>
              ))
          ) : (
            <Empty>
              Активных проблем в журнале нет. Это не подтверждает состояние
              неподключённых источников.
            </Empty>
          )}
          <div className="notice">
            <strong>Контроль полноты данных</strong>
            <p>
              Последнее событие: {date(c.lastEventAt)}. Состояние сбора:{" "}
              {label(s.eventCollection?.state)}. Неподключённые источники
              проверяются отдельно.
            </p>
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Состояние сервисов</h2>
            <span className="muted">Сейчас</span>
          </div>
          {[
            ["Сервер приложения", s.application?.state],
            ["База данных", s.database?.state],
            ["Сборщик инфраструктуры", s.collector?.state],
            ["Журнал событий", s.eventCollection?.state],
            ["Внешние уведомления", s.externalNotifications?.state],
          ].map(([name, state]) => (
            <div className="service-row" key={name}>
              <span className="service-name">{name}</span>
              <Badge value={state} />
            </div>
          ))}
          {s.disk && (
            <div className="service-row">
              <div>
                <div className="service-name">Свободное место</div>
                <div className="service-note">{date(s.disk.observedAt)}</div>
              </div>
              <strong>{bytes(s.disk.availableBytes)}</strong>
            </div>
          )}
          <p className="footnote">
            Устаревшие или недоступные метрики не считаются исправным
            состоянием.
          </p>
        </section>
      </div>
    </>
  );
}

function Services({ data, check }: { data: any; check: () => void }) {
  return (
    <>
      <div className="actions" style={{ marginBottom: 18 }}>
        <button className="primary" onClick={check}>
          Проверить доступные сервисы
        </button>
      </div>
      <div className="stats">
        {[
          {
            name: "Процессор сервера",
            value:
              data.server.cpuPercent == null
                ? "Нет данных"
                : data.server.cpuPercent.toFixed(1) + " %",
            note: "Среднее между измерениями",
          },
          {
            name: "Свободная память",
            value: bytes(data.server.memoryFreeBytes),
            note: "Из " + bytes(data.server.memoryTotalBytes),
          },
          {
            name: "Свободное место",
            value: bytes(data.disk.availableBytes),
            note: "Из " + bytes(data.disk.totalBytes),
          },
          {
            name: "Время процесса",
            value:
              Math.floor(data.application.processUptimeSeconds / 60) + " мин",
            note: "Перезапуски — в данных сборщика",
          },
        ].map((x) => (
          <div className="stat" key={x.name}>
            <div className="stat-name">{x.name}</div>
            <div className="number" style={{ fontSize: 25 }}>
              {x.value}
            </div>
            <small>
              {x.note} · {date(data.observedAt)}
            </small>
          </div>
        ))}
      </div>
      <div className="grid-two">
        <div className="card">
          <h2>Подключённые компоненты</h2>
          {[
            ["Приложение", data.application],
            ["База данных", data.database],
            ["Файловое хранилище", data.storage],
            ["Обработка фотографий", data.photo],
            ["Redis и очереди", data.redis],
            ["Сборщик сервера", data.collector],
            ["Антивирус", data.antivirus],
            ["Внешние уведомления", data.externalNotifications],
          ].map(([name, value]: any) => (
            <div key={name} className="service-row">
              <div>
                <div className="service-name">{name}</div>
                <div className="service-note">
                  {value.explanation ?? "Проверка: " + date(value.observedAt)}
                </div>
              </div>
              <Badge value={value.state} />
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Надёжность мониторинга</h2>
          <dl className="definition">
            <dt>В очереди событий</dt>
            <dd>{data.eventCollection.pending}</dd>
            <dt>Ошибок записи</dt>
            <dd>{data.eventCollection.failures}</dd>
            <dt>Событий потеряно</dt>
            <dd>{data.eventCollection.dropped}</dd>
            <dt>Последняя запись</dt>
            <dd>{date(data.eventCollection.lastSuccess)}</dd>
            <dt>Источник инфраструктуры</dt>
            <dd>{label(data.collector.state)}</dd>
          </dl>
          <h3>Службы сервера</h3>
          {data.collector.services?.map((service: any) => (
            <div className="service-row" key={service.name}>
              <div>
                <strong>
                  {(
                    {
                      "reestr-backend": "Сервер приложения",
                      "reestr-admin": "Админка реестра",
                      "reestr-tech": "Техническая панель",
                      nginx: "Веб-сервер",
                      postgresql: "PostgreSQL",
                      "redis-server": "Redis",
                    } as Record<string, string>
                  )[service.name] ?? "Системная служба"}
                </strong>
                <div className="muted">
                  Перезапусков: {service.restarts ?? "Нет данных"}
                </div>
              </div>
              <Badge value={service.state} />
            </div>
          ))}
          {data.collector.certificates?.map((certificate: any) => (
            <p key={certificate.name}>
              <strong>Сертификат HTTPS</strong>
              <br />
              {certificate.name}
              <br />
              Истекает: {certificate.notAfter ?? "Нет данных"}
            </p>
          ))}
          <Details
            value={{
              application: data.application,
              database: data.database,
              photo: data.photo,
              collector: data.collector,
              eventCollection: data.eventCollection,
            }}
          />
          <div className="notice">
            Невозможность получить метрику не означает доказанную остановку
            сервиса. Проверяйте источник и связанные события.
          </div>
        </div>
      </div>
    </>
  );
}

const fileNames: Record<string, string> = {
  cylinder_label: "Бирка баллона",
  vehicle_photo: "Автомобиль",
  tech_passport: "Техпаспорт",
  tech_passport_back: "Техпаспорт, обратная сторона",
  applicant_application: "Заявка",
  applicant_questionnaire: "Анкета заявителя",
  gas_work_record: "Рабочая запись ГБО",
  cylinder_work_record: "Рабочая запись баллона",
  gas_inspection_report: "Отчёт инспекции ГБО",
  cylinder_inspection_report: "Отчёт инспекции баллона",
  certificate_document: "Свидетельство",
  photo: "Фотография",
};
function DataTable({
  section,
  tab,
  data,
  has,
  action,
}: {
  section: Section;
  tab: string;
  data: any;
  has: (s: string) => boolean;
  action: (kind: string, value: any) => void;
}) {
  const rows = data.items ?? [];
  if (!rows.length)
    return (
      <Empty>
        {data.state === "not_connected"
          ? "Источник не подключён. Показатели и успешные проверки не подставляются."
          : "За выбранный период записей нет."}
      </Empty>
    );
  let columns: { title: string; render: (r: any) => ReactNode }[] = [];
  const detail = (r: any) => <Details value={r} />;
  if (section === "events" || (section === "security" && tab === "events"))
    columns = [
      {
        title: "Время / источник",
        render: (r) => (
          <>
            {date(r.createdAt)}
            <div className="muted">
              {r.display?.sourceLabel ?? label(r.source)}
            </div>
          </>
        ),
      },
      {
        title: "Что произошло",
        render: (r) => (
          <>
            <strong>{r.display?.actionLabel ?? r.explanation}</strong>
            <p>{r.display?.message ?? r.explanation}</p>
            {r.objectContext && (
              <p>
                <b>{r.objectContext.organization.name}</b>
                <br />
                Госномер: {r.objectContext.vehicle.plateNumber}
                <br />
                Свидетельство:{" "}
                {r.objectContext.certificateNumber ?? "не выпущено"} ·{" "}
                {label(r.objectContext.status)}
              </p>
            )}
            <Details
              value={{
                action: r.action,
                requestId: r.requestId,
                objectType: r.objectType,
                objectId: r.objectId,
                details: r.details,
              }}
            />
            <button
              className="secondary"
              onClick={() => action("event-journey", r)}
            >
              Порядок действий сотрудника
            </button>
            {has("settings.manage") && (
              <button className="textbutton" onClick={() => action("hold", r)}>
                Сохранить для расследования
              </button>
            )}
          </>
        ),
      },
      {
        title: "Подключение / GPS",
        render: (r) => (
          <>
            <p>
              {r.ipAddress ? "IP: " + r.ipAddress : "IP не сохранён или скрыт"}
            </p>
            <p>{r.device ? readableDevice(r.device) : "Клиент не указан"}</p>
            <p>{r.appVersion ?? "Версия не передана"}</p>
            {r.location?.state === "available" ? (
              <p>
                GPS: {r.location.lat}, {r.location.lng} · ±
                {Math.round(r.location.accuracy)} м<br />
                <small>Сообщено клиентом · {date(r.location.capturedAt)}</small>
              </p>
            ) : (
              <p>
                GPS:{" "}
                {r.location?.state === "denied" ? "не разрешён" : "не получен"}
              </p>
            )}
          </>
        ),
      },
      {
        title: "Результат",
        render: (r) => (
          <Badge value={r.result} text={r.display?.outcomeLabel} />
        ),
      },
      {
        title: "Исполнитель",
        render: (r) => (
          <>
            <ActorSummary actor={r.actor} />
            {r.actor?.kind === "application" && has("credentials.manage") && (
              <button
                className="textbutton"
                onClick={() => action("support", r.actor)}
              >
                Помочь со входом / сменить пароль
              </button>
            )}
            {r.actor?.kind === "application" && has("accounts.manage") && (
              <button
                className="textbutton"
                onClick={() => action("user-block", r.actor)}
              >
                {r.actor.isBlocked ? "Разблокировать" : "Заблокировать"}
              </button>
            )}
          </>
        ),
      },
    ];
  if (section === "problems")
    columns = [
      {
        title: "Проблема",
        render: (r) => (
          <>
            <strong>{r.title}</strong>
            <div className="muted">Начало: {date(r.firstSeenAt)}</div>
            {r.latestEvent && (
              <>
                <ActorSummary actor={r.latestEvent.actor} />
                <p>{r.latestEvent.display?.message}</p>
              </>
            )}
          </>
        ),
      },
      {
        title: "Важность / статус",
        render: (r) => (
          <>
            <Badge value={r.severity} />
            <p>
              <Badge value={r.status} />
            </p>
          </>
        ),
      },
      {
        title: "Повторения",
        render: (r) => (
          <>
            {r.occurrences}
            <div className="muted">Последнее: {date(r.lastSeenAt)}</div>
          </>
        ),
      },
      {
        title: "Ответственный",
        render: (r) => (
          <>
            {r.assignedTo
              ? (r.assignedName ?? "Имя ответственного не установлено")
              : "Не назначен"}
          </>
        ),
      },
      {
        title: "Действие",
        render: (r) => (
          <button className="secondary" onClick={() => action("problem", r)}>
            Расследование →
          </button>
        ),
      },
    ];
  if (section === "files")
    columns = [
      {
        title: "Файл",
        render: (r) => (
          <>
            <strong>{fileNames[r.type] ?? "Документ инспекции"}</strong>
            <p>{r.inspection?.organization?.name ?? "ИО не указан"}</p>
            {r.inspection?.certificateNumber && (
              <p>Номер свидетельства: {r.inspection.certificateNumber}</p>
            )}
            {r.uploader ? (
              <ActorSummary actor={r.uploader} />
            ) : (
              <p className="muted">
                Автор загрузки не установлен по сохранённым данным
              </p>
            )}
            <p className="muted">
              {r.contentType ?? "Формат не записан"} · {bytes(r.sizeBytes)}
            </p>
            <div className="muted">{date(r.createdAt)}</div>
            <Details
              value={{
                id: r.id,
                inspectionId: r.inspectionId,
                checksum: r.checksum,
                model: r.moderationModel,
              }}
            />
          </>
        ),
      },
      {
        title: "Результат проверки",
        render: (r) => (
          <>
            <Badge value={r.moderationStatus} />
            <p>{r.moderationReason ?? "Проверка ранее не выполнялась"}</p>
            <div className="muted">{date(r.moderationCheckedAt)}</div>
          </>
        ),
      },
      {
        title: "Повторы / проверки",
        render: (r) => (
          <>
            <strong>
              {r.exactRepeats == null
                ? "Хеш не рассчитан"
                : r.exactRepeats > 1
                  ? "Совпадений: " + r.exactRepeats
                  : "Точных повторов нет"}
            </strong>
            <p>Антивирус: {r.antivirus}</p>
            {r.manualReview && (
              <p>
                {r.manualReview.result === "quarantined"
                  ? "⚠ Технический карантин"
                  : "Ручной просмотр зафиксирован"}{" "}
                · {date(r.manualReview.reviewedAt)} ·{" "}
                {r.reviewerName ?? "Имя проверявшего не установлено"}
              </p>
            )}
            <div className="muted">{r.fieldMatch}</div>
            {r.recheck && (
              <div className="notice warning">
                <b>Повторная проверка:</b> {label(r.recheck.moderationStatus)} ·{" "}
                {r.recheck.moderationReason}
                <br />
                {date(r.recheck.moderationCheckedAt)}
              </div>
            )}
            {has("files.review") && (
              <button
                className="secondary"
                onClick={() => action("recheck", r)}
              >
                Повторить проверку качества
              </button>
            )}
            {has("files.review") && (
              <button
                className="textbutton"
                onClick={() => action("review", r)}
              >
                Ручная проверка / карантин
              </button>
            )}
          </>
        ),
      },
      {
        title: "Действие",
        render: (r) =>
          has("files.original") ? (
            <button className="secondary" onClick={() => action("photo", r)}>
              Открыть оригинал ↗
            </button>
          ) : (
            <span className="muted">Нужны права на оригиналы</span>
          ),
      },
    ];
  if (section === "deviations")
    columns = [
      {
        title: "Инспекция",
        render: (r) => (
          <>
            <strong>
              {r.inspection?.organization?.name ?? "ИО недоступен"}
            </strong>
            <p>
              Свидетельство: {r.inspection?.certificateNumber ?? "не выпущено"}
            </p>
            <p>
              Инспектор: {r.inspection?.createdBy?.fullName ?? "не установлен"}
            </p>
            <p>{r.inspection?.address}</p>
            <small>{date(r.inspection?.createdAt)}</small>
          </>
        ),
      },
      {
        title: "Отклонение",
        render: (r) => (
          <>
            <strong>{r.explanation}</strong>
            <Details value={r.facts} />
            <p>{date(r.firstSeenAt)}</p>
          </>
        ),
      },
      {
        title: "Проверка",
        render: (r) => (
          <>
            <Badge value={r.status} />
            <p>
              {r.reviewedName ?? "Проверяющий не назначен"} ·{" "}
              {date(r.reviewedAt)}
            </p>
            <p>{r.reviewNote}</p>
            <button onClick={() => action("deviation", r)}>
              Разобраться / изменить статус
            </button>
          </>
        ),
      },
    ];
  if (section === "alerts")
    columns = [
      {
        title: "Уведомление",
        render: (r) => (
          <>
            <strong>{r.title}</strong>
            {r.photoRejection && (
              <button
                className="secondary"
                onClick={() => action("journey", r)}
              >
                Порядок действий сотрудника
              </button>
            )}
            {r.photoRejection ? (
              <>
                <div className="notice warning">
                  <b>Причина отказа: {r.photoRejection.label}</b>
                  <p>{r.photoRejection.reason}</p>
                </div>
                {r.photoRejection.actor && (
                  <ActorSummary actor={r.photoRejection.actor} />
                )}
                <p>Время попытки: {date(r.photoRejection.createdAt)}</p>
                {r.photoRejection.inspection && (
                  <p>
                    <b>{r.photoRejection.inspection.organization.name}</b> ·
                    Госномер {r.photoRejection.inspection.vehicle.plateNumber} ·
                    Свидетельство{" "}
                    {r.photoRejection.inspection.certificateNumber ??
                      "не выпущено"}
                  </p>
                )}
                {r.photoRejection.documentType && (
                  <p>
                    Документ:{" "}
                    {fileNames[r.photoRejection.documentType] ??
                      r.photoRejection.documentType}
                  </p>
                )}
                <p className="muted">
                  Результат автоматической проверки.
                  {r.photoRejection.code === "screen_capture" &&
                    " Признаки экрана требуют проверки и сами по себе не доказывают нарушение."}
                </p>
                <Details
                  value={{
                    requestId: r.photoRejection.requestId,
                    model: r.photoRejection.model,
                    reasonCode: r.photoRejection.code,
                  }}
                />
                {!r.photoRejection.actor && <p>{r.explanation}</p>}
              </>
            ) : (
              <p>{r.explanation}</p>
            )}
            <div className="muted">
              {date(r.lastSeenAt)} · Повторений: {r.repetitions}
            </div>
          </>
        ),
      },
      { title: "Важность", render: (r) => <Badge value={r.severity} /> },
      {
        title: "Обработка",
        render: (r) => (
          <>
            {r.acknowledgedAt ? "✓ Получение подтверждено" : "Не подтверждено"}
            {r.acknowledgedAt && (
              <p>
                {r.acknowledgedName ?? "Имя не установлено"} ·{" "}
                {date(r.acknowledgedAt)}
              </p>
            )}
            <p>
              {r.assignedTo
                ? (r.assignedName ?? "Имя ответственного не установлено")
                : "Ответственный не назначен"}
            </p>
            {r.mutedUntil && (
              <div className="muted">
                Приглушено до {date(r.mutedUntil)}. {r.muteReason}
              </div>
            )}
          </>
        ),
      },
      {
        title: "Действия",
        render: (r) =>
          has("alerts.manage") ? (
            <div className="actions">
              <button className="secondary" onClick={() => action("claim", r)}>
                Взять в работу
              </button>
              <button className="secondary" onClick={() => action("ack", r)}>
                Подтвердить получение
              </button>
              <button className="textbutton" onClick={() => action("mute", r)}>
                Приглушить
              </button>
            </div>
          ) : (
            <span className="muted">Только просмотр</span>
          ),
      },
    ];
  if (section === "accounts" && tab !== "people")
    columns = [
      {
        title: "Сотрудник",
        render: (r) => (
          <>
            <strong>{r.fullName}</strong>
            <div className="muted">Логин: {r.login}</div>
          </>
        ),
      },
      {
        title: "Роль",
        render: (r) => (
          <>
            {label(r.role)}
            {detail({ permissions: r.permissions })}
          </>
        ),
      },
      {
        title: "Доступ",
        render: (r) => (
          <>
            <Badge value={r.active ? "active" : "blocked"} />
            <p>Вход по логину и паролю</p>
          </>
        ),
      },
      {
        title: "Действие",
        render: () => (
          <span className="muted">Единственный владелец панели</span>
        ),
      },
    ];
  if (section === "accounts" && tab === "people")
    columns = [
      {
        title: "Пользователь",
        render: (r) => (
          <>
            <strong>{r.fullName}</strong>
            <div className="muted">{r.phoneMasked}</div>
            <Details value={{ id: r.id, roles: r.roles }} />
          </>
        ),
      },
      {
        title: "Состояние входа",
        render: (r) => (
          <>
            <Badge value={r.isBlocked ? "blocked" : "active"} />
            <p>
              {r.mustChangePassword
                ? "Требуется смена временного пароля"
                : "Личный пароль установлен"}
            </p>
            <div className="muted">Последний вход: {date(r.lastLoginAt)}</div>
          </>
        ),
      },
      {
        title: "Организации",
        render: (r) => (
          <>
            {r.memberships?.map((m: any, i: number) => (
              <p key={i}>
                {m.organization.name} · {label(m.role)}
              </p>
            ))}
          </>
        ),
      },
      {
        title: "Действия",
        render: (r) => (
          <div className="actions">
            {has("credentials.manage") && (
              <button
                className="secondary"
                onClick={() => action("user-password", r)}
              >
                Сменить пароль
              </button>
            )}
            {has("accounts.manage") && (
              <button
                className="secondary"
                onClick={() => action("user-block", r)}
              >
                {r.isBlocked ? "Разблокировать" : "Заблокировать"}
              </button>
            )}
            {has("accounts.manage") && (
              <button
                className="textbutton"
                onClick={() => action("residence", r)}
              >
                Уточнить город проживания
              </button>
            )}
          </div>
        ),
      },
    ];
  if (section === "backups")
    columns = [
      {
        title: "Копия",
        render: (r) => (
          <>
            <strong>{date(r.createdAt)}</strong>
            <Details value={{ id: r.id }} />
          </>
        ),
      },
      {
        title: "Состав и размер",
        render: (r) => (
          <>
            База: {bytes(r.databaseBytes)}
            <p>Файлы: {bytes(r.storageBytes)}</p>
          </>
        ),
      },
      {
        title: "Проверка",
        render: (r) => (
          <>
            <Badge value={r.state} />
            <p>
              {r.restoreVerifiedAt
                ? "Изолированное восстановление: " + date(r.restoreVerifiedAt)
                : "Восстановление не подтверждено"}
            </p>
          </>
        ),
      },
      {
        title: "Срок хранения",
        render: (r) => (
          <>
            {r.retentionDays ?? "Нет данных"} дней
            <div className="muted">
              Восстановление production из браузера запрещено
            </div>
          </>
        ),
      },
    ];
  if (section === "releases")
    columns = [
      {
        title: "Выпуск",
        render: (r) => (
          <>
            <strong>
              {r.version ? "Версия зафиксирована" : "Версия не зафиксирована"}
            </strong>
            <Details value={{ version: r.version, id: r.id }} />
          </>
        ),
      },
      {
        title: "Время",
        render: (r) => (
          <>
            {date(r.deployedAt ?? r.observedAt)}
            <div className="muted">
              {r.deployedAt ? "Из манифеста" : "Время обнаружения"}
            </div>
          </>
        ),
      },
      {
        title: "Состояние",
        render: (r) => (
          <>
            {r.current ? (
              <Badge value="active" text="Текущий выпуск" />
            ) : (
              <span>Сохранённый выпуск</span>
            )}
          </>
        ),
      },
    ];
  if (section === "security" && tab === "organizations")
    columns = [
      {
        title: "Инспекционный орган",
        render: (r) => (
          <>
            <strong>{r.name}</strong>
            <p>
              <Badge value={r.status} />
            </p>
            <div className="muted">{r.address ?? "Адрес не указан"}</div>
          </>
        ),
      },
      {
        title: "Аккредитация",
        render: (r) => (
          <>
            {date(r.accreditationValidFrom)}
            <p>до {date(r.accreditationValidUntil)}</p>
          </>
        ),
      },
      {
        title: "Сотрудники",
        render: (r) => (
          <>
            {r.members.map((m: any, i: number) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <strong>{m.user.fullName}</strong>
                <div>
                  {label(m.role)} ·{" "}
                  {m.user.isBlocked ? "Заблокирован" : "Активен"}
                </div>
                <div className="muted">
                  Город проживания: {m.user.residenceCity ?? "Нет данных"}
                </div>
                <div className="muted">
                  Последний вход: {date(m.user.lastLoginAt)}
                </div>
                {has("accounts.manage") && (
                  <button
                    className="textbutton"
                    onClick={() => action("residence", m.user)}
                  >
                    Уточнить город
                  </button>
                )}
              </div>
            ))}
          </>
        ),
      },
      {
        title: "Инспекции",
        render: (r) => (
          <>
            {r._count.inspections}
            <p className="muted">Подозрения доступны в разделе географии</p>
          </>
        ),
      },
    ];
  if (section === "security" && tab === "geography")
    columns = [
      {
        title: "Инспекция / ИО",
        render: (r) => (
          <>
            <strong>{r.organization.name}</strong>
            <div className="muted">{date(r.createdAt)}</div>
            <Details
              value={{ inspectionId: r.id, inspectorId: r.inspector?.id }}
            />
          </>
        ),
      },
      {
        title: "Место инспекции",
        render: (r) => (
          <>
            <strong>{r.facts.place.city ?? "Нет данных"}</strong>
            <div className="muted">
              {label(r.facts.place.source)}
              {r.facts.place.approximate ? " · Приблизительно" : ""}
            </div>
          </>
        ),
      },
      {
        title: "Инспектор",
        render: (r) => (
          <>
            <strong>{r.inspector?.fullName ?? "Не указан"}</strong>
            <p>Проживание: {r.facts.inspectorCity ?? "Нет данных"}</p>
            <Badge
              value={
                r.facts.inspectorMismatch
                  ? "review_required"
                  : r.facts.missingInspector || r.facts.missingInspection
                    ? "no_data"
                    : "success"
              }
              text={
                r.facts.inspectorMismatch
                  ? "⚠ Разные города"
                  : r.facts.missingInspector || r.facts.missingInspection
                    ? "Недостаточно данных"
                    : "Совпадение по доступным данным"
              }
            />
          </>
        ),
      },
      {
        title: "Владелец автомобиля",
        render: (r) => (
          <>
            Проживание: {r.facts.ownerCity ?? "Нет данных"}
            <p>
              <Badge
                value={
                  r.facts.ownerMismatch
                    ? "review_required"
                    : r.facts.missingOwner || r.facts.missingInspection
                      ? "no_data"
                      : "success"
                }
                text={
                  r.facts.ownerMismatch
                    ? "⚠ Разные города"
                    : r.facts.missingOwner || r.facts.missingInspection
                      ? "Недостаточно данных"
                      : "Совпадение по доступным данным"
                }
              />
            </p>
          </>
        ),
      },
    ];
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.title}>{c.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={r.id ?? i}>
              {columns.map((c) => (
                <td key={c.title}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Settings({
  data,
  edit,
  manage,
}: {
  data: any;
  edit: (r: any) => void;
  manage: boolean;
}) {
  const existing = data.rules ?? [];
  const rules = ["error", "security", "monitoring"].map(
    (category) =>
      existing.find((r: any) => r.category === category) ?? {
        category,
        enabled: true,
        threshold: category === "security" ? 5 : 1,
        windowMinutes: 15,
        cooldownMinutes: 30,
        recipients: ["owner", "engineer"],
      },
  );
  return (
    <>
      <div className="grid-two">
        <div className="card">
          <h2>Правила внутренних уведомлений</h2>
          {rules.map((r: any) => (
            <div className="service-row" key={r.category}>
              <div>
                <strong>{label(r.category)}</strong>
                <div className="service-note">
                  Порог: {r.threshold} · Окно: {r.windowMinutes} мин ·
                  Группировка: {r.cooldownMinutes} мин
                </div>
                <div className="service-note">
                  Получатели:{" "}
                  {r.recipients.map((x: string) => label(x)).join(", ")}
                </div>
              </div>
              {manage ? (
                <button className="secondary" onClick={() => edit(r)}>
                  Настроить
                </button>
              ) : (
                <Badge value={r.enabled ? "active" : "disabled"} />
              )}
            </div>
          ))}
          <div className="notice warning">
            Внешние каналы: Не подключено. Постановка в журнал не означает
            отправку или прочтение.
          </div>
        </div>
        <div className="card">
          <h2>Хранение и безопасность</h2>
          <dl className="definition">
            <dt>Технические ошибки</dt>
            <dd>{data.retention.errorDays} дней</dd>
            <dt>Безопасность</dt>
            <dd>{data.retention.securityDays} дней</dd>
            <dt>Аудит действий</dt>
            <dd>{data.retention.auditDays} дней</dd>
            <dt>Материалы расследования</dt>
            <dd>Сохранение по регламенту</dd>
          </dl>
          <p className="muted">
            Удаление просроченных записей выполняется только регламентным
            процессом после защищённого архивирования. Произвольного удаления
            событий из панели нет.
          </p>
          <div className="notice">{data.dangerousOperations.explanation}</div>
        </div>
      </div>
      <section className="card section-spacer">
        <h2>Короткие инструкции</h2>
        <Instructions />
      </section>
    </>
  );
}
const runbooks = [
  {
    title: "Пользователь не может войти",
    check:
      "Найдите пользователя по телефону в разделе доступа. Проверьте блокировку, роль ИО, членство, БИН, обязательную смену пароля и связанные отказы входа.",
    safe: "Попросите проверить номер, БИН и дату на устройстве. Владелец после подтверждения личности может выдать одноразовую ссылку восстановления.",
    stop: "Не просите пароль пользователя. Не снимайте блокировку без причины. При неизвестном владельце аккаунта передайте вопрос владельцу панели.",
  },
  {
    title: "Не загружается фотография",
    check:
      "Проверьте номер обращения, размер и фактический формат файла, результат локальной проверки, очередь и доступность хранилища.",
    safe: "Попросите переснять оригинал при плохом качестве. Совпадение хеша и необычная фотография требуют контекста, а не обвинения.",
    stop: "Не отправляйте документы во внешние сервисы. При ошибках диска остановите повторные загрузки и передайте инженеру.",
  },
  {
    title: "Не создаётся свидетельство",
    check:
      "Проверьте комплектность инспекции, тип газа, дату выпуска баллона, обязательные документы, этап контроля качества и утверждение руководителем.",
    safe: "Откройте связанные события по номеру обращения. Исправьте исходные данные штатным процессом возврата.",
    stop: "Не создавайте дубликат свидетельства и не меняйте записи SQL-командой. Ошибки согласованности передайте инженеру и владельцу.",
  },
  {
    title: "Заканчивается место",
    check:
      "Проверьте свободный объём, рост журналов, число выпусков и состояние резервных копий. Убедитесь, что метрики свежие.",
    safe: "Проверьте настройку ротации. Инженер по регламенту может убрать старые сборочные артефакты после проверки текущего выпуска.",
    stop: "Не удаляйте оригиналы документов, рабочую базу и единственную резервную копию. Передайте владельцу инфраструктуры.",
  },
  {
    title: "Недоступна база",
    check:
      "Различайте сбой соединения и недоступность источника мониторинга. Проверьте состояние процесса и подключения без чтения текстов запросов с данными.",
    safe: "Сохраните номер обращения и время. По регламенту проверьте сервис PostgreSQL и доступность диска.",
    stop: "Не запускайте автоматическое восстановление поверх рабочей базы. При признаках повреждения остановитесь и передайте владельцу и инженеру.",
  },
  {
    title: "Подозрительная активность",
    check:
      "Проверьте сработавшее правило, повторения, время, принадлежность объектов и подтверждённость городов. GPS и IP могут быть приблизительными.",
    safe: "Назначьте ответственного, сохраните материалы расследования, уточните законность выезда и исходные данные.",
    stop: "Не называйте человека нарушителем по одному слабому признаку. Не вводите бессрочную блокировку автоматически. Эскалируйте владельцу.",
  },
  {
    title: "Как проверить резервную копию",
    check:
      "Проверьте манифест, возраст, состав, контрольные суммы и последнюю дату подтверждённого восстановления.",
    safe: "Восстанавливайте только в отдельную тестовую БД и отдельное хранилище. Сверьте таблицы, число записей и хеши искусственных файлов.",
    stop: "Не используйте адрес рабочей БД как цель проверки. При несовпадении контрольных сумм остановитесь и передайте инженеру и владельцу.",
  },
];
function Instructions() {
  return (
    <div className="section-spacer">
      {runbooks.map((r) => (
        <details className="instruction" key={r.title}>
          <summary>{r.title}</summary>
          <p>
            <strong>Что проверить.</strong> {r.check}
          </p>
          <p>
            <strong>Безопасные действия.</strong> {r.safe}
          </p>
          <p>
            <strong>Когда остановиться и передать.</strong> {r.stop}
          </p>
        </details>
      ))}
    </div>
  );
}
