"""Check Russian app literals against the Kazakh catalog; no network or services."""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
quoted = r'"(?:\\.|[^"\\])*"'
messages = {}
for key, value in re.findall(r'(' + quoted + r')\s*:\s*(' + quoted + r')', (ROOT / 'lib/l10n/kk_messages.dart').read_text()):
    messages[json.loads(key.replace(r'\$', '$'))] = json.loads(value.replace(r'\$', '$'))
keys = [key.upper().strip() for key in messages]
# Demo record values, not interface messages. Production names/addresses stay original.
record_values = {'Алматы', 'Астана', 'Шымкент', 'Караганда', 'Турксиб', 'Алматы, пр. Достык 132', 'Алматы, ул. Абая 48', 'пр. Достык 132', 'ул. Абая 48'}
record_values = {s.upper() for s in record_values}

def covered(value):
    text = value.replace(r'\\n', '\n').replace(r'\n', '\n').strip().upper()
    if not re.search('[А-ЯЁ]{2}', text) or '$' in text or text in record_values:
        return True
    if any(text in key for key in keys):
        return True
    if ' · ' in text:
        return all(covered(part) for part in text.split(' · '))
    return False

missing = []
checked = 0
for path in (ROOT / 'lib').rglob('*.dart'):
    if 'l10n' in path.parts:
        continue
    for match in re.finditer(r'''(?<![\\\w])(['"])((?:\\.|(?!\1).)*?)\1''', path.read_text(), re.S):
        value = match.group(2)
        if not re.search('[А-Яа-яЁё]{2}', value):
            continue
        checked += 1
        if not covered(value):
            missing.append(f'{path.relative_to(ROOT)}:{path.read_text()[:match.start()].count(chr(10))+1}: {value}')
if missing:
    raise SystemExit('Untranslated interface literals:\n' + '\n'.join(missing))
print(f'Kazakh catalog: {len(messages)} messages, {checked} source literals checked; no missing interface literals')
