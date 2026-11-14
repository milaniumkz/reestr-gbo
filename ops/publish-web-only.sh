#!/usr/bin/env bash
set -euo pipefail
commit="${1:?Commit required}"
[[ "$commit" =~ ^[a-f0-9]{40}$ ]]
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?Host required}"
mkdir -p ~/.ssh
printf '%s\n' "${KNOWN_HOSTS:?Known host required}" > ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts
remote="$(ssh "$server" 'mktemp -d /tmp/reestr-web.XXXXXX')"
trap 'ssh "$server" "rm -rf -- \"$remote\""' EXIT
rsync -az build/web/ "$server:$remote/"
ssh "$server" "bash -s -- '$remote' '$commit'" <<'REMOTE'
set -euo pipefail
staged="$1"
commit="$2"
web=/opt/reestr/app/build/web
# A frontend-only update does not modify DB/storage. Reuse a recent complete
# full backup when available, and always create a fresh exact web rollback below.
recent_backup=$(python3 - <<'PYBACKUP'
from pathlib import Path
from datetime import datetime,timezone
import json,re
for path in sorted(Path('/opt/reestr/backups').iterdir(),reverse=True):
    if not path.is_dir() or not re.fullmatch(r'\d{8}T\d{6}Z',path.name):continue
    try:
        manifest=json.loads((path/'manifest.json').read_text())
        created=datetime.strptime(manifest['createdAt'],'%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
        if 0<=(datetime.now(timezone.utc)-created).total_seconds()<=3600 and manifest.get('appDir')=='/opt/reestr/app' and (path/'postgres.dump').stat().st_size>0 and (path/'storage.tar.gz').stat().st_size>0:
            print(path);break
    except (OSError,ValueError,KeyError):continue
PYBACKUP
)
if [[ -n "$recent_backup" ]] && pg_restore --list "$recent_backup/postgres.dump" >/dev/null && gzip -t "$recent_backup/storage.tar.gz"; then
  echo "Reusing verified recent full backup for frontend-only publication: $recent_backup"
else
  if [ -x /usr/local/bin/backup-reestr.sh ]; then /usr/local/bin/backup-reestr.sh; else /opt/reestr/app/ops/backup-reestr.sh; fi
fi
# Keep an exact frontend rollback snapshot and the existing APK checksum.
archive="/opt/reestr/backups/web-$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:12}.tar.gz"
tar -czf "$archive" -C "$web" .
old_apk="$(sha256sum "$web/downloads/ersi-gbo.apk" | cut -d' ' -f1)"
# Retain previous versioned bundles so already-open clients can still load them.
# Publish the entrypoint last; individual files are replaced through temp files.
rsync -a --chmod=D755,F644 --delay-updates --exclude=/index.html --exclude=/release.json "$staged/" "$web/"
install -m644 "$staged/index.html" "$web/.index.next.html"
mv -f "$web/.index.next.html" "$web/index.html"
install -m644 "$staged/release.json" "$web/.release.next.json"
mv -f "$web/.release.next.json" "$web/release.json"
test "$old_apk" = "$(sha256sum "$web/downloads/ersi-gbo.apk" | cut -d' ' -f1)"
printf '%s\n' "$commit" > "$web/frontend-commit.txt"
REMOTE
curl --fail --silent --show-error https://89-207-255-42.sslip.io/install.js -o "$RUNNER_TEMP/public-install.js"
cmp web/install.js "$RUNNER_TEMP/public-install.js"
curl --fail --silent --show-error https://89-207-255-42.sslip.io/ersi-pwa-sw.js -o "$RUNNER_TEMP/public-install-worker.js"
cmp web/ersi-pwa-sw.js "$RUNNER_TEMP/public-install-worker.js"
curl --fail --silent --show-error https://89-207-255-42.sslip.io/frontend-commit.txt -o "$RUNNER_TEMP/frontend-commit.txt"
grep -qx "$commit" "$RUNNER_TEMP/frontend-commit.txt"
