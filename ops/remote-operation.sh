#!/usr/bin/env bash
set -euo pipefail

OPERATION="${1:?operation is required}"
DEPLOY_HOST="${DEPLOY_HOST:?DEPLOY_HOST is required}"
DEPLOY_USER="${DEPLOY_USER:-root}"
APP_DIR="${APP_DIR:-/opt/reestr/app}"
SERVER="${DEPLOY_USER}@${DEPLOY_HOST}"

case "$OPERATION" in
  status)
    ssh "$SERVER" "set -e; echo VERSION; cat '${APP_DIR}/VERSION' 2>/dev/null || true; echo SERVICES; systemctl --no-pager --full status reestr-backend reestr-admin | sed -n '1,80p'; echo HEALTH; curl -fsS http://127.0.0.1:3000/api/v1/health || true"
    ;;
  logs)
    ssh "$SERVER" "set -e; echo BACKEND; tail -n 120 /var/log/reestr/backend.log 2>/dev/null | sed -E 's/(Authorization: Bearer )[A-Za-z0-9._-]+/\\1[redacted]/g'; echo ADMIN; tail -n 80 /var/log/reestr/admin.log 2>/dev/null"
    ;;
  restart)
    ssh "$SERVER" "systemctl restart reestr-backend reestr-admin && systemctl reload nginx && curl -fsS http://127.0.0.1:3000/api/v1/health"
    ;;
  rollback)
    ssh "$SERVER" "set -euo pipefail; previous=\$(ls -1dt /opt/reestr/releases/* 2>/dev/null | sed -n '2p'); test -n \"\$previous\"; rsync -a --delete \"\$previous/backend/\" '${APP_DIR}/backend/'; rsync -a --delete \"\$previous/admin/\" '${APP_DIR}/admin/'; rsync -a --delete \"\$previous/ops/\" '${APP_DIR}/ops/'; rsync -a --delete \"\$previous/build/web/\" '${APP_DIR}/build/web/'; systemctl restart reestr-backend reestr-admin; systemctl reload nginx; echo \"Rolled back to \$previous\""
    ;;
  *)
    echo "Unsupported operation: $OPERATION" >&2
    exit 2
    ;;
esac
