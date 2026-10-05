import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { migrate } from '../../dist/database/migrate.js';
import { verifyInstallation } from '../../dist/database/verify.js';
import { databaseConfig } from '../../dist/common/config.js';

const version = '059-direct-school-staff.sql';
const checksum = '5d6b104ad36b5e2774737d849eef2b428c59d6d308ba7ae79c44201ab05123c5';
const schoolIds = [1, 2, 3].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const pools = [];
let admin, baseline, migrations, historicalSql, migrationFiles, pending;

before(async () => {
  assert.equal(process.env.APP_ENV, 'test');
  assert.equal(process.env.DB_NAME, 'edumanage_test_local');
  migrations = path.resolve('migrations');
  migrationFiles=(await fs.readdir(migrations)).filter(n=>/^\d{3}-.*\.sql$/.test(n)).sort();pending=migrationFiles.filter(n=>Number(n.slice(0,3))>58);
  const source = await fs.readFile(path.join(migrations, version));
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), checksum);
  historicalSql = source.toString('utf8').replace(/^\s*BEGIN\s*;/im, '').replace(/^\s*COMMIT\s*;/im, '');
  baseline = await fs.mkdtemp(path.join(os.tmpdir(), 'edu-migration-058-'));
  for (const file of await fs.readdir(migrations)) {
    if (/^\d{3}-.*\.sql$/.test(file) && Number(file.slice(0, 3)) <= 58) {
      await fs.copyFile(path.join(migrations, file), path.join(baseline, file));
    }
  }
  admin = new Pool({ ...databaseConfig('migrator'), user: 'postgres',
    password: (await fs.readFile('/run/secrets/db_admin_password', 'utf8')).trim() });
  const roles = (await admin.query("SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('edu_migrator','edu_app','edu_worker','edu_parent') ORDER BY rolname")).rows;
  assert.equal(roles.length, 4);
  assert.ok(roles.every(role => !role.rolsuper && !role.rolbypassrls));
});

after(async () => {
  await Promise.all(pools.map(pool => pool.end()));
  await admin?.end();
  // Dedicated fixture databases and their Docker volume are preserved.
});

async function fixture(populated = true) {
  const database = 'edumanage_test_migration_' + crypto.randomBytes(8).toString('hex');
  await admin.query(`CREATE DATABASE "${database}" OWNER edu_migrator`);
  const config = { ...databaseConfig('migrator'), database };
  const bootstrap = new Pool({ ...config, user: 'postgres',
    password: (await fs.readFile('/run/secrets/db_admin_password', 'utf8')).trim() });
  try { await bootstrap.query('CREATE EXTENSION btree_gist; REVOKE CREATE ON SCHEMA public FROM PUBLIC'); }
  finally { await bootstrap.end(); }
  const pool = new Pool(config);
  pools.push(pool);
  assert.equal((await pool.query('SELECT current_user AS role')).rows[0].role, 'edu_migrator');
  assert.equal((await migrate({ config, directory: baseline })).current.slice(0, 3), '058');
  if (populated) {
    for (const [i, school] of schoolIds.entries()) {
      await pool.query('INSERT INTO platform.schools(id,code,slug,name,status,settings) VALUES($1,$2,$2,$3,$4,$5)',
        [school, 'fixture-' + i, 'Migration fixture ' + i, ['ACTIVE', 'SUSPENDED', 'ARCHIVED'][i], { preserved: i }]);
      await scoped(pool, school, async tx => {
        await tx.query("INSERT INTO app.roles(school_id,code,label,system_role) VALUES($1,'SCHOOL_ADMIN','Existing school admin',true),($1,'CUSTOM','Existing custom role',false)", [school]);
        // Existing permissions must retain their original id, scope and timestamps.
        await tx.query("INSERT INTO app.role_permissions(school_id,role_id,action_code,allowed_scopes) SELECT school_id,id,'school.read',ARRAY['CLASS']::text[] FROM app.roles WHERE code='CUSTOM'");
      });
    }
    await pool.query("INSERT INTO identity.users(email_normalized,display_name,status) VALUES('existing@example.invalid','Existing identity','ACTIVE')");
  }
  return { config, pool };
}

