[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"

отвечай коротко и понятно

Всегда применяй навык `limit-efficient-quality`: максимально экономь лимиты токенов, инструментов, времени и контекста, но не снижай качество результата.

# Проект

- Flutter приложение: `lib/`, `android/`, `ios/`, `web/`.
- Backend: `backend/` на NestJS + Prisma + PostgreSQL.
- Admin web: `admin/` на Next.js.
- Ops: `ops/` systemd/nginx/backup/deploy.

# Проверки

- Flutter: `/Volumes/PD1000/job/flutter/bin/flutter analyze`, `/Volumes/PD1000/job/flutter/bin/flutter test`.
- Backend: `cd backend && npm ci && npm run build && npm test -- --runInBand`.
- Admin: `cd admin && npm ci && npm run build`.

# Правила

- Не коммитить `.env`, секреты, ключи подписи, `node_modules`, `build`, `.next`, `backend/dist`, пользовательские загрузки и дампы БД.
- Миграции Prisma хранить в `backend/prisma/migrations`.
- Production-данные находятся на сервере: PostgreSQL и `/opt/reestr/storage`; не перезаписывать их деплоем.
- Перед production-деплоем делать backup через `ops/backup-reestr.sh`.
