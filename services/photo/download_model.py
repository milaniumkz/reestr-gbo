"""Build-time public weights only. Runtime has no outbound network access."""
from pathlib import Path
import hashlib,json,os,tempfile,urllib.request
ROOT=Path(__file__).parent

def ensure_model():
    manifest=json.loads((ROOT/'model.json').read_text());directory=ROOT/'models';directory.mkdir(exist_ok=True)
    target=directory/manifest['file']
    def valid(path):
        return path.is_file() and path.stat().st_size==manifest['size'] and hashlib.sha256(path.read_bytes()).hexdigest()==manifest['sha256']
    if valid(target):return target
    name=None
    try:
        with tempfile.NamedTemporaryFile(dir=directory,delete=False) as dest:
            name=dest.name
            with urllib.request.urlopen(manifest['url'],timeout=60) as source:
                size=0
                while chunk:=source.read(1024*1024):
                    size+=len(chunk)
                    if size>manifest['size']:raise ValueError('Model exceeds pinned size')
                    dest.write(chunk)
        if not valid(Path(name)):raise ValueError('Model checksum mismatch')
        os.replace(name,target);return target
    finally:
        if name and Path(name).exists():Path(name).unlink()

if __name__=='__main__':
    ensure_model();print('Pinned public photo detector verified')
