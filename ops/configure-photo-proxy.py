"""Install a loopback-only bridge without changing either public HTTPS host."""
import ipaddress,json,os,subprocess,sys,tempfile,urllib.request
from pathlib import Path
ip=ipaddress.IPv4Address(sys.argv[1])
if not ip.is_private or ip.is_loopback:raise RuntimeError('Private container address required')
path=Path('/etc/nginx/conf.d/reestr-photo-private.conf')
old=path.read_text() if path.exists() else None
if old is not None and '# ERSI private photo worker' not in old:raise RuntimeError('Unmanaged proxy config')
config=f'''# ERSI private photo worker
server {{
 listen 127.0.0.1:8093;
 server_name localhost;
 client_max_body_size 4m;
 access_log off;
 location / {{
  proxy_pass http://{ip}:8080;
  proxy_http_version 1.1;
  proxy_connect_timeout 1s;
  proxy_read_timeout 5s;
  proxy_send_timeout 5s;
 }}
}}
'''
def replace(data):
    fd,name=tempfile.mkstemp(prefix='.photo-proxy-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as f:f.write(data)
        os.chmod(name,0o644);os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)
try:
    replace(config)
    subprocess.run(['nginx','-t'],check=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
    with urllib.request.urlopen('http://127.0.0.1:8093/health',timeout=5) as r:health=json.load(r)
    assert health.get('ready') and health.get('model')=='local-yolox-s-coco-v1' and health.get('externalServices') is False
except Exception:
    if old is None:path.unlink(missing_ok=True)
    else:replace(old)
    subprocess.run(['nginx','-t'],check=False);subprocess.run(['systemctl','reload','nginx'],check=False)
    raise
print('Private photo proxy healthy; public HTTPS routes unchanged')
