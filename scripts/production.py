#!/usr/bin/env python3
"""Conservative Linux production operations. No seed, SQL down or volume deletion."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import stat
import subprocess
import sys
import tarfile
import time
import urllib.request
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
REPO = 'https://github.com/cuongdesignnb/edu'
PROJECT = 'edumanage_production'
STATE = ROOT / '.production'
SERVICES = ('postgres', 'api', 'worker', 'web', 'gateway')
SECRETS = ('db_admin_password', 'db_migrator_password', 'db_app_password',
           'db_parent_password', 'db_worker_password', 'app_key', 'mail_key')
OWN_JOURNAL = None


class Blocked(Exception):
    pass


def require(ok, code):
    if not ok:
        raise Blocked(code)


def run(args, *, env=None, input=None, stdin=None, output=None, code='COMMAND_FAILED'):
    r = subprocess.run(args, cwd=ROOT, env=env, input=input, stdin=stdin,
                       stdout=output or subprocess.PIPE, stderr=subprocess.PIPE)
    require(r.returncode == 0, code)
    return r.stdout or b''


def git(*args):
    return run(['git', *args], code='GIT_CHECK_FAILED').decode().strip()


def version(value):
    require(re.fullmatch(r'v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', value), 'INVALID_RELEASE_TAG')
    return value


def read_env(path):
    require(path.is_file() and not path.is_symlink(), 'MISSING_ENV_PRODUCTION')
    values = {}
    for line in path.read_text(encoding='utf8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        require('=' in line, 'INVALID_ENV_LINE')
        k, v = line.split('=', 1)
        require(re.fullmatch(r'[A-Z][A-Z0-9_]*', k) and k not in values, 'INVALID_ENV_KEY')
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        require(not any(c in v for c in ('$','`','\n','\r')), 'ENV_INTERPOLATION_NOT_ALLOWED')
        # Legacy v1.0.0 templates may contain an empty SMTP password. No value is accepted.
        require((k == 'SMTP_PASSWORD' and v == '') or not any(w in k for w in ('PASSWORD', 'TOKEN', 'PRIVATE_KEY')), 'SECRETS_MUST_BE_FILES')
        values[k] = v
    return values


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, indent=2) + '\n', encoding='utf8')
    os.chmod(tmp, 0o600)
    tmp.replace(path)


def current():
    f = STATE / 'current.json'
    return json.loads(f.read_text()) if f.is_file() else None


def begin_operation(value):
    global OWN_JOURNAL
    OWN_JOURNAL = value
    atomic_json(STATE / 'last-operation.json', value)


def phase(name, **fields):
    global OWN_JOURNAL
    OWN_JOURNAL = dict(OWN_JOURNAL or {}, phase=name, **fields)
    atomic_json(STATE / 'last-operation.json', OWN_JOURNAL)


class Stack:
    def __init__(self, envfile=None, overrides=None, use_current=True):
        self.envfile = Path(envfile or ROOT / '.env.production').resolve()
        self.values = read_env(self.envfile)
        active = current() if use_current else None
        if active:
            self.values.update(API_IMAGE_REF=active['api_image'], WEB_IMAGE_REF=active['web_image'],
                               SOURCE_SHA=active['source_sha'])
        self.values.update(overrides or {})
        # Shell variables must not silently override the reviewed dotenv file.
        self.environment = dict(os.environ)
        for k in ('COMPOSE_FILE', 'COMPOSE_PROFILES', 'COMPOSE_PROJECT_NAME', 'COMPOSE_ENV_FILES'):
            self.environment.pop(k, None)
        self.environment.update(self.values)
        self.command = ['docker', 'compose', '--project-directory', str(ROOT), '--env-file',
                        str(self.envfile), '--project-name', PROJECT, '-f', str(ROOT / 'deploy/compose.production.yml')]

    def dc(self, *args, code=None, **kwargs):
        return run([*self.command, *args], env=self.environment,
                   code=code or 'COMPOSE_' + args[0].upper() + '_FAILED', **kwargs)

    def ids(self, service):
        return self.dc('ps', '-a', '-q', service).decode().split()

    def inspect(self, service):
        ids = self.ids(service)
        require(len(ids) <= 1, 'UNEXPECTED_SERVICE_REPLICAS')
        return json.loads(run(['docker', 'inspect', ids[0]]))[0] if ids else None

    def health(self, service):
        item = self.inspect(service)
        if not item:
            return 'ABSENT'
        state = item['State']
        return state.get('Health', {}).get('Status', state['Status']).upper()


def config_check(stack, host=True, clean=True, allow_running=True):
    e = stack.values
    require(e.get('COMPOSE_PROJECT_NAME', PROJECT) == PROJECT, 'WRONG_PRODUCTION_PROJECT')
    require(e.get('POSTGRES_DB') == PROJECT and e.get('APP_ENV') == 'production', 'WRONG_PRODUCTION_DATABASE_ENV')
    require(e.get('COOKIE_SECURE') == 'true', 'UNSAFE_COOKIE_MODE')
    url = urlsplit(e.get('APP_URL', ''))
    require(url.scheme == 'https' and url.hostname and '.' in url.hostname and not url.username
            and not url.password and not url.port and url.path in ('', '/') and not url.query and not url.fragment
            and not url.hostname.endswith(('.invalid', '.localhost')) and 'REPLACE' not in url.hostname,
            'MISSING_REAL_HTTPS_DOMAIN')
    require(e.get('APP_PORT', '').isdigit() and 1024 <= int(e['APP_PORT']) <= 65535, 'INVALID_APP_PORT')
    for k, name in (('API_IMAGE_REF', 'api'), ('WEB_IMAGE_REF', 'web')):
        require(re.fullmatch(r'ghcr\.io/cuongdesignnb/edu-' + name +
                            r'(?::v\d+\.\d+\.\d+|@sha256:[0-9a-f]{64})', e.get(k, '')), 'INVALID_' + k)
    for k in ('POSTGRES_IMAGE', 'NGINX_IMAGE'):
        require(re.fullmatch(r'[^\s]+@sha256:[0-9a-f]{64}', e.get(k, ''))
                and ':latest' not in e[k], 'PIN_INFRASTRUCTURE_DIGEST_' + k)
    require(re.fullmatch(r'[0-9a-f]{40}', e.get('SOURCE_SHA', '')), 'INVALID_SOURCE_SHA')
    sec = Path(e.get('SECRET_DIR', ''))
    sec = (sec if sec.is_absolute() else ROOT / sec)
    require(sec.resolve() == ROOT / '.secrets/production' and not sec.is_symlink()
            and not any(p.is_symlink() for p in sec.parents), 'PRODUCTION_SECRET_DIRECTORY_ONLY')
    require(sec.is_dir(), 'MISSING_PRODUCTION_SECRETS')
    if os.name == 'posix':
        require(stat.S_IMODE(sec.stat().st_mode) == 0o700, 'SECRET_DIRECTORY_MUST_BE_0700')
        require(stat.S_IMODE(stack.envfile.stat().st_mode) & 0o077 == 0, 'ENV_PRODUCTION_MUST_BE_0600')
    for name in SECRETS:
        f = sec / name
        require(f.is_file() and not f.is_symlink(), 'MISSING_SECRET_' + name)
        value = f.read_text(encoding='utf8').rstrip('\r\n')
        require(bool(value) and '\r' not in value and '\n' not in value, 'INVALID_SECRET_' + name)
        require(re.fullmatch(r'[0-9a-f]{64}', value), 'INVALID_KEY_' + name)
        if os.name == 'posix':
            require(stat.S_IMODE(f.stat().st_mode) == 0o444, 'SECRET_LEAF_MUST_BE_0444_' + name)
    config = json.loads(stack.dc('config', '--format', 'json'))
    require(config['name'] == PROJECT and set(config['services']) == set(SERVICES) | {'migrate', 'storage-init'}, 'UNEXPECTED_COMPOSE_SERVICES')
    for name, svc in config['services'].items():
        require(not svc.get('build'), 'PRODUCTION_MUST_PULL_IMAGES')
        if name != 'gateway':
            require(not svc.get('ports'), 'PUBLIC_DATABASE_API_WEB_PORT')
    ports = config['services']['gateway']['ports']
    require(len(ports) == 1 and ports[0]['host_ip'] == '127.0.0.1'
            and int(ports[0]['published']) == int(e['APP_PORT']) and ports[0]['target'] == 8080,
            'GATEWAY_MUST_BIND_LOOPBACK_ONLY')
    for key in ('pgdata', 'private_files'):
        require(config['volumes'][key]['name'] == PROJECT + '_' + key
                and not config['volumes'][key].get('external'), 'FOREIGN_PRODUCTION_VOLUME')
    if not host:
        return config
    require(sys.platform == 'linux', 'PRODUCTION_REQUIRES_LINUX_HOST')
    info = json.loads(run(['docker', 'info', '--format', '{{json .}}']))
    require(info['OSType'] == 'linux' and info['Architecture'] in ('x86_64', 'amd64')
            and 'Docker Desktop' not in info.get('OperatingSystem', ''), 'PRODUCTION_REQUIRES_LINUX_AMD64_SERVER')
    endpoint = json.loads(run(['docker', 'context', 'inspect']))[0]['Endpoints']['docker']['Host']
    require(endpoint.startswith('unix://') and not os.environ.get('DOCKER_HOST'), 'REMOTE_DOCKER_CONTEXT_REFUSED')
    require(git('remote', 'get-url', 'origin').removesuffix('.git') in (REPO, 'git@github.com:cuongdesignnb/edu'), 'WRONG_SOURCE_REPOSITORY')
    if clean:
        require(not git('status', '--porcelain', '--untracked-files=normal'), 'DIRTY_WORKTREE_DEPLOY_REFUSED')
    for name in config['services']:
        item = stack.inspect(name)
        if item:
            labels = item['Config']['Labels']
            require(labels.get('com.docker.compose.project') == PROJECT
                    and labels.get('com.docker.compose.service') == name
                    and Path(labels.get('com.docker.compose.project.working_dir', '')).resolve() == ROOT,
                    'PROJECT_CONTAINER_BELONGS_TO_OTHER_CHECKOUT')
    try:
        with socket.socket() as so:
            so.bind(('127.0.0.1', int(e['APP_PORT'])))
    except OSError:
        item = stack.inspect('gateway')
        bindings = item.get('HostConfig', {}).get('PortBindings', {}) if item else {}
        require(allow_running and item and item['State']['Running']
                and bindings.get('8080/tcp') == [{'HostIp': '127.0.0.1', 'HostPort': e['APP_PORT']}],
                'APP_PORT_OCCUPIED_NO_PROCESS_WAS_KILLED')
    return config


@contextmanager
def deployment_lock():
    import fcntl
    os.umask(0o077)
    STATE.mkdir(mode=0o700, exist_ok=True)
    require(not STATE.is_symlink(), 'INVALID_STATE_DIRECTORY')
    inherited = os.environ.pop('EDUMANAGE_LOCK_FD', None)
    if inherited is not None:
        require(inherited.isdigit() and int(inherited) >= 3, 'INVALID_INHERITED_LOCK')
        fd = int(inherited)
        actual = os.fstat(fd); expected = (STATE / 'deploy.lock').stat()
        require((actual.st_dev, actual.st_ino) == (expected.st_dev, expected.st_ino), 'FOREIGN_INHERITED_LOCK')
        handle = os.fdopen(fd, 'a')
    else:
        handle = (STATE / 'deploy.lock').open('a')
    with handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Blocked('ANOTHER_PRODUCTION_OPERATION_RUNNING')
        try:
            yield handle
        except Exception as error:
            # Write our own failure while still holding the operation lock.
            # A read-only preflight/status must never change another run's receipt.
            if OWN_JOURNAL is not None:
                failed = dict(OWN_JOURNAL, result='FAILED',
                              failure=str(error) if isinstance(error, Blocked) else type(error).__name__.upper())
                atomic_json(STATE / 'last-operation.json', failed)
            raise


def verified_tag(tag, checkout=False):
    version(tag)
    require(not git('status', '--porcelain', '--untracked-files=normal'), 'DIRTY_WORKTREE_DEPLOY_REFUSED')
    require(git('remote', 'get-url', 'origin') in (REPO, 'git@github.com:cuongdesignnb/edu.git'), 'WRONG_SOURCE_REPOSITORY')
    git('fetch', '--no-tags', 'origin', 'refs/tags/' + tag + ':refs/tags/' + tag)
    sha = git('rev-parse', 'refs/tags/' + tag + '^{commit}')
    remote = git('ls-remote', 'origin', 'refs/tags/' + tag, 'refs/tags/' + tag + '^{}').splitlines()
    refs = dict(line.split('\t')[::-1] for line in remote)
    require(refs.get('refs/tags/' + tag + '^{}', refs.get('refs/tags/' + tag)) == sha, 'REMOTE_TAG_SHA_MISMATCH')
    if checkout:
        git('checkout', '--detach', sha)
    else:
        require(git('rev-parse', 'HEAD') == sha, 'CHECKOUT_EXACT_RELEASE_TAG_FIRST')
    return sha


def image_receipt(ref, sha, tag, name):
    run(['docker', 'pull', ref], code='RELEASE_IMAGE_PULL_FAILED_' + name.upper())
    item = json.loads(run(['docker', 'image', 'inspect', ref]))[0]
    labels = item['Config'].get('Labels') or {}
    require(labels.get('org.opencontainers.image.revision') == sha
            and labels.get('org.opencontainers.image.version') == tag
            and labels.get('org.opencontainers.image.source') == REPO, 'IMAGE_SOURCE_LABEL_MISMATCH_' + name.upper())
    repo = 'ghcr.io/cuongdesignnb/edu-' + name
    digests = [d for d in item.get('RepoDigests', []) if d.startswith(repo + '@sha256:')]
    require(len(digests) == 1, 'MISSING_IMMUTABLE_IMAGE_DIGEST_' + name.upper())
    return digests[0]


def migration_snapshot(stack):
    exists = stack.dc('exec', '-T', 'postgres', 'psql', '-X', '-q', '-A', '-t', '-U', 'postgres',
                      '-d', PROJECT, '-c', "SELECT to_regclass('public.schema_migrations') IS NOT NULL").decode().strip()
    if exists == 'f':
        return []
    query = "SELECT version,checksum FROM public.schema_migrations ORDER BY version"
    data = stack.dc('exec', '-T', 'postgres', 'psql', '-X', '-q', '-A', '-t', '-U', 'postgres',
                    '-d', PROJECT, '-c', query).decode().strip()
    entries = []
    for line in data.splitlines():
        v, checksum = line.split('|')
        require(re.fullmatch(r'\d{3}-[a-z0-9-]+\.sql', v) and re.fullmatch(r'[0-9a-f]{64}', checksum), 'INVALID_MIGRATION_RECEIPT')
        entries.append({'version': v, 'checksum': checksum})
    return entries


def fingerprint(entries):
    return hashlib.sha256(json.dumps(entries, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def resume(stack, stopped):
    if stopped:
        # Compose start follows dependencies and fails when one-shot migrate/
        # storage-init containers were run --rm. Start only the original IDs.
        ids = []
        for name in ('api', 'worker', 'web', 'gateway'):
            if name in stopped:
                service_ids = stack.ids(name)
                require(len(service_ids) == 1, 'BACKUP_ORIGINAL_CONTAINER_MISSING_' + name.upper())
                ids.extend(service_ids)
        run(['docker', 'start', *ids], code='BACKUP_RESUME_FAILED')
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            if all(stack.health(name) == 'HEALTHY' for name in stopped):
                return
            time.sleep(2)
        raise Blocked('BACKUP_RESUMED_BUT_HEALTH_FAILED')


def backup(stack, *, hold=False):
    require(stack.health('postgres') == 'HEALTHY', 'BACKUP_REQUIRES_HEALTHY_POSTGRES')
    # Refuse ad-hoc writer containers of this Compose project.
    ids = run(['docker', 'ps', '-q', '--filter', 'label=com.docker.compose.project=' + PROJECT]).decode().split()
    if ids:
        items = json.loads(run(['docker', 'inspect', *ids]))
        require(all(i['Config']['Labels'].get('com.docker.compose.service') in SERVICES
                    and i['Config']['Labels'].get('com.docker.compose.oneoff', '').lower() != 'true'
                    for i in items), 'STOP_ADHOC_WRITERS_BEFORE_BACKUP')
    out = ROOT / 'backups' / ('production-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    out.mkdir(parents=True, mode=0o700)
    stopped = [s for s in ('gateway', 'web', 'api', 'worker')
               if stack.inspect(s) and stack.inspect(s)['State']['Running']]
    ok = False
    try:
        if stopped:
            stack.dc('stop', '-t', '60', *stopped)
        active = stack.dc('exec', '-T', 'postgres', 'psql', '-X', '-q', '-A', '-t', '-U', 'postgres',
                          '-d', PROJECT, '-c', "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND usename IN ('edu_app','edu_parent','edu_worker','edu_migrator')").decode().strip()
        require(active == '0', 'STOP_EXTERNAL_DATABASE_WRITERS_BEFORE_BACKUP')
        with (out / 'database.dump').open('wb') as handle:
            stack.dc('exec', '-T', 'postgres', 'sh', '-ec',
                     'export PGPASSWORD="$(cat /run/secrets/db_admin_password)"; exec pg_dump -h 127.0.0.1 -U postgres -d "$POSTGRES_DB" -Fc', output=handle)
        require((out / 'database.dump').stat().st_size > 0, 'EMPTY_DATABASE_BACKUP')
        with (out / 'database.dump').open('rb') as handle:
            stack.dc('exec', '-T', 'postgres', 'pg_restore', '--list', stdin=handle)
        with (out / 'private-files.tar.gz').open('wb') as handle:
            stack.dc('run', '--rm', '-T', '--no-deps', '--entrypoint', 'tar', 'api', '-C', '/data', '-czf', '-', '.', output=handle)
        with tarfile.open(out / 'private-files.tar.gz', 'r:gz') as archive:
            require(bool(archive.getmembers()), 'EMPTY_UPLOAD_BACKUP')
        atomic_json(out / 'release-metadata.json', {'current': current(), 'schema': migration_snapshot(stack)})
        shutil.copyfile(stack.envfile, out / 'deployment-env.private')
        sums = []
        for f in sorted(out.iterdir()):
            os.chmod(f, 0o600)
            with f.open('rb') as handle:
                digest = hashlib.file_digest(handle, 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else file_hash(handle)
            sums.append(digest + '  ' + f.name)
        (out / 'SHA256SUMS.txt').write_text('\n'.join(sums) + '\n')
        (out / 'README.txt').write_text('Consistent stopped-writer DB + private-files backup. Keys must be encrypted/off-host separately. Archive parsing PASS; restore rehearsal not performed by this command.\n')
        ok = True
        print('BACKUP=PASS; PATH=' + str(out))
        return out, stopped
    finally:
        if not ok:
            try:
                (out / 'INCOMPLETE').write_text('Do not use for restore.\n')
            except OSError:
                pass  # Even a full backup disk must not skip resuming old writers.
        if not hold or not ok:
            resume(stack, stopped)


def file_hash(handle):
    digest = hashlib.sha256()
    for chunk in iter(lambda: handle.read(1024 * 1024), b''):
        digest.update(chunk)
    return digest.hexdigest()


def smoke(stack, sha):
    def get(base, path):
        with urllib.request.urlopen(base + path, timeout=15) as response:
            require(response.status == 200, 'HTTP_SMOKE_FAILED')
            require(urlsplit(response.url).netloc == urlsplit(base).netloc, 'UNEXPECTED_SMOKE_REDIRECT')
            return response.read(), response.headers
    for base in ('http://127.0.0.1:' + stack.values['APP_PORT'], stack.values['APP_URL'].rstrip('/')):
        for path in ('/', '/login'):
            get(base, path)
        for path in ('/api/v1/health/live', '/api/v1/health/ready'):
            payload, _ = get(base, path)
            require(json.loads(payload)['data']['buildSha'] == sha, 'SMOKE_BUILD_SHA_MISMATCH')
        _, headers = get(base, '/api/v1/auth/csrf')
        cookies = headers.get_all('Set-Cookie') or []
        require(any(c.startswith('__Host-edu_csrf=') and 'secure' in c.lower()
                    and 'path=/' in c.lower() and 'domain=' not in c.lower() for c in cookies), 'SECURE_COOKIE_SMOKE_FAILED')
    return 'PASS'


def start_apps(stack):
    stack.dc('up', '-d', '--no-deps', '--wait', '--wait-timeout', '240', 'api', 'worker')
    stack.dc('up', '-d', '--no-deps', '--wait', '--wait-timeout', '180', 'web')
    stack.dc('up', '-d', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '180', 'gateway')
    for s in SERVICES:
        require(stack.health(s) == 'HEALTHY', 'UNHEALTHY_' + s.upper())


def record(tag, sha, stack, schema, backup_path, action, previous):
    global OWN_JOURNAL
    receipt = {'version': tag, 'source_sha': sha, 'api_image': stack.values['API_IMAGE_REF'],
               'web_image': stack.values['WEB_IMAGE_REF'], 'postgres_image': stack.values['POSTGRES_IMAGE'],
               'nginx_image': stack.values['NGINX_IMAGE'], 'schema': schema, 'schema_hash': fingerprint(schema),
               'migration_revision': schema[-1]['version'] if schema else None,
               'deployed_at': datetime.now(timezone.utc).isoformat(), 'action': action,
               'previous_version': previous['version'] if previous else 'NONE',
               'backup': str(backup_path) if backup_path else 'SKIPPED_NEW_VOLUME', 'result': 'SUCCESS'}
    event = STATE / 'releases' / (tag + '-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
    atomic_json(event, receipt)
    atomic_json(STATE / 'current.json', receipt)
    atomic_json(STATE / 'last-operation.json', receipt)
    OWN_JOURNAL = None
    print('EDUMANAGE_RELEASE\nFROM=' + receipt['previous_version'] + '\nTO=' + tag)
    print('BACKUP=' + ('PASS' if backup_path else 'SKIPPED_NEW_VOLUME'))
    print('IMAGES=PASS\nMIGRATION=' + ('UNCHANGED' if action == 'rollback' else 'PASS'))
    print('API=HEALTHY\nWORKER=HEALTHY\nWEB=HEALTHY\nGATEWAY=HEALTHY\nHTTPS_SMOKE=PASS\nRESULT=SUCCESS')


def release(tag):
    require(sys.platform == 'linux', 'PRODUCTION_REQUIRES_LINUX_HOST')
    with deployment_lock():
        sha = verified_tag(tag)
        old = Stack()
        # The same lock covers Git checkout, config reads and live mutations.
        candidate = Stack(overrides={'API_IMAGE_REF': 'ghcr.io/cuongdesignnb/edu-api:' + tag,
                                     'WEB_IMAGE_REF': 'ghcr.io/cuongdesignnb/edu-web:' + tag, 'SOURCE_SHA': sha}, use_current=False)
        config_check(candidate)
        previous = current()
        if previous:
            require(candidate.values['POSTGRES_IMAGE'] == previous['postgres_image'], 'POSTGRES_UPGRADE_REQUIRES_DBA_PLAN')
        begin_operation({'action': 'release', 'version': tag,
                    'source_sha': sha, 'previous': previous, 'phase': 'PREPARING', 'result': 'PENDING'})
        api = image_receipt(candidate.values['API_IMAGE_REF'], sha, tag, 'api')
        web = image_receipt(candidate.values['WEB_IMAGE_REF'], sha, tag, 'web')
        candidate = Stack(overrides={'API_IMAGE_REF': api, 'WEB_IMAGE_REF': web, 'SOURCE_SHA': sha}, use_current=False)
        phase('IMAGES_PULLED', api_image=api, web_image=web)
        # Infrastructure is pinned too. Pull before any maintenance downtime.
        candidate.dc('pull', 'postgres', 'gateway')
        existed = subprocess.run(['docker', 'volume', 'inspect', PROJECT + '_pgdata'],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
        candidate.dc('up', '-d', '--no-deps', '--wait', '--wait-timeout', '180', 'postgres')
        saved = None
        if existed:
            # Retry of an interrupted first deploy also backs up its partial DB.
            saved, _ = backup(old if previous else candidate, hold=True)
        phase('MAINTENANCE', backup=str(saved) if saved else 'SKIPPED_NEW_VOLUME')
        candidate.dc('run', '--rm', '-T', '--no-deps', 'storage-init')
        # Migrations execute once under edu_migrator. Up --no-deps never reruns them.
        phase('MIGRATING')
        candidate.dc('run', '--rm', '-T', '--no-deps', 'migrate', code='MIGRATION_FAILED')
        candidate.dc('run', '--rm', '-T', '--no-deps', 'migrate', 'verify-installation', code='INSTALLATION_VERIFICATION_FAILED')
        schema = migration_snapshot(candidate)
        phase('MIGRATED', schema=schema, schema_hash=fingerprint(schema))
        start_apps(candidate)
        phase('SMOKE_CHECK')
        smoke(candidate, sha)
        record(tag, sha, candidate, schema, saved, 'release', previous)


def rollback(tag):
    version(tag)
    require(sys.platform == 'linux', 'PRODUCTION_REQUIRES_LINUX_HOST')
    with deployment_lock():
        stack = Stack()
        config_check(stack)
        previous = current()
        require(previous is not None, 'NO_ACTIVE_RELEASE_METADATA')
        receipts = sorted((STATE / 'releases').glob(tag + '-*.json'), reverse=True)
        require(receipts, 'TARGET_RELEASE_WAS_NEVER_DEPLOYED')
        target = json.loads(receipts[0].read_text())
        schema = migration_snapshot(stack)
        # Equality is conservative proof. Additive changes also require DBA review.
        require(target.get('result') == 'SUCCESS' and fingerprint(schema) == target['schema_hash'],
                'ROLLBACK_BLOCKED_NEEDS_RESTORE')
        for name in ('api', 'web'):
            ref = image_receipt(target[name + '_image'], target['source_sha'], tag, name)
            require(ref == target[name + '_image'], 'ROLLBACK_DIGEST_MISMATCH')
        candidate = Stack(overrides={'API_IMAGE_REF': target['api_image'], 'WEB_IMAGE_REF': target['web_image'],
                                     'SOURCE_SHA': target['source_sha']})
        begin_operation({'action': 'rollback', 'version': tag,
                    'previous': previous, 'phase': 'PREPARING', 'result': 'PENDING'})
        saved, _ = backup(stack, hold=True)
        start_apps(candidate)
        smoke(candidate, target['source_sha'])
        record(tag, target['source_sha'], candidate, schema, saved, 'rollback', previous)


def status():
    stack = Stack()
    active = current() or {}
    print('RELEASE=' + active.get('version', 'NONE') + '\nSOURCE_SHA=' + active.get('source_sha', 'UNVERIFIED'))
    for name in ('api', 'web'):
        item = stack.inspect(name)
        print(name.upper() + '_IMAGE=' + (item['Config']['Image'] if item else 'ABSENT'))
    schema = migration_snapshot(stack) if stack.health('postgres') == 'HEALTHY' else []
    print('MIGRATION=' + (schema[-1]['version'] if schema else 'UNVERIFIED'))
    print('SCHEMA_MATCHES_RELEASE=' + ('YES' if schema and fingerprint(schema) == active.get('schema_hash') else 'UNVERIFIED_OR_NO'))
    for name in SERVICES:
        print(name.upper() + '=' + stack.health(name))
    print('DOMAIN=' + stack.values.get('APP_URL', 'MISSING'))
    try:
        smoke(stack, active.get('source_sha', ''))
        print('HTTPS=PASS')
    except Exception:
        print('HTTPS=FAIL_OR_NOT_CONFIGURED')
    last = STATE / 'last-operation.json'
    if last.is_file():
        print('LAST_OPERATION=' + json.loads(last.read_text()).get('result', 'UNKNOWN'))


def safe_log(line):
    """Only structured operational fields or our URI-free gateway format escape."""
    service, sep, body = line.partition('|')
    if not sep:
        return None
    body = body.strip()
    try:
        value = json.loads(body)
        safe = {}
        for key in ('event', 'code', 'status', 'buildSha'):
            v = value.get(key)
            if isinstance(v, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,80}', v):
                safe[key] = v
        return service.strip() + ' | ' + json.dumps(safe) if safe else None
    except (ValueError, AttributeError):
        if 'gateway' in service and re.fullmatch(r'[a-f0-9]{32} (GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS) \d{3} \d+\.\d+', body):
            return service.strip() + ' | ' + body
        return None


def logs(tail, follow):
    stack = Stack()
    args = [*stack.command, 'logs', '--no-color', '--tail', str(tail)]
    if follow:
        args.append('--follow')
    args.extend(('api', 'worker', 'web', 'gateway'))
    print('LOG_FILTER=operational fields only; raw errors, URLs, bodies and arbitrary text omitted', flush=True)
    with subprocess.Popen(args, cwd=ROOT, env=stack.environment, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL, text=True) as proc:
        for line in proc.stdout:
            value = safe_log(line)
            if value:
                print(value, flush=True)
        require(proc.wait() == 0, 'COMPOSE_LOGS_FAILED')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('operation', choices=('preflight', 'release', 'rollback', 'status', 'logs', 'backup', 'update'))
    p.add_argument('tag', nargs='?')
    p.add_argument('--env-file')
    p.add_argument('--config-only', action='store_true')
    p.add_argument('--confirm-maintenance', action='store_true')
    p.add_argument('--follow', action='store_true')
    p.add_argument('--tail', type=int, default=200)
    a = p.parse_args()
    require(not a.config_only or a.operation == 'preflight', 'CONFIG_ONLY_IS_READ_ONLY')
    if a.operation == 'preflight':
        config_check(Stack(a.env_file), host=not a.config_only)
        print('PRODUCTION_COMPOSE_CHECK=PASS\nPRODUCTION_PREFLIGHT=' + ('CONFIG_ONLY_PASS_HOST_NOT_RUN' if a.config_only else 'PASS'))
    elif a.operation == 'release':
        release(version(a.tag or ''))
    elif a.operation == 'rollback':
        rollback(version(a.tag or ''))
    elif a.operation == 'update':
        require(sys.platform == 'linux', 'PRODUCTION_REQUIRES_LINUX_HOST')
        # Fetch exactly the requested remote tag, refuse dirty worktrees and checkout its SHA.
        with deployment_lock() as handle:
            verified_tag(version(a.tag or ''), checkout=True)
            # Transfer the same flock through Bash exec into the tag's release code.
            # There is no unlocked checkout-to-deploy window.
            os.set_inheritable(handle.fileno(), True)
            environment = dict(os.environ, EDUMANAGE_LOCK_FD=str(handle.fileno()))
            os.execvpe('bash', ['bash', str(ROOT / 'scripts/release.sh'), a.tag], environment)
    elif a.operation == 'status':
        status()
    elif a.operation == 'logs':
        require(1 <= a.tail <= 10000, 'INVALID_LOG_TAIL')
        logs(a.tail, a.follow)
    else:
        require(a.confirm_maintenance, 'BACKUP_REQUIRES_CONFIRM_MAINTENANCE')
        require(sys.platform == 'linux', 'PRODUCTION_REQUIRES_LINUX_HOST')
        with deployment_lock():
            stack = Stack()
            config_check(stack)
            backup(stack)


if __name__ == '__main__':
    try:
        main()
    except (Blocked, OSError, ValueError, KeyError, urllib.error.URLError) as error:
        code = str(error) if isinstance(error, Blocked) else type(error).__name__.upper()
        # Do not print command output, connection strings, tokens or HTTP bodies.
        print('RESULT=FAILED\nBLOCKER=' + code, file=sys.stderr)
        sys.exit(1)
