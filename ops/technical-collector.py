#!/usr/bin/env python3
"""Read-only fixed-source collector. Never reads environment files or document contents."""
import datetime, json, os, pathlib, subprocess, tempfile, grp
UTC=datetime.timezone.utc
now=datetime.datetime.now(UTC)
def iso(timestamp): return datetime.datetime.fromtimestamp(timestamp,UTC).isoformat()
def command(args):
 try: return subprocess.run(args,capture_output=True,text=True,timeout=8,check=True).stdout.strip()
 except (subprocess.SubprocessError,OSError): return None
services=[]
for unit in ['reestr-backend','reestr-admin','reestr-tech','nginx','postgresql','redis-server']:
 raw=command(['systemctl','show',unit,'--property=ActiveState,SubState,NRestarts,ActiveEnterTimestampMonotonic'])
 properties=dict(line.split('=',1) for line in (raw or '').splitlines() if '=' in line)
 services.append({'name':unit,'state':properties.get('ActiveState','unknown'),'subState':properties.get('SubState'),'restarts':int(properties.get('NRestarts','0') or 0),'observedAt':now.isoformat()})
backups=[]
root=pathlib.Path('/opt/reestr/backups')
if root.exists():
 for path in sorted(root.iterdir(),key=lambda p:p.stat().st_mtime,reverse=True)[:30]:
  if path.is_symlink(): continue
  files=[p for p in path.rglob('*') if p.is_file() and not p.is_symlink()] if path.is_dir() else [path]
  manifest={}
  try:
   manifest_path=path/'manifest.json'
   if manifest_path.stat().st_size<16384: manifest=json.loads(manifest_path.read_text())
  except (OSError,ValueError): pass
  database=path/'postgres.dump';storage=path/'storage.tar.gz'
  complete=database.is_file() and storage.is_file() and database.stat().st_size>0 and storage.stat().st_size>0
  backups.append({'id':path.name,'name':path.name,'observedAt':now.isoformat(),'createdAt':iso(path.stat().st_mtime),'databaseBytes':database.stat().st_size if database.is_file() else None,'storageBytes':storage.stat().st_size if storage.is_file() else None,'sizeBytes':sum(p.stat().st_size for p in files),'files':len(files),'retentionDays':manifest.get('retentionDays') if isinstance(manifest.get('retentionDays'),int) else None,'state':'not_verified' if complete else 'attention','restoreVerification':'Изолированное восстановление этой копии не подтверждено'})
releases=[]
try: current_version=pathlib.Path('/opt/reestr/app/VERSION').read_text().strip()
except OSError: current_version=''
root=pathlib.Path('/opt/reestr/releases')
if root.exists():
 for path in sorted(root.iterdir(),key=lambda p:p.stat().st_mtime,reverse=True)[:20]:
  if path.is_dir() and not path.is_symlink():
   version=path.name.split('-',1)[-1]
   releases.append({'id':path.name,'name':path.name,'version':version,'current':bool(current_version and current_version.startswith(version)),'observedAt':iso(path.stat().st_mtime),'state':'unknown','explanation':'Каталог выпуска обнаружен. Результат CI смотрите по идентификатору коммита.'})
certificates=[]
for name in ['89-207-255-42.sslip.io','tech.89-207-255-42.sslip.io']:
 path=pathlib.Path('/etc/letsencrypt/live')/name/'cert.pem'
 raw=command(['openssl','x509','-in',str(path),'-noout','-enddate'])
 certificates.append({'name':name,'state':'connected' if raw else 'unknown','notAfter':raw.removeprefix('notAfter=') if raw else None})
logs=[]
for name in ['backend.log','backend-error.log','admin.log','tech.log']:
 path=pathlib.Path('/var/log/reestr')/name
 logs.append({'name':name,'sizeBytes':path.stat().st_size if path.is_file() else None})
state={'schemaVersion':1,'observedAt':now.isoformat(),'services':services,'backups':backups,'releases':releases,'certificates':certificates,'logs':logs}
target=pathlib.Path('/opt/reestr/monitor');target.mkdir(mode=0o750,parents=True,exist_ok=True)
fd,tmp=tempfile.mkstemp(dir=target,prefix='.state-')
try:
 with os.fdopen(fd,'w') as stream: json.dump(state,stream,ensure_ascii=False);stream.flush();os.fsync(stream.fileno())
 os.chmod(tmp,0o640)
 try: os.chown(tmp,-1,grp.getgrnam('reestr-backend').gr_gid)
 except KeyError: pass
 os.replace(tmp,target/'state.json')
finally:
 if os.path.exists(tmp): os.unlink(tmp)
