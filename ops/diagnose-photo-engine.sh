#!/usr/bin/env bash
set -euo pipefail
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?}"
remote=$(ssh "$server" 'mktemp -d /tmp/reestr-photo-diagnostics.XXXXXX')
trap 'ssh "$server" "rm -rf -- \"$remote\""' EXIT
scp ops/diagnose-photo-engine.cjs "$server:$remote/diagnose.cjs"
ssh "$server" "cd /opt/reestr/app/backend; set -a; source .env; set +a; node '$remote/diagnose.cjs'"
