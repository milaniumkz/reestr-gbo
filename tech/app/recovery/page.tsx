"use client";
import { FormEvent, useEffect, useState } from "react";
export default function Recovery() {
  const [token, setToken] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setToken(location.hash.slice(1));
    history.replaceState(null, "", location.pathname);
  }, []);
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
      if (r.ok) setToken("");
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
        <h2>Установите личный пароль</h2>
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
        ) : (
          <div className="notice">
            Нужна действующая ссылка, выданная владельцем после подтверждения
            личности. Автоматическая отправка ссылок не подключена.
          </div>
        )}
        <p>
          <a href="https://89-207-255-42.sslip.io/">Открыть приложение</a>
        </p>
      </div>
    </div>
  );
}
