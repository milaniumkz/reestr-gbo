#!/usr/bin/env bash
# Resume only the fully built/tested release selected by the existing deploy script.
set -euo pipefail
commit="${1:?Checked commit SHA required}"
[[ "$commit" =~ ^[a-f0-9]{40}$ ]]
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?Host required}"
ssh "$server" "bash -s -- '$commit'" <<'REMOTE'
set -euo pipefail
commit="$1"
app=/opt/reestr/app
release="$(readlink -f /opt/reestr/current)"
[[ "$release" =~ ^/opt/reestr/releases/[0-9]{8}T[0-9]{6}Z-${commit:0:12}$ ]]
[[ "$(df -Pk "$app" | awk 'NR==2 {print $4}')" -ge 4194304 ]]
python3 - "$release" "$commit" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1]);release=json.loads((root/'build/web/release.json').read_text())
assert release['version']==sys.argv[2], 'Staged frontend version does not match checked commit'
assert (root/'build/web'/release['bundle']).is_file(), 'Missing staged frontend bundle'
assert (root/'backend/dist/main.js').is_file() or (root/'backend/dist/src/main.js').is_file(), 'Backend has not been built'
for component in ['backend','admin','tech']:
 assert (root/component/'node_modules').is_dir(), 'Missing staged dependencies: '+component
for component in ['admin','tech']:
 assert (root/component/'.next/BUILD_ID').is_file(), 'Missing built Next.js output: '+component
PY
(cd "$release/build/web/downloads" && sha256sum -c ersi-gbo.apk.sha256)
APP_DIR="$app" bash "$app/ops/backup-reestr.sh"
old_apk="$(sha256sum "$app/build/web/downloads/ersi-gbo.apk" | cut -d' ' -f1)"
# Preserve live private configuration; no database migration or user-data writes.
for component in backend admin tech; do
 mkdir -p "$app/$component"
 rsync -a --delete --exclude='.env' --exclude='.env.*' "$release/$component/" "$app/$component/"
done
rsync -a --delete "$release/ops/" "$app/ops/"
web="$app/build/web"
rsync -a --delay-updates --exclude=/index.html --exclude=/release.json "$release/build/web/" "$web/"
install -m644 "$release/build/web/index.html" "$web/.index.next.html"
mv -f "$web/.index.next.html" "$web/index.html"
install -m644 "$release/build/web/release.json" "$web/.release.next.json"
mv -f "$web/.release.next.json" "$web/release.json"
test "$old_apk" = "$(sha256sum "$web/downloads/ersi-gbo.apk" | cut -d' ' -f1)"
chown root:reestr-backend "$app/backend/.env"
chmod 640 "$app/backend/.env"
install -m644 "$app/ops/reestr-backend.service" /etc/systemd/system/reestr-backend.service
install -m644 "$app/ops/reestr-admin.service" /etc/systemd/system/reestr-admin.service
nginx -t
systemctl daemon-reload
systemctl restart reestr-backend reestr-admin
if systemctl is-enabled reestr-tech >/dev/null 2>&1; then
 chown -R reestr-tech:reestr-tech "$app/tech/.next/cache"
 systemctl restart reestr-tech
fi
systemctl reload nginx
for attempt in $(seq 1 10); do
 if curl -fsS http://127.0.0.1:3000/api/v1/health >/dev/null; then
  for origin in https://ersigbo.kz https://89-207-255-42.sslip.io; do
   curl -fsS --retry 3 --retry-delay 2 "$origin/api/v1/health" >/dev/null
   curl -fsS --retry 3 --retry-delay 2 "$origin/admin/" >/dev/null
  done
  printf '%s\n' "$commit" > "$app/VERSION"
  echo "Checked release installed: $commit"
  df -h /
  exit 0
 fi
 sleep 2
done
exit 1
REMOTE
