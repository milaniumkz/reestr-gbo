#!/usr/bin/env bash
set -euo pipefail
umask 077
mkdir -p ~/.ssh "$RUNNER_TEMP/android-signing"
printf '%s\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts
server="${DEPLOY_USER:-root}@${DEPLOY_HOST}"
remote='/opt/reestr/keys/android'
if ssh -o ConnectTimeout=20 "$server" "test -f '$remote/release.jks' && test -f '$remote/store.password'"; then
  scp "$server:$remote/release.jks" "$RUNNER_TEMP/android-signing/release.jks"
  scp "$server:$remote/store.password" "$RUNNER_TEMP/android-signing/store.password"
else
  python3 - <<'PY'
import os,secrets
from pathlib import Path
p=Path(os.environ['RUNNER_TEMP'])/'android-signing/store.password'
p.write_text(secrets.token_hex(32))
p.chmod(0o600)
PY
  keytool -genkeypair -noprompt -keystore "$RUNNER_TEMP/android-signing/release.jks" -storetype PKCS12 -alias ersi-release -keyalg RSA -keysize 3072 -validity 10000 -storepass:file "$RUNNER_TEMP/android-signing/store.password" -keypass:file "$RUNNER_TEMP/android-signing/store.password" -dname 'CN=ERSI GBO, O=ERSI GBO, C=KZ'
  ssh "$server" "umask 077; mkdir -p '$remote'; chmod 700 '$remote'; test ! -e '$remote/release.jks'; test ! -e '$remote/store.password'"
  scp "$RUNNER_TEMP/android-signing/release.jks" "$RUNNER_TEMP/android-signing/store.password" "$server:$remote/"
  ssh "$server" "chmod 600 '$remote/release.jks' '$remote/store.password'"
fi
python3 - <<'PY'
import os
from pathlib import Path
root=Path(os.environ['RUNNER_TEMP'])/'android-signing'
password=(root/'store.password').read_text().strip()
p=Path('android/key.properties')
p.write_text(f'storeFile={root}/release.jks\nstorePassword={password}\nkeyPassword={password}\nkeyAlias=ersi-release\n')
p.chmod(0o600)
PY
