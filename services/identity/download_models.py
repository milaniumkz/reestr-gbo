import hashlib,json,urllib.request
from pathlib import Path
ROOT=Path(__file__).parent/'models'
for item in json.loads((ROOT/'opencv-models.json').read_text()):
 path=ROOT/item['file']
 if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=item['sha256']:
  data=urllib.request.urlopen(item['url'],timeout=120).read()
  if hashlib.sha256(data).hexdigest()!=item['sha256']:raise RuntimeError('Invalid model checksum')
  path.write_bytes(data)
 print(item['file'])
