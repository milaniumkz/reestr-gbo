#!/usr/bin/env bash
set -euo pipefail
commit="$(git rev-parse HEAD)"
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?}"
# No dependency/schema changes are allowed through this narrow publication path.
(cd backend && npm ci && npm run prisma:generate && npm run build && npm test -- --runInBand)
remote=$(ssh "$server" 'mktemp -d /tmp/reestr-backend-patch.XXXXXX')
trap 'ssh "$server" "rm -rf -- \"$remote\""' EXIT
sha256sum backend/package.json backend/package-lock.json backend/prisma/schema.prisma > "$RUNNER_TEMP/backend-patch-inputs.sha256"
scp "$RUNNER_TEMP/backend-patch-inputs.sha256" "$server:$remote/inputs.sha256"
ssh "$server" "cd /opt/reestr/app; sha256sum -c '$remote/inputs.sha256'"
rsync -az backend/dist/ "$server:$remote/dist/"
rsync -az backend/src/ "$server:$remote/src/"
scp ops/backup-reestr.sh "$server:$remote/backup.sh"
ssh "$server" "bash -s -- '$remote' '$commit'" <<'REMOTE'
set -euo pipefail
staged="$1"; commit="$2"; app=/opt/reestr/app
BACKUP_SCOPE=database bash "$staged/backup.sh"
backup="/opt/reestr/backups/backend-patch-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m700 "$backup"
tar -czf "$backup/backend.tar.gz" -C "$app" backend/dist backend/src VERSION
sha256sum "$app/build/web/release.json" "$app/build/web/downloads/ersi-gbo.apk" > "$staged/preserved.sha256"
rollback() {
 status=$?
 if [[ "$status" != 0 ]]; then
  tar -xzf "$backup/backend.tar.gz" -C "$app"
  systemctl restart reestr-backend
  echo 'Backend publication failed; previous code restored' >&2
 fi
 exit "$status"
}
trap rollback EXIT
rsync -a --delete "$staged/dist/" "$app/backend/dist/"
rsync -a --delete "$staged/src/" "$app/backend/src/"
printf '%s\n' "$commit" > "$app/VERSION"
systemctl restart reestr-backend
healthy=false
for attempt in {1..15}; do
 if curl --fail --silent http://127.0.0.1:3000/api/v1/health >/dev/null; then healthy=true; break; fi
 sleep 2
done
[[ "$healthy" == true ]]
sha256sum -c "$staged/preserved.sha256"
cd "$app/backend"
node -e 'const {PhotoModerationService}=require("./dist/src/photo-moderation/photo-moderation.service");const s=new PhotoModerationService().status();if(s.model!=="local-screening-v3.3"||s.cylinderLabelOriginality!=="quality-review-required")process.exit(1);console.log(JSON.stringify(s))'
trap - EXIT
REMOTE
curl --fail --silent --show-error --retry 3 https://ersigbo.kz/api/v1/health >/dev/null
