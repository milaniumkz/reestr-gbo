"""Keep each frontend entrypoint tied to its versioned bundle."""
import pathlib
import re
import shutil
import sys

commit = sys.argv[1]
if not re.fullmatch(r'[a-f0-9]{40}', commit):
    raise SystemExit('Expected exact Git commit')
root = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'build/web')
name = f'main.{commit}.dart.js'
shutil.copyfile(root / 'main.dart.js', root / name)
p = root / 'flutter_bootstrap.js'
s = p.read_text()
s = s.replace('"mainJsPath":"main.dart.js"', f'"mainJsPath":"{name}"')
s = s.replace("mainJsPath === 'main.dart.js'", f"mainJsPath === '{name}'")
s = s.replace("main.dart.js?v=' + buildVersion", f"{name}?v=' + buildVersion")
p.write_text(s)
p = root / 'index.html'
p.write_text(p.read_text().replace('install.js?v=1', f'install.js?v={commit}'))
