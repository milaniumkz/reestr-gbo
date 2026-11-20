"""Exercise the actual backup shell script with synthetic storage and fake pg_dump."""
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import threading
import time
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'ops' / 'backup-reestr.sh'

class LiveBackupTest(unittest.TestCase):
    def fixture(self, root):
        app, storage, backups, tools = (root / n for n in ('app', 'storage', 'backups', 'bin'))
        for d in (app / 'backend', app / 'ops', storage / 'inspections', storage / 'empty', backups, tools):
            d.mkdir(parents=True, exist_ok=True)
        payload = os.urandom(24 * 1024 * 1024)
        (storage / 'inspections' / 'original.bin').write_bytes(payload)
        (storage / 'inspections' / '-strange\nname.txt').write_bytes(b'original with a special name')
        (app / 'backend' / '.env').write_text(f'DATABASE_URL=synthetic\nLOCAL_STORAGE_PATH={storage}\n')
        (tools / 'pg_dump').write_text('#!/usr/bin/env python3\nimport pathlib,sys\npathlib.Path(sys.argv[sys.argv.index("--file")+1]).write_bytes(b"synthetic dump")\n')
        (tools / 'pg_dump').chmod(0o700)
        (app / 'ops' / 'prune-backups.py').write_text('from pathlib import Path\nimport sys\nPath(sys.argv[1],"prune-called").touch()\n')
        env = {**os.environ, 'APP_DIR':str(app), 'BACKUP_DIR':str(backups), 'BACKUP_LOCK_FILE':str(root / 'backup.lock'), 'PATH':str(tools)+os.pathsep+os.environ['PATH']}
        return storage, backups, payload, env

    def test_directory_uploads_do_not_break_the_snapshot(self):
        with tempfile.TemporaryDirectory() as work:
            storage, backups, payload, env = self.fixture(Path(work))
            stop = threading.Event()
            def uploads():
                i = 0
                while not stop.is_set():
                    (storage / 'inspections' / f'new-{i}.bin').write_bytes(b'new upload')
                    i += 1
                    time.sleep(.002)
            writer = threading.Thread(target=uploads)
            writer.start()
            try:
                result = subprocess.run(['bash',str(SCRIPT)],env=env,capture_output=True,text=True,timeout=30)
            finally:
                stop.set();writer.join()
            self.assertEqual(result.returncode,0,result.stderr)
            snapshots = [p for p in backups.iterdir() if p.is_dir()]
            self.assertEqual(len(snapshots),1)
            snapshot = snapshots[0]
            self.assertTrue((snapshot / 'manifest.json').exists())
            self.assertTrue((backups / 'prune-called').exists())
            self.assertFalse(list(snapshot.glob('.storage-files.*')))
            with tarfile.open(snapshot / 'storage.tar.gz') as archive:
                self.assertEqual(archive.extractfile('./inspections/original.bin').read(),payload)
                self.assertEqual(archive.extractfile('./inspections/-strange\nname.txt').read(),b'original with a special name')
                self.assertTrue(archive.getmember('./empty').isdir())

    def test_changing_file_contents_still_fail_without_a_complete_manifest(self):
        with tempfile.TemporaryDirectory() as work:
            storage, backups, _, env = self.fixture(Path(work))
            stop = threading.Event()
            def overwrite():
                while not stop.is_set():
                    with (storage / 'inspections' / 'original.bin').open('r+b') as f:
                        f.write(os.urandom(4096))
                    time.sleep(.002)
            writer = threading.Thread(target=overwrite)
            writer.start()
            try:
                result = subprocess.run(['bash',str(SCRIPT)],env=env,capture_output=True,text=True,timeout=30)
            finally:
                stop.set();writer.join()
            self.assertNotEqual(result.returncode,0)
            self.assertIn('file changed as we read it',result.stderr)
            self.assertFalse(list(backups.glob('*/manifest.json')))
            self.assertFalse((backups / 'prune-called').exists())

if __name__ == '__main__':
    unittest.main()
