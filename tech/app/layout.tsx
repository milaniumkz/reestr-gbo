import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = {
  title: "ЕРСИ ГБО · Техническая панель",
  description: "Защищённая техническая панель обслуживания ЕРСИ ГБО",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
