"""Verify the actual public DOCX, HTML, metadata and client/server version identifiers."""
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
folder = ROOT / 'web/legal'
meta = json.loads((folder / 'offer-ru-v1.json').read_text())
version = meta['version']
with ZipFile(folder / f'{version}.docx') as package:
    document = ET.fromstring(package.read('word/document.xml'))
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def text(p):
    return ''.join(node.text or '' if node.tag == W + 't' else '\n' if node.tag == W + 'br' else '\t' if node.tag == W + 'tab' else '' for node in p.iter())
blocks = []
for child in document.find(W + 'body'):
    if child.tag == W + 'p':
        value = text(child).strip()
        if value:
            blocks.append({'paragraph': value})
    elif child.tag == W + 'tbl':
        blocks.append({'table': [['\n'.join(text(p) for p in cell.findall(W + 'p')) for cell in row.findall(W + 'tc')] for row in child.findall(W + 'tr')]})
canonical = json.dumps(blocks, ensure_ascii=False, separators=(',', ':')).encode()
assert hashlib.sha256(canonical).hexdigest() == meta['sha256'], 'DOCX content differs from the published version'
assert hashlib.sha256((folder / f'{version}.docx').read_bytes()).hexdigest() == meta['docxSha256']
body = '\n'.join(block.get('paragraph', '') for block in blocks)
assert 'Приложение 3' not in body and 'Приложения 3' not in body and '______' not in body
assert 'Приложение 1' in body and 'Приложение 2' in body
assert 'Отдельная отметка-галочка и внесение первоначального аванса для акцепта настоящей оферты не требуются' in body
assert 'явного согласия Заказчика с соответствующей редакцией тарифа' in body
assert sum('table' in b for b in blocks) == 1
html = (folder / f'{version}.html').read_text()
assert html == (ROOT / 'web/offer.html').read_text()
assert meta['sha256'] in html and meta['url'] in html
assert 'Приложение 3' not in html and '______' not in html
assert 'Платные операции в Системе в настоящее время не подключены' in (ROOT / 'web/tariffs.html').read_text()
for path in ['lib/data/public_offer.dart', 'admin/lib/api.ts', 'backend/src/legal/published-offer.ts']:
    assert version in (ROOT / path).read_text(), path
assert meta['sha256'] in (ROOT / 'backend/src/legal/published-offer.ts').read_text()
print('Public offer: DOCX and HTML verified, empty appendix removed, version and hashes match, paid functions remain separate.')
