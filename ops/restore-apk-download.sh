#!/usr/bin/env bash
set -euo pipefail
[[ "${APK_BACKUP:?}" =~ ^apk-[0-9]{8}T[0-9]{6}Z$ ]]
server="${DEPLOY_USER:-root}@${DEPLOY_HOST:?}"
mkdir -p ~/.ssh
printf '%s\n' "${KNOWN_HOSTS:?}" > ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts
ssh "$server" "bash -s -- '$APK_BACKUP'" <<'REMOTE'
set -euo pipefail
source_dir="/opt/reestr/backups/$1"
cd "$source_dir"
sha256sum -c ersi-gbo.apk.sha256
target=/opt/reestr/app/build/web/downloads
rollback="$(mktemp -d /opt/reestr/backups/android-rollback.XXXXXX)"
cp -a "$target/ersi-gbo.apk" "$target/ersi-gbo.apk.sha256" "$rollback/"
for name in ersi-gbo.apk ersi-gbo.apk.sha256; do
 install -m644 "$source_dir/$name" "$target/$name.restore"
 mv -f "$target/$name.restore" "$target/$name"
done
cd "$target"
sha256sum -c ersi-gbo.apk.sha256
printf 'Previous APK restored from %s\n' "$source_dir"
REMOTE
curl --fail --silent --show-error --max-time 60 https://ersigbo.kz/downloads/ersi-gbo.apk -o "$RUNNER_TEMP/restored.apk"
curl --fail --silent --show-error --max-time 20 https://ersigbo.kz/downloads/ersi-gbo.apk.sha256 -o "$RUNNER_TEMP/restored.sha256"
expected="$(cut -d' ' -f1 "$RUNNER_TEMP/restored.sha256")"
test "$expected" = "$(sha256sum "$RUNNER_TEMP/restored.apk" | cut -d' ' -f1)"
