"use client";
import { useEffect, useState } from "react";
import { api, date } from "./api";
function decodeKey(key: string) {
  const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export default function PushControls() {
  const [message, setMessage] = useState(""),
    [supported, setSupported] = useState(false),
    [active, setActive] = useState(false),
    [busy, setBusy] = useState(false),
    [last, setLast] = useState<any>(null);
  useEffect(() => {
    setSupported(
      window.isSecureContext &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window,
    );
    void (async () => {
      try {
        const registration =
          await navigator.serviceWorker.getRegistration("/tech/");
        const subscription = await registration?.pushManager.getSubscription();
        const status = await api("/push");
        setActive(!!subscription && status.subscriptions.length > 0);
        setLast(status.subscriptions[0]);
      } catch {}
    })();
  }, []);
  async function operate(action: "enable" | "disable" | "test") {
    setBusy(true);
    setMessage("");
    try {
      if (action === "enable") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted")
          throw new Error(
            "Уведомления не разрешены. Разрешите их в настройках сайта в браузере.",
          );
        const status = await api("/push");
        const registration = await navigator.serviceWorker.register(
          "/tech/notification-sw.js",
          { scope: "/tech/" },
        );
        await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: decodeKey(status.publicKey),
          }));
        await api("/push/subscribe", { subscription: subscription.toJSON() });
        setActive(true);
        setMessage(
          "Браузер подключён. Новые уведомления будут приходить и при закрытой вкладке.",
        );
      } else {
        const registration =
          await navigator.serviceWorker.getRegistration("/tech/");
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) throw new Error("Подключите этот браузер заново");
        if (action === "test") {
          await api("/push/test", { endpoint: subscription.endpoint });
          setMessage(
            "Служба push приняла тестовое уведомление. Проверьте уведомления устройства.",
          );
        } else {
          await api("/push/unsubscribe", { endpoint: subscription.endpoint });
          await subscription.unsubscribe();
          setActive(false);
          setMessage("Уведомления этого браузера отключены");
        }
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось подключить уведомления",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h3>Push-уведомления браузера</h3>
      <p>
        Приходят без открытой вкладки после вашего разрешения. Система и браузер
        должны разрешать фоновые уведомления. На iPhone добавьте сайт на главный
        экран.
      </p>
      <p>
        В уведомлении нет ФИО, документов или паролей. Подробности открываются
        после входа в панель.
      </p>
      {supported ? (
        <div className="actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => void operate("enable")}
          >
            {active ? "Переподключить браузер" : "Разрешить уведомления"}
          </button>
          {active && (
            <>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void operate("test")}
              >
                Проверить push
              </button>
              <button
                type="button"
                className="textbutton"
                disabled={busy}
                onClick={() => void operate("disable")}
              >
                Отключить
              </button>
            </>
          )}
        </div>
      ) : (
        <p>
          Этот браузер не поддерживает Web Push или страница открыта без HTTPS.
        </p>
      )}
      {last && (
        <p>
          Последняя доставка: {date(last.lastSuccessAt)}
          {last.lastError ? " · " + last.lastError : ""}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
