"""Deployment failure gates use synthetic metadata/files; never touch a real stack."""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch, Mock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('production', ROOT / 'scripts/production.py')
prod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prod)


class FakeStack:
    def __init__(self, root, fail=None):
        self.values = {'POSTGRES_IMAGE': 'pinned-postgres', 'API_IMAGE_REF': 'api', 'WEB_IMAGE_REF': 'web',
                       'APP_PORT': '18763', 'APP_URL': 'https://school.example.net'}
        self.envfile = root / '.env.production'
        self.envfile.write_text('PUBLIC_CONFIG_ONLY=1\n')
        self.calls = []
        self.fail = fail

    def dc(self, *args, **kwargs):
        self.calls.append(args)
        if self.fail == 'dump' and 'pg_dump' in ' '.join(args):
            raise prod.Blocked('BACKUP_FAILED')
        if self.fail == 'migrate' and args[-1] == 'migrate':
            raise prod.Blocked('MIGRATION_FAILED')
        if 'count(*)' in ' '.join(args):
            return b'0\n'
        if 'pg_dump' in ' '.join(args):
            kwargs['output'].write(b'synthetic-dump-for-flow-test')
        if 'tar' in args:
            with tarfile.open(fileobj=kwargs['output'], mode='w:gz') as archive:
                value = b'private-synthetic-fixture'
                info = tarfile.TarInfo('uploads/synthetic.txt')
                info.size = len(value)
                archive.addfile(info, io.BytesIO(value))
        return b''

    def health(self, name):
        return 'HEALTHY'

    def inspect(self, name):
        return {'State': {'Running': True}}

    def ids(self, name):
        return ['original-' + name]


