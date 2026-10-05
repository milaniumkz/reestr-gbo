#!/usr/bin/env bash
set -euo pipefail

SERVER="${SERVER:-root@89.207.255.42}"
APP_DIR="${APP_DIR:-/opt/reestr/app}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

rsync -az --delete \
  --exclude '.git' \
  --exclude '.dart_tool' \
  --exclude 'build' \
  --exclude 'node_modules' \
  --exclude '.next/cache' \
  --exclude '.env' \
  --exclude '.env.*' \
  "${ROOT_DIR}/backend" \
  "${ROOT_DIR}/admin" \
  "${ROOT_DIR}/ops" \
  "${SERVER}:${APP_DIR}/"

ssh "${SERVER}" "set -e
cd ${APP_DIR}/backend
npm install
npx prisma db push
npx prisma generate
npm run build
npm test
npm audit --audit-level=moderate

cd ${APP_DIR}/admin
npm install
npm run build

install -m 0644 ${APP_DIR}/ops/reestr-backend.service /etc/systemd/system/reestr-backend.service
install -m 0644 ${APP_DIR}/ops/reestr-admin.service /etc/systemd/system/reestr-admin.service
install -m 0644 ${APP_DIR}/ops/nginx-reestr.conf /etc/nginx/sites-available/reestr
ln -sfn /etc/nginx/sites-available/reestr /etc/nginx/sites-enabled/reestr
nginx -t
systemctl daemon-reload
systemctl restart reestr-backend reestr-admin nginx
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:3000/api/v1/health/deep; then
    exit 0
  fi
  sleep 1
done
echo 'Backend health-check failed after restart' >&2
exit 1
"
