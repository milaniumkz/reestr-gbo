# ЕРСИ ГБО

Flutter-приложение для демонстрации дизайна из `ers_gbo_clean_eco_v7_design_pages.pdf`.

## Что внутри

- Кодовый Flutter UI, собранный виджетами, а не скриншотами.
- 40 экранов по PDF: заставка, роли, вход, SMS, поиск, свидетельство, документ, карта, инспекционный орган, фотофиксация, камера, тарифы, НЦА, API камер, госорган, уведомления, профиль.
- Интерактивные переходы между экранами через кнопки, bottom navigation и stepper `1/40`.
- Терминология «ЕРСИ ГБО», «Инспекционный орган», «Владелец транспорта с ГБО», «Оператор АЦТО», «Госорган», «НЦА».
- Фиксированный дизайн-фрейм `430 x 932`, как в PDF, с масштабированием под экран устройства.
- Production-каркас: `backend/` на NestJS + Prisma + PostgreSQL и `admin/` на Next.js.

PNG-файлы из PDF в `assets/screens/` оставлены только как референс. Они не подключены в
`pubspec.yaml` и не используются в интерфейсе приложения.

## Запуск

```sh
/Volumes/PD1000/job/flutter/bin/flutter pub get
/Volumes/PD1000/job/flutter/bin/flutter run
```

Для Web-демо:

```sh
/Volumes/PD1000/job/flutter/bin/flutter run -d web-server --web-hostname 0.0.0.0 --web-port 4173
```

## Реальные данные

Локальная инфраструктура:

```sh
docker compose up -d postgres redis minio
```

Backend:

```sh
cd backend
cp .env.example .env
npm install
npm run prisma:migrate -- --name init
npm run prisma:seed
npm run dev
```

После изменений в `backend/prisma/schema.prisma` применяйте новую миграцию:

```sh
cd backend
npm run prisma:migrate -- --name update_schema
```

Flutter с реальным API:

