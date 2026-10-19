#!/usr/bin/env python3
"""Configure the server from a GitHub production secret without logging it."""
import json
import os
import re
import shlex
import subprocess
import sys

REMOTE_SCRIPT = r'''
import datetime,json,os,pathlib,re,shutil,subprocess,sys,urllib.error,urllib.request
config=json.load(sys.stdin)
app=pathlib.Path(config['app_dir'])
if not (app/'backend/dist/src/photo-moderation/photo-moderation.service.js').exists():
    raise SystemExit('Deploy the photo moderation release first; configuration unchanged')
try:
    request=urllib.request.Request('https://api.openai.com/v1/models/gpt-4.1-mini',headers={'Authorization':'Bearer '+config['key']})
    with urllib.request.urlopen(request,timeout=20) as response:
        if response.status != 200: raise ValueError('provider unavailable')
except Exception:
    raise SystemExit('OpenAI credential/model check failed; configuration unchanged')
path=app/'backend/.env'
source=path.read_text()
backup=pathlib.Path('/opt/reestr/backups')/('moderation-env-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.env')
backup.parent.mkdir(parents=True,exist_ok=True)
# Open privately before copying: even a permissive original never yields a readable backup.
with os.fdopen(os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as file: file.write(source)
pattern=re.compile(r'^\s*(?:export\s+)?(?:OPENAI_API_KEY|PHOTO_MODERATION_MODEL|PHOTO_MODERATION_MODE)\s*=')
lines=[line for line in source.splitlines() if not pattern.match(line)]
lines += ['OPENAI_API_KEY='+json.dumps(config['key']),'PHOTO_MODERATION_MODEL="gpt-4.1-mini"','PHOTO_MODERATION_MODE="required"']
temporary=path.with_name('.env.moderation-'+str(os.getpid()))
with os.fdopen(os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as file: file.write('\n'.join(lines)+'\n')
os.replace(temporary,path)
try:
    subprocess.run(['systemctl','restart','reestr-backend'],check=True)
    subprocess.run(['systemctl','is-active','--quiet','reestr-backend'],check=True)
except Exception:
    shutil.copyfile(backup,path)
    os.chmod(path,0o600)
    subprocess.run(['systemctl','restart','reestr-backend'],check=False)
    raise SystemExit('Backend restart failed; previous environment restored')
print('Photo moderation configured; backend restarted. No credential values logged.')
'''


def main():
    key=os.environ.get('OPENAI_API_KEY','')
    if not re.fullmatch(r'sk-[A-Za-z0-9_-]{15,1000}',key):
        raise SystemExit('Set a valid OPENAI_API_KEY in GitHub production secrets; no server changes made')
    host=os.environ.get('DEPLOY_HOST','')
    user=os.environ.get('DEPLOY_USER') or 'root'
    if not re.fullmatch(r'[A-Za-z0-9.-]+',host) or not re.fullmatch(r'[A-Za-z0-9_-]+',user):
        raise SystemExit('Invalid deployment host/user configuration')
    payload={'key':key,'app_dir':os.environ.get('APP_DIR','/opt/reestr/app')}
    subprocess.run(['ssh',f'{user}@{host}','python3 -c '+shlex.quote(REMOTE_SCRIPT)],input=json.dumps(payload).encode(),check=True)


if __name__ == '__main__':
    main()
