#!/usr/bin/env bash
set -euo pipefail

COMMIT_SHA="${1:-unknown}"
DEPLOY_HOST="${DEPLOY_HOST:?DEPLOY_HOST is required}"
DEPLOY_USER="${DEPLOY_USER:-root}"
APP_DIR="${APP_DIR:-/opt/reestr/app}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://89-207-255-42.sslip.io}"
SERVER="${DEPLOY_USER}@${DEPLOY_HOST}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-${COMMIT_SHA:0:12}"
REMOTE_RELEASE="/opt/reestr/releases/$RELEASE_ID"

ssh "$SERVER" "set -euo pipefail
mkdir -p /opt/reestr/releases /opt/reestr/backups
if [ -x /usr/local/bin/backup-reestr.sh ]; then
  /usr/local/bin/backup-reestr.sh
elif [ -x ${APP_DIR}/ops/backup-reestr.sh ]; then
  ${APP_DIR}/ops/backup-reestr.sh
fi
mkdir -p '$REMOTE_RELEASE'
"

rsync -az --delete \
  --exclude '.git' \
  --exclude '.dart_tool' \
  --exclude 'build' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '._*' \
  --exclude '*.mov' \
  --exclude '*.mp4' \
  --exclude 'tmp' \
  "$ROOT_DIR/" "$SERVER:$REMOTE_RELEASE/"

ssh "$SERVER" "set -euo pipefail
if [ -f '${APP_DIR}/backend/.env' ]; then
  mkdir -p '$REMOTE_RELEASE/backend'
  cp '${APP_DIR}/backend/.env' '$REMOTE_RELEASE/backend/.env'
fi
cd '$REMOTE_RELEASE/backend'
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
npm test -- --runInBand

cd '$REMOTE_RELEASE/admin'
npm ci
NEXT_PUBLIC_API_URL='${PUBLIC_ORIGIN}/api/v1' npm run build

cd '$REMOTE_RELEASE'
test -f build/web/main.dart.js
BUILD_ID=\$(date -u +%Y%m%d%H%M%S)
cp build/web/main.dart.js \"build/web/main.\$BUILD_ID.dart.js\"
BUILD_ID=\"\$BUILD_ID\" python3 - <<'PY'
from pathlib import Path
import os
import re
bid = os.environ['BUILD_ID']
p = Path('build/web/flutter_bootstrap.js')
s = p.read_text()
s = re.sub(r'main\\.(?:\\d+|None)\\.dart\\.js', f'main.{bid}.dart.js', s)
s = s.replace('\"mainJsPath\":\"main.dart.js\"', f'\"mainJsPath\":\"main.{bid}.dart.js\"')
s = s.replace(\"main.dart.js?v=' + buildVersion\", f\"main.{bid}.dart.js?v=' + buildVersion\")
s = s.replace(\"build.mainJsPath === 'main.dart.js'\", f\"build.mainJsPath === 'main.{bid}.dart.js'\")
p.write_text(s)
PY

ln -sfn '$REMOTE_RELEASE' /opt/reestr/current
rsync -a --delete '$REMOTE_RELEASE/backend/' '${APP_DIR}/backend/'
rsync -a --delete '$REMOTE_RELEASE/admin/' '${APP_DIR}/admin/'
rsync -a --delete '$REMOTE_RELEASE/ops/' '${APP_DIR}/ops/'
rsync -a --delete '$REMOTE_RELEASE/build/web/' '${APP_DIR}/build/web/'
printf '%s\n' '$COMMIT_SHA' > '${APP_DIR}/VERSION'
install -m 0644 '${APP_DIR}/ops/reestr-backend.service' /etc/systemd/system/reestr-backend.service
install -m 0644 '${APP_DIR}/ops/reestr-admin.service' /etc/systemd/system/reestr-admin.service
nginx -t
systemctl daemon-reload
systemctl restart reestr-backend reestr-admin
systemctl reload nginx
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null; then
    curl -fsS '${PUBLIC_ORIGIN}/api/v1/health' >/dev/null
    exit 0
  fi
  sleep 2
done
echo 'Health check failed' >&2
exit 1
"
