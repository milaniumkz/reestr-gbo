"""Add only the authenticated video endpoint timeout; preserve existing TLS hosts."""
from pathlib import Path
import os,shutil,subprocess,tempfile,datetime,sys,ipaddress,json,urllib.request
paths=[Path('/etc/nginx/sites-available/reestr'),Path('/etc/nginx/conf.d/ersigbo.conf')]
location='''    location ^~ /api/v1/auth/identity/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_read_timeout 110s;
        proxy_send_timeout 110s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

'''
backup=Path('/opt/reestr/backups')/('identity-nginx-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
backup.mkdir(mode=0o700,parents=True,exist_ok=False)
originals={}
worker_ip=str(ipaddress.IPv4Address(sys.argv[1]))
if not ipaddress.ip_address(worker_ip).is_private:raise RuntimeError('Private worker address required')
private_path=Path('/etc/nginx/conf.d/reestr-identity-private.conf')
private_previous=private_path.read_text() if private_path.exists() else None
private_config=f'''# Local-only bridge to an isolated Docker worker; never exposed publicly.
server {{
    listen 127.0.0.1:8091;
    server_name localhost;
    client_max_body_size 17m;
    access_log off;
    location / {{
        proxy_pass http://{worker_ip}:8080;
        proxy_http_version 1.1;
        proxy_request_buffering off;
        proxy_read_timeout 100s;
        proxy_send_timeout 100s;
    }}
}}
'''

def replace(path,data):
    st=path.stat() if path.exists() else None
    fd,name=tempfile.mkstemp(prefix='.identity-nginx-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as file:file.write(data)
        os.chmod(name,(st.st_mode & 0o777) if st else 0o644)
        os.chown(name,st.st_uid if st else 0,st.st_gid if st else 0)
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)
try:
    if private_path.exists():shutil.copy2(private_path,backup/private_path.name)
    replace(private_path,private_config)
    for path in paths:
        text=path.read_text()
        if 'server_name' not in text or 'proxy_pass http://127.0.0.1:3000' not in text:raise RuntimeError('Unexpected public host configuration')
        if 'location ^~ /api/v1/auth/identity/' in text:continue
        needle='    location /api/v1/ {'
        if text.count(needle)!=1:raise RuntimeError('Ambiguous API block')
        originals[path]=text
        shutil.copy2(path,backup/path.name)
        replace(path,text.replace(needle,location+needle))
    subprocess.run(['nginx','-t'],check=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
    with urllib.request.urlopen('http://127.0.0.1:8091/health',timeout=5) as response:
        health=json.load(response)
        if not health.get('ready') or not health.get('liveness'):raise RuntimeError('Private proxy health failed')
    print('Video API timeout configured on both HTTPS hosts; existing TLS and routes retained')
except Exception:
    if private_previous is None:private_path.unlink(missing_ok=True)
    else:replace(private_path,private_previous)
    for path,text in originals.items():replace(path,text)
    subprocess.run(['nginx','-t'],check=False)
    subprocess.run(['systemctl','reload','nginx'],check=False)
    raise
