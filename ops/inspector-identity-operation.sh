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
compatibility=''
if [[ "$operation" == activate || "$operation" == pilot ]]; then
 versions=$(ssh "$server" node <<'VERSIONS'
const fs=require('node:fs');
console.log(fs.readFileSync('/opt/reestr/app/VERSION','utf8').trim()+':'+JSON.parse(fs.readFileSync('/opt/reestr/app/build/web/release.json','utf8')).version);
VERSIONS
)
 [[ "$versions" =~ ^[a-f0-9]{40}:[a-f0-9]{40}$ ]]
 backend_version="${versions%%:*}"
 web_version="${versions##*:}"
 git fetch --no-tags origin "$backend_version" "$web_version"
 # Independently published UI is compatible only when every backend file matches.
 git diff --exit-code "$backend_version" "$web_version" -- backend >/dev/null
 compatibility="$versions"
fi
remote=$(ssh "$server" 'mktemp -d /tmp/reestr-identity-op.XXXXXX')
trap 'ssh "$server" "rm -rf -- \"$remote\""' EXIT
scp ops/inspector-identity-operation.cjs "$server:$remote/operation.cjs"
if [[ "$operation" != status ]]; then
 scp ops/backup-reestr.sh "$server:$remote/backup.sh"
 ssh "$server" "BACKUP_SCOPE=database bash '$remote/backup.sh'"
fi
ssh "$server" "set -a; source /opt/reestr/app/backend/.env; set +a; GITHUB_RUN_ID='$GITHUB_RUN_ID' node '$remote/operation.cjs' '$operation' '$pilot_id' '$compatibility'"