async function scoped(pool, school, action) {
  const tx = await pool.connect();
  await tx.query('BEGIN');
  try {
    await tx.query("SELECT set_config('app.school_id',$1,true)", [school]);
    const result = await action(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK');
    throw error;
  } finally { tx.release(); }
}

async function history(pool) {
  return (await pool.query('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows;
}

async function assertUpgrade(pool) {
  for (const school of schoolIds) {
    await scoped(pool, school, async tx => {
      const teacher = (await tx.query("SELECT id,school_id FROM app.roles WHERE code='TEACHER' AND system_role")).rows;
      assert.equal(teacher.length, 1);
      assert.equal(teacher[0].school_id, school);
      const permissions = (await tx.query("SELECT action_code,allowed_scopes,school_id FROM app.role_permissions WHERE role_id=$1 ORDER BY action_code", [teacher[0].id])).rows;
      assert.deepEqual(permissions.map(row => row.action_code), ['school.read', 'teacher.self', 'year.read']);
      assert.ok(permissions.every(row => row.school_id === school && JSON.stringify(row.allowed_scopes) === '["SCHOOL"]'));
      const direct = (await tx.query("SELECT p.allowed_scopes FROM app.role_permissions p JOIN app.roles r ON r.school_id=p.school_id AND r.id=p.role_id WHERE r.code='SCHOOL_ADMIN' AND p.action_code='member.create_direct'")).rows;
      assert.deepEqual(direct, [{ allowed_scopes: ['SCHOOL'] }]);
    });
  }
  assert.equal((await pool.query('SELECT checksum FROM public.schema_migrations WHERE version=$1', [version])).rows[0].checksum, checksum);
  assert.equal((await history(pool)).length, migrationFiles.length);
  assert.deepEqual(await verifyInstallation(pool), {
    schemaRevision: migrationFiles.at(-1), migrations: migrationFiles.length, rolesSafe: true, forceRls: true,
  });
}

test('reproduces production 058/42501, then upgrades all tenants without changing history or existing data', async () => {
  const { config, pool } = await fixture();
  const before = await history(pool);
  const data = (await pool.query('SELECT * FROM platform.schools ORDER BY id')).rows;
  const identities = (await pool.query('SELECT * FROM identity.users ORDER BY id')).rows;
  const custom = await Promise.all(schoolIds.map(school => scoped(pool, school, async tx =>
    (await tx.query("SELECT p.* FROM app.role_permissions p JOIN app.roles r ON r.school_id=p.school_id AND r.id=p.role_id WHERE r.code='CUSTOM'")).rows)));
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await assert.rejects(tx.query(historicalSql), error => error.code === '42501' && /roles/.test(error.message));
  } finally { await tx.query('ROLLBACK'); tx.release(); }
  assert.deepEqual(await history(pool), before);
  assert.deepEqual((await migrate({ config })).applied, pending);
  await assertUpgrade(pool);
  assert.deepEqual((await history(pool)).slice(0, 58), before);
  assert.deepEqual((await pool.query('SELECT * FROM platform.schools ORDER BY id')).rows, data);
  assert.deepEqual((await pool.query('SELECT * FROM identity.users ORDER BY id')).rows, identities);
  assert.deepEqual(await Promise.all(schoolIds.map(school => scoped(pool, school, async t =>
    (await t.query("SELECT p.* FROM app.role_permissions p JOIN app.roles r ON r.school_id=p.school_id AND r.id=p.role_id WHERE r.code='CUSTOM'")).rows))), custom);
  assert.deepEqual((await migrate({ config })).applied, []);
});

test('empty 058 database and complete fresh install both reach current schema with original 059 checksum', async () => {
  const { config, pool } = await fixture(false);
  assert.deepEqual((await migrate({ config })).applied, pending);
  assert.equal((await history(pool)).length, migrationFiles.length);
  assert.equal((await history(pool))[58].checksum, checksum);
  const database = 'edumanage_test_migration_' + crypto.randomBytes(8).toString('hex');
  await admin.query(`CREATE DATABASE "${database}" OWNER edu_migrator`);
  const fresh = { ...config, database };
  const bootstrap = new Pool({ ...fresh, user: 'postgres', password: (await fs.readFile('/run/secrets/db_admin_password', 'utf8')).trim() });
  try { await bootstrap.query('CREATE EXTENSION btree_gist; REVOKE CREATE ON SCHEMA public FROM PUBLIC'); }
  finally { await bootstrap.end(); }
  assert.equal((await migrate({ config: fresh })).applied.length, migrationFiles.length);
  assert.deepEqual((await migrate({ config: fresh })).applied, []);
});

test('failure in a later tenant rolls back all tenant writes and 059 ledger; retry succeeds', async () => {
  const { config, pool } = await fixture();
  await pool.query(`CREATE FUNCTION app.migration_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.school_id='${schoolIds[1]}'::uuid AND NEW.action_code='teacher.self' THEN
      RAISE EXCEPTION 'controlled migration failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER migration_fixture_fail BEFORE INSERT ON app.role_permissions FOR EACH ROW EXECUTE FUNCTION app.migration_fixture_fail()`);
  await assert.rejects(migrate({ config }), { message: 'Migration failed 059-direct-school-staff.sql (P0001)' });
  assert.equal((await history(pool)).length, 58);
  assert.equal((await pool.query("SELECT to_regclass('platform.public_class_portals') AS table_name")).rows[0].table_name, null);
  for (const school of schoolIds) await scoped(pool, school, async tx => {
    assert.equal((await tx.query("SELECT count(*)::int AS n FROM app.roles WHERE code='TEACHER'")).rows[0].n, 0);
    assert.equal((await tx.query("SELECT count(*)::int AS n FROM app.role_permissions WHERE action_code='member.create_direct'")).rows[0].n, 0);
  });
  await pool.query('DROP TRIGGER migration_fixture_fail ON app.role_permissions; DROP FUNCTION app.migration_fixture_fail()');
  await migrate({ config });
  await assertUpgrade(pool);
});

test('compatibility rejects modified pending 059 and normal checksum gate rejects modified applied source', async () => {
  const { config, pool } = await fixture();
  const altered = await fs.mkdtemp(path.join(os.tmpdir(), 'edu-migration-altered-'));
  for (const file of await fs.readdir(migrations)) await fs.copyFile(path.join(migrations, file), path.join(altered, file));
  await fs.appendFile(path.join(altered, version), '\n-- altered test fixture\n');
  await assert.rejects(migrate({ config, directory: altered }), { message: 'Migration checksum mismatch ' + version });
  assert.equal((await history(pool)).length, 58);
  await migrate({ config });
  await assert.rejects(migrate({ config, directory: altered }), { message: 'Migration checksum mismatch ' + version });
  await fs.copyFile(path.join(migrations, version), path.join(altered, version));
  const first = (await fs.readdir(altered)).sort()[0];
  await fs.appendFile(path.join(altered, first), '\n-- altered test fixture\n');
  await assert.rejects(migrate({ config, directory: altered }), { message: 'Migration checksum mismatch ' + first });
});

test('concurrent migration runners serialize and record 059 once', async () => {
  const { config, pool } = await fixture();
  const results = await Promise.all([migrate({ config }), migrate({ config })]);
  assert.deepEqual(results.map(result => result.applied.length).sort(), [0, pending.length]);
  await assertUpgrade(pool);
});

test('RLS remains forced and app/migrator cannot read or write another tenant after upgrade', async () => {
  const { config, pool } = await fixture();
  await migrate({ config });
  const guards = (await pool.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid IN ('app.roles'::regclass,'app.role_permissions'::regclass) ORDER BY relname")).rows;
  assert.equal(guards.length, 2);
  assert.ok(guards.every(row => row.relrowsecurity && row.relforcerowsecurity));
  const app = new Pool({ ...databaseConfig('app'), database: config.database });
  pools.push(app);
  await assert.rejects(migrate({ config: { ...databaseConfig('app'), database: config.database } }), { message: 'Migration requires edu_migrator' });
  for (const restricted of [pool, app]) {
    assert.equal((await restricted.query('SELECT count(*)::int AS n FROM app.roles')).rows[0].n, 0);
    await scoped(restricted, schoolIds[0], async tx => {
      assert.equal((await tx.query('SELECT count(*)::int AS n FROM app.roles WHERE school_id=$1', [schoolIds[1]])).rows[0].n, 0);
    });
    await assert.rejects(scoped(restricted, schoolIds[0], tx => tx.query(
      "INSERT INTO app.roles(school_id,code,label) VALUES($1,'DENIED','Cross tenant')", [schoolIds[1]])), error => error.code === '42501');
    await assert.rejects(scoped(restricted, schoolIds[0], tx => tx.query(
      "INSERT INTO app.role_permissions(school_id,role_id,action_code) VALUES($1,$2,'denied')", [schoolIds[1], crypto.randomUUID()])), error => error.code === '42501');
  }
});

test('existing TEACHER role and conflict permissions retain identity and scope', async () => {
  const { config, pool } = await fixture();
  const existing = await scoped(pool, schoolIds[1], async tx => {
    const role = (await tx.query("INSERT INTO app.roles(school_id,code,label,system_role) VALUES($1,'TEACHER','Existing teacher',true) RETURNING *", [schoolIds[1]])).rows[0];
    const permission = (await tx.query("INSERT INTO app.role_permissions(school_id,role_id,action_code,allowed_scopes) VALUES($1,$2,'teacher.self',ARRAY['CLASS']::text[]) RETURNING *", [schoolIds[1], role.id])).rows[0];
    return { role, permission };
  });
  await migrate({ config });
  await scoped(pool, schoolIds[1], async tx => {
    assert.deepEqual((await tx.query("SELECT * FROM app.roles WHERE code='TEACHER'")).rows, [existing.role]);
    assert.deepEqual((await tx.query("SELECT * FROM app.role_permissions WHERE action_code='teacher.self'")).rows, [existing.permission]);
    assert.equal((await tx.query('SELECT count(*)::int AS n FROM app.role_permissions WHERE role_id=$1', [existing.role.id])).rows[0].n, 3);
  });
});

test('tenant context is restored before recording 059 and cleared on later transactions', async () => {
  const { config, pool } = await fixture();
  await pool.query(`CREATE FUNCTION public.migration_context_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.version='${version}' AND current_setting('app.school_id',true) IS DISTINCT FROM '${schoolIds[0]}' THEN
      RAISE EXCEPTION 'tenant context was not restored'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER migration_context_fixture BEFORE INSERT ON public.schema_migrations FOR EACH ROW EXECUTE FUNCTION public.migration_context_fixture()`);
  await migrate({ config: { ...config, options: '-c app.school_id=' + schoolIds[0] } });
  await assertUpgrade(pool);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM app.roles')).rows[0].n, 0);
});
