"""Add only the authenticated video endpoint timeout; preserve existing TLS hosts."""
from pathlib import Path
import os,shutil,subprocess,tempfile,datetime
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
def replace(path,data):
    st=path.stat()
    fd,name=tempfile.mkstemp(prefix='.identity-nginx-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as file:file.write(data)
        os.chmod(name,st.st_mode & 0o777)
        os.chown(name,st.st_uid,st.st_gid)
        os.replace(name,path)
    finally:
        if os.path.exists(name):os.unlink(name)
try:
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
    print('Video API timeout configured on both HTTPS hosts; existing TLS and routes retained')
except Exception:
    for path,text in originals.items():replace(path,text)
    subprocess.run(['nginx','-t'],check=False)
    subprocess.run(['systemctl','reload','nginx'],check=False)
    raise
