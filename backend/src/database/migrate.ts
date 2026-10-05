import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { Pool, type PoolConfig } from 'pg';
import { databaseConfig } from '../common/config';

const tenantCompatibilityVersion = '059-direct-school-staff.sql';
// This published migration is immutable. Only this exact historical source may
// use the compatibility path; schema_migrations still records its original hash.
const tenantCompatibilityChecksum = '5d6b104ad36b5e2774737d849eef2b428c59d6d308ba7ae79c44201ab05123c5';

export async function migrate(options: { config?: PoolConfig; directory?: string } = {}) {
  const pool = new Pool(options.config ?? databaseConfig('migrator'));
  const tx = await pool.connect();
  const directory = options.directory ?? path.resolve(__dirname, '../../migrations');
  const applied: string[] = [];
  try {
    const who = (await tx.query('SELECT current_user AS role')).rows[0] as { role: string };
    if (who.role !== 'edu_migrator') throw new Error('Migration requires edu_migrator');
    await tx.query('SELECT pg_advisory_lock(18763, 1)');
    await tx.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const files = (await fs.readdir(directory)).filter(name => /^\d{3}-[a-z0-9-]+\.sql$/.test(name)).sort();
    if (!files.length) throw new Error('No migrations found');
    const recorded = new Map((await tx.query<{ version: string; checksum: string }>(
      'SELECT version,checksum FROM public.schema_migrations')).rows.map(row => [row.version, row.checksum]));
    for (const version of recorded.keys()) if (!files.includes(version)) throw new Error(`Missing applied migration ${version}`);
    for (const filename of files) {
      const source = await fs.readFile(path.join(directory, filename), 'utf8');
      const checksum = crypto.createHash('sha256').update(source).digest('hex');
      if (filename === tenantCompatibilityVersion && checksum !== tenantCompatibilityChecksum) {
        throw new Error(`Migration checksum mismatch ${filename}`);
      }
      if (recorded.has(filename)) {
        if (recorded.get(filename) !== checksum) throw new Error(`Migration checksum mismatch ${filename}`);
        continue;
      }
      const sql = source.replace(/^\s*BEGIN\s*;/im, '').replace(/^\s*COMMIT\s*;/im, '');
      await tx.query('BEGIN');
      try {
        if (filename === tenantCompatibilityVersion) {
          const previous = (await tx.query<{ school: string | null }>(
            "SELECT current_setting('app.school_id',true) AS school")).rows[0]?.school;
          const schools = (await tx.query<{ id: string }>('SELECT id FROM platform.schools ORDER BY id')).rows;
          // Setting the tenant alone is insufficient: the historical INSERT
          // selects every school. Narrow that source as well as retaining RLS.
          const tenantSql = sql.replace('FROM platform.schools', 'FROM platform.schools WHERE id=app.tenant_id()');
          for (const school of schools) {
            await tx.query("SELECT set_config('app.school_id',$1,true)", [school.id]);
            await tx.query(tenantSql);
          }
          await tx.query("SELECT set_config('app.school_id',$1,true)", [previous ?? '']);
        } else {
          await tx.query(sql);
        }
        await tx.query('INSERT INTO public.schema_migrations(version,checksum) VALUES($1,$2)', [filename, checksum]);
        await tx.query('COMMIT');
        applied.push(filename);
      } catch (error) {
        await tx.query('ROLLBACK');
        const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'UNKNOWN';
        throw new Error(`Migration failed ${filename} (${code})`);
      }
    }
    return { applied, current: files.at(-1), total: files.length };
  } finally {
    await tx.query('SELECT pg_advisory_unlock(18763, 1)').catch(() => undefined);
    tx.release();
    await pool.end();
  }
}
