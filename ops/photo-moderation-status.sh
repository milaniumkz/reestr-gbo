#!/usr/bin/env bash
set -euo pipefail
ssh "${DEPLOY_USER:-root}@${DEPLOY_HOST:?DEPLOY_HOST required}" 'cd /opt/reestr/app/backend && node -e '\''require("dotenv").config({quiet:true}); const {PhotoModerationService}=require("./dist/src/photo-moderation/photo-moderation.service"); console.log(JSON.stringify(new PhotoModerationService().status()));'\'''

server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?}"
remote=$(ssh "$server" 'mktemp -d /tmp/reestr-label-diagnostics.XXXXXX')
trap 'ssh "$server" "rm -rf -- \"$remote\""' EXIT
scp ops/diagnose-label-photos.cjs "$server:$remote/diagnose.cjs"
ssh "$server" "set -a; source /opt/reestr/app/backend/.env; set +a; node '$remote/diagnose.cjs'"
