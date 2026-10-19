#!/usr/bin/env bash
set -euo pipefail
umask 077
TECH_DELIVERY_PUBLIC_KEY="${1:?encrypted delivery public key required}"
[[ "$TECH_DELIVERY_PUBLIC_KEY" =~ ^[A-Za-z0-9+/=]+$ ]] || exit 2
cd /opt/reestr/app
# The caller has already performed backup, migrations, backend tests and both web builds.
mkdir -p /opt/reestr/monitor /opt/reestr/archives /opt/reestr/private
install -d -m 0755 /var/www/letsencrypt
chown root:reestr-backend /opt/reestr/monitor
chmod 0750 /opt/reestr/monitor
chmod 0700 /opt/reestr/backups /opt/reestr/archives /opt/reestr/private
find /opt/reestr/releases -mindepth 3 -maxdepth 3 -path '*/backend/.env' -type f -exec chmod 0600 {} +
id reestr-tech >/dev/null 2>&1 || useradd --system --home /nonexistent --shell /usr/sbin/nologin reestr-tech
mkdir -p tech/.next/cache
chown -R reestr-tech:reestr-tech tech/.next/cache
install -m 0644 ops/reestr-tech.service /etc/systemd/system/
for item in reestr-technical-collector.service reestr-technical-collector.timer reestr-technical-retention.service reestr-technical-retention.timer; do install -m 0644 "ops/$item" /etc/systemd/system/; done
# Existing secret values are preserved; random key is generated only once and never printed.
python3 - <<'PY'
from pathlib import Path
import secrets,re,os
p=Path('backend/.env');s=p.read_text();updates={'NODE_ENV':'production','TECH_PANEL_ENABLED':'true','TECH_PANEL_ORIGIN':'https://tech.89-207-255-42.sslip.io','MEDIA_SIGNING_ENABLED':'true','MEDIA_PUBLIC_ORIGIN':'https://89-207-255-42.sslip.io'}
if not re.search(r'^TECH_PANEL_ENCRYPTION_KEY=[a-fA-F0-9]{64}\s*$',s,re.M):updates['TECH_PANEL_ENCRYPTION_KEY']=secrets.token_hex(32)
for key,value in updates.items():
 pattern=re.compile('^'+key+'=.*$',re.M)
 s=pattern.sub(key+'='+value,s) if pattern.search(s) else s.rstrip()+'\n'+key+'='+value+'\n'
p.write_text(s);os.chmod(p,0o640)
PY
# Bootstrap only HTTP ACME challenge, then install the separate HTTPS origin.
if [ ! -f /etc/letsencrypt/live/tech.89-207-255-42.sslip.io/fullchain.pem ]; then
 cat > /etc/nginx/sites-available/reestr-tech <<'NGINX'
server {
 listen 80;
 server_name tech.89-207-255-42.sslip.io;
 location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
 location / { return 404; }
}
NGINX
 ln -sfn /etc/nginx/sites-available/reestr-tech /etc/nginx/sites-enabled/reestr-tech
 nginx -t
 systemctl reload nginx
 (umask 022; certbot certonly --webroot -w /var/www/letsencrypt -d tech.89-207-255-42.sslip.io --non-interactive --agree-tos --register-unsafely-without-email)
fi
cp /etc/nginx/sites-available/reestr /opt/reestr/private/nginx-before-technical.conf
install -m 0644 ops/nginx-reestr.conf /etc/nginx/sites-available/reestr
install -m 0644 ops/nginx-technical.conf /etc/nginx/sites-available/reestr-tech
ln -sfn /etc/nginx/sites-available/reestr-tech /etc/nginx/sites-enabled/reestr-tech
nginx -t
systemctl daemon-reload
systemctl enable --now reestr-tech reestr-technical-collector.timer reestr-technical-retention.timer
systemctl restart reestr-backend reestr-tech
systemctl start reestr-technical-collector.service
systemctl reload nginx
cd backend
set -a
. ./.env
set +a
export TECH_DELIVERY_PUBLIC_KEY
./node_modules/.bin/tsx scripts/provision-technical-owner.ts
for attempt in {1..15}; do
 if curl -fsS https://tech.89-207-255-42.sslip.io/api/v1/technical/auth/status >/dev/null && curl -fsS https://tech.89-207-255-42.sslip.io/tech/ >/dev/null; then
  test "$(curl -s -o /dev/null -w '%{http_code}' https://89-207-255-42.sslip.io/api/v1/technical/auth/status)" = 404
  test "$(curl -s -o /dev/null -w '%{http_code}' https://89-207-255-42.sslip.io/storage/does-not-exist)" = 404
  echo 'Technical deployment verified: separate HTTPS origin, dedicated login, private storage'
  exit 0
 fi
 sleep 2
done
exit 1
