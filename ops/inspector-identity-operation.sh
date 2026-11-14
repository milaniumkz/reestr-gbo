#!/usr/bin/env bash
set -euo pipefail
operation="${1:?}"
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?}"
if [[ "$operation" == inventory ]]; then
 ssh "$server" 'df -h /; free -m; command -v docker || true; test ! -x /usr/bin/docker || docker version --format "{{.Server.Version}}"; test ! -d /opt/reestr/storage/private/identity || stat -c "%a %U %n" /opt/reestr/storage/private/identity'
 exit
fi
[[ "$operation" == status || "$operation" == activate || "$operation" == deactivate || "$operation" == pilot ]]
pilot_id="${IDENTITY_PILOT_USER_ID:-}"
if [[ "$operation" == pilot ]]; then [[ "$pilot_id" =~ ^[a-fA-F0-9-]{36}$ ]]; fi
remote=$(ssh "$server" 'mktemp -d /tmp/reestr-identity-op.XXXXXX')
trap 'ssh "$server" "rm -rf -- \"$remote\""' EXIT
scp ops/inspector-identity-operation.cjs "$server:$remote/operation.cjs"
if [[ "$operation" != status ]]; then ssh "$server" 'bash /opt/reestr/app/ops/backup-reestr.sh'; fi
ssh "$server" "set -a; source /opt/reestr/app/backend/.env; set +a; GITHUB_RUN_ID='$GITHUB_RUN_ID' node '$remote/operation.cjs' '$operation' '$pilot_id'"
