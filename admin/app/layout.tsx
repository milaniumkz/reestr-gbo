import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ЕРСИ ГБО Admin',
  description: 'Администрирование реестра ЕРСИ ГБО',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
