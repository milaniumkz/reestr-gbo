"""Render the new hostname from the existing public host; keep old host untouched."""
from pathlib import Path
import sys
source = Path(sys.argv[1]).read_text()
tls, separator, _ = source.partition('\nserver {\n    if ($host = 89-207-255-42.sslip.io)')
if not separator:
    raise SystemExit('Unexpected public Nginx template; refusing to guess server boundaries')
tls = tls.replace('server_name _ 89-207-255-42.sslip.io;', 'server_name ersigbo.kz;')
tls = tls.replace('/live/89-207-255-42.sslip.io/', '/live/ersigbo.kz/')
tls = tls.replace(' ssl ipv6only=on;', ' ssl;')
if '89-207-255-42.sslip.io' in tls:
    raise SystemExit('Unexpected legacy hostname in generated TLS host')
print('''# Additional public host. The original sslip.io virtual host is retained.
server {
    listen 80;
    listen [::]:80;
    server_name ersigbo.kz;
    location /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://$host$request_uri; }
}
'''+tls)
