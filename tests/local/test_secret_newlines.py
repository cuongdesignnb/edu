"""Exercise the real generator and init reader using temporary synthetic secrets."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class LocalSecrets(unittest.TestCase):
    def test_generator_writes_lf_and_keeps_existing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            (root / "deploy").mkdir()
            shutil.copyfile(ROOT / "scripts/prepare-local.py", root / "scripts/prepare-local.py")
            shutil.copyfile(ROOT / "deploy/.env.local-docker.example", root / "deploy/.env.local-docker.example")
            command = [sys.executable, str(root / "scripts/prepare-local.py")]
            environment = dict(os.environ, PYTHONUTF8="1")
            subprocess.run(command, env=environment, check=True, capture_output=True)
            files = list((root / ".secrets/local").iterdir())
            before = {f.name: f.read_bytes() for f in files}
            self.assertEqual(len(before), 8)
            for value in before.values():
                self.assertRegex(value, rb"^[a-f0-9]{64}\n$")
                self.assertNotIn(b"\r", value)
            subprocess.run(command, env=environment, check=True, capture_output=True)
            self.assertEqual(before, {f.name: f.read_bytes() for f in files})

    def test_initializer_and_backend_agree_for_crlf_and_lf(self):
        bash = shutil.which("bash")
        git_bash = Path("C:/Program Files/Git/bin/bash.exe")
        if git_bash.exists():
            bash = str(git_bash)
        if not bash:
            self.skipTest("Bash unavailable")
        source = (ROOT / "deploy/init-db.sh").read_text(encoding="utf-8")
        reader = next(line for line in source.splitlines() if line.startswith("export EDU_APP_PASSWORD="))
        reader = reader.replace("< /run/secrets/db_app_password", "")
        command = reader + '\nprintf "%s" "$EDU_APP_PASSWORD"'
        for fixture in [b"synthetic-only-password\n", b"synthetic-only-password\r\n"]:
            result = subprocess.run([bash, "-c", command], input=fixture, check=True, capture_output=True)
            self.assertEqual(result.stdout, fixture.rstrip(b"\r\n"))


if __name__ == "__main__":
    unittest.main()
