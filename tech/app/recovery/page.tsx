"use client";
import { FormEvent, useEffect, useState } from "react";
export default function Recovery() {
  const [token, setToken] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [completed, setCompleted] = useState(false);
  useEffect(() => {
    function readToken() {
      if (!location.hash) return;
      setToken(location.hash.slice(1));
      setCompleted(false);
      setMessage("");
      history.replaceState(null, "", location.pathname);
    }
    readToken();
    window.addEventListener("hashchange", readToken);
    return () => window.removeEventListener("hashchange", readToken);
  }, []);
  async function request(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await fetch("/api/v1/auth/recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(f.entries())),
      });
      const value = await r.json();
      setMessage(
        Array.isArray(value.message)
          ? value.message.join(". ")
          : (value.message ?? "Не удалось выполнить запрос"),
      );
    } catch {
      setMessage("Соединение потеряно. Повторите запрос.");
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await fetch("/api/v1/auth/recovery/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: f.get("password"),
          confirmation: f.get("confirmation"),
        }),
      });
      const value = await r.json();
      setMessage(value.message ?? "Не удалось выполнить запрос");
      if (r.ok) {
        setToken("");
        setCompleted(true);
      }
    } catch {
      setMessage("Соединение потеряно. Повторите запрос.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-form-side" style={{ minHeight: "100vh" }}>
      <div className="login-form">
        <div className="eyebrow">ЕРСИ ГБО · Восстановление доступа</div>
        <h2>
          {completed
            ? "Пароль изменён"
            : token
              ? "Установите личный пароль"
              : "Забыли пароль"}
        </h2>
        <p className="muted">
          Одноразовая ссылка действует 10 минут. После смены пароля прежние
          сеансы будут завершены.
        </p>
        {message && (
          <div className="notice" role="status">
            {message}
          </div>
        )}
        {token ? (
          <form onSubmit={submit}>
            <label>
              Новый пароль
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={72}
                required
              />
            </label>
            <label>
              Повторите пароль
              <input
                name="confirmation"
                type="password"
                autoComplete="new-password"
                required
                maxLength={72}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Сохраняем…" : "Изменить пароль"}
            </button>
          </form>
        ) : completed ? (
          <p>Войдите в приложение с новым личным паролем.</p>
        ) : (
          <form onSubmit={request}>
            <p>
              Введите данные сотрудника. Руководитель ИО или технический
              администратор проверит личность и передаст одноразовую ссылку.
            </p>
            <label>
              БИН организации
              <input
                name="bin"
                inputMode="numeric"
                pattern="[0-9]{12}"
                maxLength={12}
                required
              />
            </label>
            <label>
              Номер телефона
              <input name="phone" type="tel" maxLength={32} required />
            </label>
            <label>
              Фамилия, имя, отчество
              <input name="fullName" maxLength={200} required />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Отправляем…" : "Отправить заявку"}
            </button>
          </form>
        )}
        <p>
          <a href="https://89-207-255-42.sslip.io/">Открыть приложение</a>
        </p>
      </div>
    </div>
  );
}
