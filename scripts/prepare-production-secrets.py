#!/usr/bin/env python3
"""Create fresh production-only secrets; never overwrite/rotate existing keys."""
import argparse
import os
from pathlib import Path
import secrets


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--directory', required=True)
    p.add_argument('--confirm-new', action='store_true')
    a = p.parse_args()
    if not a.confirm_new:
        p.error('--confirm-new required; this is not credential rotation')
    d = Path(a.directory).absolute()
    if d.exists() or d.is_symlink() or any(v.is_symlink() for v in d.parents):
        p.error('Secret directory must be new and have no symlink ancestors')
    os.umask(0o077)
    d.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(d.parent, 0o700)
    d.mkdir(mode=0o700)
    names = ['db_admin_password', 'db_migrator_password', 'db_app_password',
             'db_parent_password', 'db_worker_password', 'app_key', 'mail_key']
    values = {name: secrets.token_hex(32) for name in names}
    for name, value in values.items():
        f = d / name
        fd = os.open(f, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o444)
        with os.fdopen(fd, 'w', encoding='utf8', newline='\n') as out:
            out.write(value + '\n')
        # Compose file secrets are bind mounts. UID 1000 and PostgreSQL's UID
        # must both read the leaf; the host directory remains owner-only 0700.
        os.chmod(f, 0o444)
    print('SECRETS=CREATED_NEW; SMTP=OPTIONAL_PLATFORM_SETTINGS')


if __name__ == '__main__':
    main()
