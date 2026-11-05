#!/usr/bin/env bash
# Runs on the production server; adds a second virtual host, never replaces the old one.
set -euo pipefail
staged="${1:?Staged repository directory required}"
domain=ersigbo.kz
expected=89.207.255.42
python3 - "$domain" "$expected" <<'PY'
import socket,sys
name,expected=sys.argv[1:]
v4={r[4][0] for r in socket.getaddrinfo(name,80,socket.AF_INET)}
if v4 != {expected}: raise SystemExit(f'DNS not ready: {name} A={sorted(v4)}; expected {expected}')
try: v6={r[4][0] for r in socket.getaddrinfo(name,80,socket.AF_INET6)}
except socket.gaierror: v6=set()
if v6: raise SystemExit('Unexpected AAAA record: verify IPv6 before issuing certificate')
print('DNS verified:',name,expected)
PY
command -v certbot >/dev/null
nginx -t
APP_DIR=/opt/reestr/app bash /opt/reestr/app/ops/backup-reestr.sh
backup="/opt/reestr/backups/domain-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup" /var/www/letsencrypt
cp -a /etc/nginx "$backup/"
target=/etc/nginx/conf.d/ersigbo.conf
had_previous=false
if [ -f "$target" ]; then cp -a "$target" "$backup/previous.conf"; had_previous=true; fi
rollback() {
 result=$?
 if [ "$result" -ne 0 ]; then
  if "$had_previous"; then cp -a "$backup/previous.conf" "$target"; else rm -f "$target"; fi
  nginx -t && systemctl reload nginx
  echo "Domain setup failed; previous Nginx configuration restored ($backup)" >&2
 fi
 exit "$result"
}
trap rollback EXIT
cat > "$target.next" <<'NGINX'
server {
 listen 80;
 listen [::]:80;
 server_name ersigbo.kz;
 location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
 location / { return 301 https://$host$request_uri; }
}
NGINX
# Keep an already working TLS host while renewing/re-running setup.
if [ ! -s /etc/letsencrypt/live/ersigbo.kz/fullchain.pem ]; then
 mv -f "$target.next" "$target"
 nginx -t
 systemctl reload nginx
fi
certbot certonly --webroot -w /var/www/letsencrypt --cert-name ersigbo.kz \
 -d ersigbo.kz --non-interactive --agree-tos --register-unsafely-without-email \
 --keep-until-expiring --deploy-hook 'nginx -t && systemctl reload nginx'
python3 "$staged/scripts/render_public_domain_nginx.py" "$staged/ops/nginx-reestr.conf" > "$target.next"
chmod 644 "$target.next"
mv -f "$target.next" "$target"
nginx -t
systemctl reload nginx
systemctl enable --now certbot.timer
for origin in https://ersigbo.kz https://89-207-255-42.sslip.io; do
 curl --fail --silent --show-error --retry 3 "$origin/" >/dev/null
 curl --fail --silent --show-error --retry 3 "$origin/api/v1/health" >/dev/null
 curl --fail --silent --show-error --retry 3 "$origin/admin/" >/dev/null
 echo "Verified: $origin (web, API, admin)"
done
openssl x509 -in /etc/letsencrypt/live/ersigbo.kz/fullchain.pem -noout -dates -ext subjectAltName
if systemctl cat reestr-public-domain.timer >/dev/null 2>&1; then
 systemctl disable --now reestr-public-domain.timer
fi
trap - EXIT