class ProductionGuards(unittest.TestCase):
    @unittest.skipUnless(sys.platform == 'linux', 'Linux flock handoff')
    def test_update_lock_survives_bash_exec_and_excludes_a_second_operation(self):
        with tempfile.TemporaryDirectory() as temp:
            state = Path(temp) / '.production'
            child = f'''import importlib.util,subprocess,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('prod',{str(ROOT / 'scripts/production.py')!r})
p=importlib.util.module_from_spec(s);s.loader.exec_module(p);p.STATE=Path({str(state)!r})
with p.deployment_lock():
 code="import fcntl;f=open("+repr(str(p.STATE/'deploy.lock'))+",'a');fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)"
 r=subprocess.run([sys.executable,'-c',code],capture_output=True)
 assert r.returncode!=0
 print('INHERITED_LOCK_PASS')
'''
            with patch.object(prod, 'STATE', state), prod.deployment_lock() as handle:
                environment = dict(os.environ, EDUMANAGE_LOCK_FD=str(handle.fileno()))
                r = subprocess.run(['bash','-c','exec python3 -c "$1"','handoff',child],
                                   env=environment, pass_fds=(handle.fileno(),), capture_output=True, timeout=10)
                self.assertEqual(r.returncode,0,r.stderr.decode())
                self.assertIn(b'INHERITED_LOCK_PASS',r.stdout)

    def test_config_rejects_public_ports_foreign_volumes_and_local_database(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            sec = root / '.secrets/production'
            sec.mkdir(parents=True, mode=0o700)
            for name in prod.SECRETS:
                f = sec / name
                f.write_text(('synthetic-smtp' if name == 'smtp_password' else 'a' * 64) + '\n')
                os.chmod(f, 0o444)
            env = root / '.env.production'
            e = dict(COMPOSE_PROJECT_NAME=prod.PROJECT, POSTGRES_DB=prod.PROJECT, APP_ENV='production',
                     COOKIE_SECURE='true', MAIL_MODE='smtp', APP_URL='https://school.example.net', APP_PORT='18763',
                     SMTP_HOST='smtp.example.net', SMTP_USER='sender@example.net', MAIL_FROM='sender@example.net',
                     SMTP_PORT='587', SMTP_SECURE='false', SOURCE_SHA='a'*40, SECRET_DIR='./.secrets/production',
                     API_IMAGE_REF='ghcr.io/cuongdesignnb/edu-api:v1.0.0', WEB_IMAGE_REF='ghcr.io/cuongdesignnb/edu-web:v1.0.0',
                     POSTGRES_IMAGE='postgres@sha256:'+'b'*64, NGINX_IMAGE='nginx@sha256:'+'c'*64)
            env.write_text(''.join(k+'='+v+'\n' for k,v in e.items()))
            os.chmod(env, 0o600)
            config = {'name': prod.PROJECT, 'services': {s:{} for s in (*prod.SERVICES,'migrate','storage-init')},
                      'volumes': {s:{'name':prod.PROJECT+'_'+s} for s in ('pgdata','private_files')}}
            config['services']['gateway']['ports'] = [{'host_ip':'127.0.0.1','published':'18763','target':8080}]
            with patch.object(prod, 'ROOT', root), patch.object(prod, 'current', return_value=None):
                stack = prod.Stack()
                stack.dc = lambda *args: json.dumps(config).encode()
                prod.config_check(stack, host=False)
                config['services']['api']['ports'] = [{'target':3001,'published':'3001'}]
                with self.assertRaisesRegex(prod.Blocked,'PUBLIC_DATABASE_API_WEB_PORT'):
                    prod.config_check(stack, host=False)
                config['services']['api'].pop('ports')
                config['services']['gateway']['ports'][0]['host_ip'] = '0.0.0.0'
                with self.assertRaisesRegex(prod.Blocked,'GATEWAY_MUST_BIND_LOOPBACK_ONLY'):
                    prod.config_check(stack, host=False)
                config['services']['gateway']['ports'][0]['host_ip'] = '127.0.0.1'
                config['volumes']['pgdata']['name'] = 'edumanage_local_pgdata'
                with self.assertRaisesRegex(prod.Blocked,'FOREIGN_PRODUCTION_VOLUME'):
                    prod.config_check(stack, host=False)
                stack.values['POSTGRES_DB']='edumanage_local'
                with self.assertRaisesRegex(prod.Blocked,'WRONG_PRODUCTION_DATABASE_ENV'):
                    prod.config_check(stack, host=False)

    def test_release_tag_rejects_latest_injection_and_prerelease(self):
        for value in ('latest', 'v1.2', 'v01.2.3', 'v1.2.3;touch /tmp/x', 'v1.2.3-rc.1'):
            with self.assertRaises(prod.Blocked):
                prod.version(value)
        self.assertEqual(prod.version('v1.0.0'), 'v1.0.0')

    def test_env_rejects_secret_literals_duplicate_and_interpolation(self):
        with tempfile.TemporaryDirectory() as temp:
            f = Path(temp) / '.env.production'
            for value in ('SMTP_PASSWORD=private\n', 'APP_PORT=1\nAPP_PORT=2\n', 'APP_URL=$(danger)\n'):
                f.write_text(value)
                with self.assertRaises(prod.Blocked):
                    prod.read_env(f)
            f.write_text('APP_URL="https://school.example.net"\n')
            self.assertEqual(prod.read_env(f)['APP_URL'], 'https://school.example.net')

    def test_generator_never_overwrites_and_uses_lf(self):
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / '.secrets/production'
            args = [sys.executable, str(ROOT / 'scripts/prepare-production-secrets.py'),
                    '--directory', str(target), '--confirm-new']
            subprocess.run(args, check=True, capture_output=True)
            before = {f.name: f.read_bytes() for f in target.iterdir()}
            self.assertEqual(len(before), 7)
            for value in before.values():
                self.assertRegex(value, rb'^[a-f0-9]{64}\n$')
            self.assertNotEqual(subprocess.run(args, capture_output=True).returncode, 0)
            self.assertEqual(before, {f.name: f.read_bytes() for f in target.iterdir()})

    def test_backup_failure_resumes_only_services_that_were_running(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            stack = FakeStack(root, fail='dump')
            stack.inspect = lambda s: {'State': {'Running': s in ('api', 'gateway', 'postgres')}}
            with patch.object(prod, 'ROOT', root), patch.object(prod, 'run', return_value=b'') as commands, \
                 patch.object(prod, 'migration_snapshot', return_value=[]):
                with self.assertRaises(prod.Blocked):
                    prod.backup(stack, hold=True)
            commands.assert_any_call(['docker', 'start', 'original-api', 'original-gateway'], code='BACKUP_RESUME_FAILED')
            self.assertFalse(any('original-worker' in c.args[0] for c in commands.call_args_list))
            self.assertTrue(list((root / 'backups').glob('*/INCOMPLETE')))

    def test_successful_backup_contains_private_files_metadata_and_checksums(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            stack = FakeStack(root)
            with patch.object(prod, 'ROOT', root), patch.object(prod, 'run', return_value=b''), \
                 patch.object(prod, 'current', return_value={'version': 'v1.0.0'}), \
                 patch.object(prod, 'migration_snapshot', return_value=[]):
                out, stopped = prod.backup(stack, hold=True)
            self.assertIn('worker', stopped)
            self.assertFalse(any(c[0] == 'start' for c in stack.calls))
            self.assertTrue((out / 'private-files.tar.gz').is_file())
            self.assertEqual(json.loads((out / 'release-metadata.json').read_text())['current']['version'], 'v1.0.0')
            self.assertIn('database.dump', (out / 'SHA256SUMS.txt').read_text())
            self.assertFalse((out / 'INCOMPLETE').exists())

    def release_failure(self, failed_phase):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            stack = FakeStack(root, fail='migrate' if failed_phase == 'migrate' else None)
            old = {'version': 'v1.0.0', 'postgres_image': 'pinned-postgres'}
            with patch.object(prod.sys, 'platform', 'linux'), patch.object(prod, 'STATE', root / '.production'), \
                 patch.object(prod, 'verified_tag', return_value='a' * 40), \
                 patch.object(prod, 'Stack', return_value=stack), \
                 patch.object(prod, 'config_check'), patch.object(prod, 'current', return_value=old), \
                 patch.object(prod, 'deployment_lock') as lock, \
                 patch.object(prod, 'image_receipt', return_value='pinned-image'), \
                 patch.object(prod.subprocess, 'run', return_value=Mock(returncode=0)), \
                 patch.object(prod, 'backup') as backup, patch.object(prod, 'start_apps') as start:
                lock.return_value.__enter__.return_value = None
                if failed_phase == 'backup':
                    backup.side_effect = prod.Blocked('BACKUP_FAILED')
                else:
                    backup.return_value = (root / 'backup', ['api'])
                with self.assertRaises(prod.Blocked):
                    prod.release('v1.0.1')
                start.assert_not_called()
                if failed_phase == 'backup':
                    self.assertFalse(any(c[-1] == 'migrate' for c in stack.calls))
                else:
                    self.assertEqual(sum(c[-1] == 'migrate' for c in stack.calls), 1)

    def test_backup_failure_blocks_migration_and_app_update(self):
        self.release_failure('backup')

    def test_migration_failure_blocks_app_update(self):
        self.release_failure('migrate')

    def test_changed_schema_blocks_rollback_before_image_switch_or_backup(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            state = root / '.production'
            (state / 'releases').mkdir(parents=True)
            (state / 'releases/v1.0.0-old.json').write_text(json.dumps({'result': 'SUCCESS', 'schema_hash': prod.fingerprint([])}))
            with patch.object(prod.sys, 'platform', 'linux'), patch.object(prod, 'STATE', state), patch.object(prod, 'Stack', return_value=FakeStack(root)), \
                 patch.object(prod, 'config_check'), patch.object(prod, 'deployment_lock'), \
                 patch.object(prod, 'current', return_value={'version': 'v1.0.1'}), \
                 patch.object(prod, 'migration_snapshot', return_value=[{'version': 'new.sql', 'checksum': 'changed'}]), \
                 patch.object(prod, 'image_receipt') as images, patch.object(prod, 'backup') as backup:
                with self.assertRaisesRegex(prod.Blocked, 'ROLLBACK_BLOCKED_NEEDS_RESTORE'):
                    prod.rollback('v1.0.0')
                images.assert_not_called()
                backup.assert_not_called()

    def test_dirty_worktree_blocks_tag_fetch(self):
        with patch.object(prod, 'git', return_value=' M source.ts') as git:
            with self.assertRaisesRegex(prod.Blocked, 'DIRTY_WORKTREE'):
                prod.verified_tag('v1.0.0')
            self.assertEqual(git.call_count, 1)

    def test_operational_logs_never_echo_url_body_or_arbitrary_errors(self):
        self.assertIsNone(prod.safe_log('api | private-token URL /p/link/secret'))
        self.assertIsNone(prod.safe_log('api | {"message":"SMTP secret","body":"private"}'))
        safe = prod.safe_log('api | {"event":"api_ready_to_listen","buildSha":"' + 'a'*40 + '","token":"private"}')
        self.assertIn('api_ready_to_listen', safe)
        self.assertNotIn('private', safe)


if __name__ == '__main__':
    unittest.main()
