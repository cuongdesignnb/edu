import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Pool } from 'pg';
export async function verifyInstallation(pool: Pool, storageRoot?: string) {
  const files = (await fs.readdir(path.resolve(__dirname, '../../migrations'))).filter(f => /^\d{3}-.*\.sql$/.test(f)).sort();
  const rows = (await pool.query<{ version: string; checksum: string }>('SELECT version,checksum FROM public.schema_migrations ORDER BY version')).rows;
  if (files.length !== rows.length) throw new Error('SCHEMA_REVISION_MISMATCH');
  for (let i=0;i<files.length;i++) {
    const file = files[i]!;
    const hash = crypto.createHash('sha256').update(await fs.readFile(path.resolve(__dirname,'../../migrations',file))).digest('hex');
    if (rows[i]?.version !== file || rows[i]?.checksum !== hash) throw new Error('SCHEMA_CHECKSUM_MISMATCH');
  }
  const unsafe = (await pool.query(`SELECT rolname FROM pg_roles WHERE rolname=ANY($1)
    AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)`,
  [['edu_app','edu_parent','edu_worker','edu_migrator']])).rows;
  if (unsafe.length) throw new Error('UNSAFE_DATABASE_ROLE');
  const missing = (await pool.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='app' AND c.relkind='r' AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)`)).rows;
  if (missing.length) throw new Error('MISSING_FORCE_RLS');
  const vi = (await pool.query<{stable:boolean}>(`SELECT c.collprovider='i' AND NOT c.collisdeterministic
    AND c.collversion=pg_collation_actual_version(c.oid) AS stable FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace
    WHERE n.nspname='app' AND c.collname='vi_names'`)).rows[0];
  if (!vi?.stable) throw new Error('SCHEMA_COLLATION_MISMATCH');
  if (storageRoot) {
    await fs.mkdir(storageRoot, { recursive: true, mode: 0o700 });
    const probe = path.join(storageRoot,`.ready-${crypto.randomUUID()}`);
    await fs.writeFile(probe,'', {flag:'wx',mode:0o600});
    await fs.unlink(probe);
  }
  return { schemaRevision: files.at(-1), migrations: files.length, rolesSafe: true, forceRls: true };
}
