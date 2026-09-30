import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, '.runtime/secrets');
await fs.mkdir(dir, { recursive: true, mode: 0o700 });
for (const name of ['db_admin_password', 'db_migrator_password', 'db_app_password',
  'db_parent_password', 'db_worker_password', 'app_key', 'mail_key']) {
  try { await fs.writeFile(path.join(dir, name), crypto.randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o444 }); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
}
await fs.mkdir(path.join(root, 'migrations'), { recursive: true });
for (const name of ['001-schema.sql', '002-invariants.sql', '003-rls-and-grants.sql', '004-auth-bootstrap.sql']) {
  const target = path.join(root, 'migrations', name);
  try { await fs.copyFile(path.join(root, '../docs/backend-handoff/database', name), target, 1); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
}
await fs.copyFile(path.join(root, '../docs/backend-handoff/deploy/init-db.sh'), path.join(root, 'tests/init-db.sh'));
console.log('Test-only secrets prepared without rotation; no values printed. Baseline migrations preserved.');
