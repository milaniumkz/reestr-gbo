#!/usr/bin/env bash
set -euo pipefail
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?}"
remote=$(ssh "$server" 'mktemp -d /tmp/reestr-storage-maintenance.XXXXXX')
trap 'ssh "$server" "rm -rf -- \"$remote\""' EXIT
scp ops/prune-backups.py ops/backup-reestr.sh "$server:$remote/"
ssh "$server" "bash -s -- '$remote'" <<'REMOTE'
set -euo pipefail
staged="$1"
timer_active=false
if systemctl is-active --quiet reestr-backup.timer; then timer_active=true; systemctl stop reestr-backup.timer; fi
resume_timer(){ if [[ "$timer_active" == true ]]; then systemctl start reestr-backup.timer; fi; }
trap resume_timer EXIT
if systemctl is-active --quiet reestr-backup.service || pgrep -x pg_dump >/dev/null; then echo 'Backup running; cleanup deferred' >&2; exit 1; fi
df -h /
python3 "$staged/prune-backups.py" /opt/reestr/backups
current="$(readlink -f /opt/reestr/current)"
for release in /opt/reestr/releases/*; do
 [[ -d "$release" && ! -L "$release" && "$release" != "$current" ]] || continue
 [[ "${release##*/}" =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]+$ ]] || continue
 rm -rf -- "$release"
done
# Web/PWA only. Remove native APK downloads, including the retained release copy.
for downloads in /opt/reestr/app/build/web/downloads "$current/build/web/downloads"; do
 [[ -d "$downloads" && ! -L "$downloads" ]] || continue
 rm -f -- "$downloads/ersi-gbo.apk" "$downloads/ersi-gbo.apk.sha256"
done
npm cache clean --force
apt-get clean
install -m755 "$staged/prune-backups.py" /opt/reestr/app/ops/prune-backups.py
install -m755 "$staged/backup-reestr.sh" /opt/reestr/app/ops/backup-reestr.sh
install -m755 "$staged/backup-reestr.sh" /usr/local/bin/backup-reestr.sh
# Create a fresh full recovery point after cleanup; automatic rotation keeps two.
BACKUP_SCOPE=full bash /usr/local/bin/backup-reestr.sh
df -h /
du -sh /opt/reestr/backups /opt/reestr/releases /opt/reestr/storage
systemctl is-active reestr-backend postgresql redis-server
REMOTE
curl --fail --silent --show-error --max-time 25 https://ersigbo.kz/api/v1/health
