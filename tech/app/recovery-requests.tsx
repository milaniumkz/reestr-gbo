"use client";
import { useEffect, useState } from "react";
import { api, date } from "./api";
export default function RecoveryRequests() {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      setRows((await api("/recovery-requests")).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить заявки");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 30000);
    return () => clearInterval(timer);
  }, []);
  async function approve(id: string) {
    if (
      !confirm(
        "Личность сотрудника проверена по известному вам каналу? Передавайте ссылку только этому сотруднику.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setLink("");
    try {
      const result = await api("/recovery-requests/" + id + "/approve", {});
      setLink(location.origin + "/tech/recovery/#" + result.token);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось подтвердить заявку",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Заявки восстановления доступа</h2>
      <p>
        Подтвердите личность сотрудника перед выдачей ссылки. Ссылка
        одноразовая, действует 10 минут. Пароли и ссылки не сохраняются в
        журнале.
      </p>
      <button onClick={() => void load()} disabled={busy}>
        Обновить заявки
      </button>
      {error && <p role="alert">{error}</p>}
      {link && (
        <div className="notice">
          <p>Передайте ссылку только подтверждённому сотруднику:</p>
          <input
            aria-label="Одноразовая ссылка"
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
          />
          <button onClick={() => navigator.clipboard.writeText(link)}>
            Скопировать ссылку
          </button>
        </div>
      )}
      {!rows.length && !busy && <p>Нет ожидающих заявок</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Организация / БИН</th>
              <th>Сотрудник / телефон</th>
              <th>Дата заявки</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.organization?.name}
                  <br />
                  {r.organization?.bin}
                </td>
                <td>
                  {r.user?.fullName}
                  <br />
                  {r.user?.phone}
                </td>
                <td>{date(r.createdAt)}</td>
                <td>
                  <button disabled={busy} onClick={() => void approve(r.id)}>
                    Личность проверена — выдать ссылку
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
