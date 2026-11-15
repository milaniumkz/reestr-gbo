#!/usr/bin/env python3
"""Owner-approved retention: keep two verified full DB + storage snapshots."""
import gzip,json,re,shutil,subprocess,sys
from pathlib import Path
STAMP=re.compile(r'\d{8}T\d{6}Z')
ARTIFACT=re.compile(r'(?:web-\d{8}T\d{6}Z-[a-f0-9]+\.tar\.gz|backend-patch-\d{8}T\d{6}Z|apk-\d{8}T\d{6}Z|android-rollback\.[A-Za-z0-9]+)')
def verified(path):
    try:
        m=json.loads((path/'manifest.json').read_text())
        if m.get('scope','full')!='full' or m.get('createdAt')!=path.name or m.get('appDir')!='/opt/reestr/app':return False
        if not (path/'postgres.dump').is_file() or not (path/'storage.tar.gz').is_file():return False
        if subprocess.run(['pg_restore','--list',str(path/'postgres.dump')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:return False
        return subprocess.run(['gzip','-t',str(path/'storage.tar.gz')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
    except (OSError,ValueError):return False

def prune(root,validate=verified):
    root=Path(root).resolve()
    entries=sorted(root.iterdir(),key=lambda p:p.name,reverse=True)
    full=[p for p in entries if not p.is_symlink() and p.is_dir() and STAMP.fullmatch(p.name)]
    keep=[]
    for p in full:
        if validate(p):keep.append(p)
        if len(keep)==2:break
    if len(keep)!=2:raise RuntimeError('Two verified full backups required; nothing deleted')
    removed=0
    for p in entries:
        if p in keep or p.is_symlink():continue
        if not (STAMP.fullmatch(p.name) or ARTIFACT.fullmatch(p.name)):continue
        if p.is_dir():shutil.rmtree(p)
        elif p.is_file():p.unlink()
        removed+=1
    print(json.dumps({'verifiedFullBackupsKept':[p.name for p in keep],'obsoleteBackupArtifactsRemoved':removed}))
    return keep
if __name__=='__main__':prune(sys.argv[1] if len(sys.argv)>1 else '/opt/reestr/backups')
