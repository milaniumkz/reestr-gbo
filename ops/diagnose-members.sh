#!/usr/bin/env bash
set -euo pipefail
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?}"
remote=$(ssh "$server" 'mktemp -d /tmp/reestr-request-diagnostic.XXXXXX')
trap 'ssh "$server" "rm -rf -- \"$remote\""' EXIT
scp ops/diagnose-request-errors.cjs "$server:$remote/diagnostic.cjs"
ssh "$server" "set -a; source /opt/reestr/app/backend/.env; set +a; node '$remote/diagnostic.cjs'"