```sh
/Volumes/PD1000/job/flutter/bin/flutter run -d web-server --web-hostname 0.0.0.0 --web-port 4173 --dart-define=APP_MODE=prod --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

Admin web:

```sh
cd admin
npm install
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1 npm run dev
```

SMS и платежи сейчас подключены через production-ready adapter interfaces. Для боевого запуска нужно заменить `mock` provider на реальные credentials в `.env`.

Загрузка фото/документов инспекции идёт в S3-compatible storage через `POST /api/v1/inspections/:id/photos`
с multipart полями `file` и `type`. Локально используется MinIO из `docker-compose.yml`.

Импорт заполненного XLSX-свидетельства идёт через `POST /api/v1/certificates/import-xlsx`.
Backend сохраняет оригинал файла, создаёт `CertificateImportJob`, проверяет hash файла и
разносит данные в ТС, владельца, баллон, инспекцию и свидетельство. XLSX читается через
минимальный ZIP/XML parser без уязвимого пакета `xlsx`.
Во Flutter кабинете инспекционного органа есть кнопка «Загрузить XLSX свидетельство»,
которая выбирает `.xlsx` файл и отправляет его в этот endpoint.

При переводе инспекции в `approved` через `PATCH /api/v1/inspections/:id/status` backend автоматически
создаёт свидетельство `ERSI-YYYY-000001` с QR payload и сроком действия 2 года.
Свидетельства доступны списком через `GET /api/v1/certificates?q=...`; в админке есть отдельный
раздел «Свидетельства» со ссылками на PDF и public verify.
Статус свидетельства меняется через `PATCH /api/v1/certificates/:number/status`; suspended
свидетельство не проходит public verify как valid.
Список свидетельств возвращает `_count.views`; админка показывает количество public verify-просмотров.

Авторизация использует SMS OTP, JWT access token на 15 минут и refresh token rotation через таблицу
`sessions`. Logout отзывает текущую device session.
Пользователи создаются через `POST /api/v1/users`; в админке раздел «Пользователи и роли»
заводит ФИО, телефон, ИИН и начальную роль.

Уведомления управляются через `GET/POST /api/v1/notifications`,
`PATCH /api/v1/notifications/:id/read` и `DELETE /api/v1/notifications/:id`.

Внешняя интеграция камер использует API key в header `x-api-key`:
`GET /api/v1/cameras/external` и `POST /api/v1/cameras/external/:id/session`.
Камеры создаются через `POST /api/v1/cameras`; в админке раздел «Камеры/API» сохраняет
организацию, имя камеры, RTSP URL и HLS path.
Video session запускается через `POST /api/v1/cameras/:id/session`; в админке это кнопка
«Сессия» у камеры.
Последние video sessions доступны через `GET /api/v1/cameras/sessions` и отображаются в разделе
«Камеры/API».
Live-сессию можно завершить через `PATCH /api/v1/cameras/sessions/:id/end`.

Основные списки backend поддерживают `page` и `limit` query params, например
`GET /api/v1/inspections?page=1&limit=50`.
Для серверного поиска используйте `q`, например `GET /api/v1/users?q=operator&limit=50`.

Тарифы управляются через `GET/POST /api/v1/tariffs` и `PATCH /api/v1/tariffs/:code/toggle`.
Invoice можно создать по тарифу: `POST /api/v1/payments/invoice` с `organizationId` и `tariffCode`.
В локальном mock-режиме админка может подтвердить pending payment через
`POST /api/v1/payments/webhook/mock`; после подтверждения баланс организации увеличивается.
В разделе «Платежи» админка позволяет выбрать организацию, для которой создаётся invoice.
В таблице платежей отображается организация, поэтому видно, чей баланс будет пополнен после webhook.

Инспекцию можно одобрить только после readiness-проверки:
`GET /api/v1/inspections/:id/readiness`. Для одобрения нужны фото типов
`cylinder_label`, `vehicle_photo`, `tech_passport`, данные владельца и баллона.

ТС, владелец и баллон создаются через `POST /api/v1/vehicles`; список доступен через `GET /api/v1/vehicles?q=...`.
В админке эти данные заводятся через разделы «Инспекционные органы» и «Реестр ТС/ГБО»:
форма ТС сохраняет VIN, госномер, марку, модель, владельца и баллон через реальные API.
В разделе «Инспекционные органы» можно привязать пользователя к организации через
`POST /api/v1/organizations/:id/members`.
Удаление участника доступно через `DELETE /api/v1/organizations/:id/members/:memberId`.
Раздел «Инспекции» создаёт новую инспекцию по выбранному инспекционному органу и ТС через
`POST /api/v1/inspections`.
Там же можно загрузить обязательные файлы readiness-проверки: `vehicle_photo`,
`cylinder_label`, `tech_passport`.

## Проверка

```sh
/Volumes/PD1000/job/flutter/bin/flutter analyze
/Volumes/PD1000/job/flutter/bin/flutter test
cd backend && npm run build
cd backend && npm test -- --runInBand
cd backend && npm audit --audit-level=moderate
cd admin && npm run build
```

Тесты проверяют основной flow и рендер всех 40 экранов без layout overflow в viewport `430 x 932`.

## Backup

Production backup на сервере ставится из `ops/`:

```sh
sudo install -m 0755 ops/backup-reestr.sh /usr/local/bin/backup-reestr.sh
sudo install -m 0644 ops/reestr-backup.service /etc/systemd/system/reestr-backup.service
sudo install -m 0644 ops/reestr-backup.timer /etc/systemd/system/reestr-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now reestr-backup.timer
```

Копии сохраняются в `/opt/reestr/backups/YYYYMMDDTHHMMSSZ/`: `postgres.dump`,
`storage.tar.gz`, `manifest.json`. Retention по умолчанию — 14 дней.

## Server services and logs

Systemd unit-файлы и logrotate лежат в `ops/`:

```sh
sudo mkdir -p /var/log/reestr
sudo install -m 0644 ops/reestr-backend.service /etc/systemd/system/reestr-backend.service
sudo install -m 0644 ops/reestr-admin.service /etc/systemd/system/reestr-admin.service
sudo install -m 0644 ops/reestr-logrotate /etc/logrotate.d/reestr
sudo systemctl daemon-reload
sudo systemctl restart reestr-backend reestr-admin
```

Логи пишутся в `/var/log/reestr/backend.log`, `/var/log/reestr/backend-error.log`,
`/var/log/reestr/admin.log`, `/var/log/reestr/admin-error.log` и ротируются ежедневно.

## Staging deploy

Для выкладки на текущий сервер используйте:

```sh
ops/deploy-staging.sh
```

Скрипт не синхронизирует `.env`, `.env.*`, `node_modules`, build-каталоги и cache.
Серверные секреты остаются только на сервере.

Nginx-конфиг лежит в `ops/nginx-reestr.conf`. Публично открыт только `80/443`,
backend и admin слушают `127.0.0.1:3000/3001` и доступны через Nginx.

## GitHub / Codex Cloud / CI-CD

Основная ветка: `main`. Обычный порядок работы:

```sh
git checkout -b feature/name
# правки
git push -u origin feature/name
```

Pull request запускает `.github/workflows/ci.yml`:

- Flutter analyze/test/web build;
- backend build/test;
- admin build.

После merge в `main` запускается `.github/workflows/deploy.yml`.
Деплой выкладывает проверенный commit на текущий сервер, делает backup, применяет Prisma migrations,
пересобирает backend/admin, обновляет Flutter Web из artifact и проверяет health.

Ручные операции доступны в GitHub Actions workflow `Deploy`:

- `deploy` — повторно выложить выбранный ref;
- `status` — статус сервисов и установленная версия;
- `logs` — короткие диагностические логи без токенов;
- `restart` — перезапуск `reestr-backend` и `reestr-admin`;
- `rollback` — откат файлов к предыдущему release без отката базы данных.

Секреты GitHub Actions:

- `DEPLOY_HOST`;
- `DEPLOY_USER`;
- `DEPLOY_SSH_KEY`;
- `DEPLOY_KNOWN_HOSTS`.

Подробнее: `docs/cloud-and-deploy.md`.

## Firewall

Базовый firewall для production:

```sh
sudo bash ops/setup-firewall.sh
```

Открыты только `22/tcp`, `80/tcp`, `443/tcp`. Прямой доступ к backend/admin портам
`3000/3001` закрыт; внешний доступ идет через Nginx.

## Visual QA

```sh
python3 tool/render_pdf_references.py
```

Референсы PDF сохраняются в `tmp/pdfs/ers_v7/page-01.png` ... `page-40.png`.
Вырезанные экраны телефона сохраняются в `tmp/pdfs/ers_v7/cropped/page-01.png` ... `page-40.png`.
Чеклист сверки описан в `tool/visual_qa.md`.
