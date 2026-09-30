import 'reflect-metadata';
import { Pool } from 'pg';
import { migrate } from './database/migrate';
import { verifyInstallation } from './database/verify';
import { databaseConfig } from './common/config';
import { seedLocal } from './modules/identity/seed';
import { hashPassword } from './common/security';
import { roleTemplates } from './common/contract';

async function passwordStdin() {
  if (!process.argv.includes('--password-stdin')) throw new Error('--password-stdin required');
  let value = '';
  for await (const chunk of process.stdin) { value += String(chunk); if (value.length>1024) throw new Error('Password input too long'); }
  value=value.replace(/[\r\n]+$/,'');
  if (value.length<12 || value.length>256) throw new Error('Password must contain 12..256 characters');
  return value;
}
async function main() {
  const command=process.argv[2];
  if (command==='migrate') return migrate();
  if (command==='verify-installation') {
    const pool=new Pool(databaseConfig());
    try { return await verifyInstallation(pool,process.env.STORAGE_ROOT); } finally { await pool.end(); }
  }
  if (command==='seed-local') {
    if (!process.argv.includes('--confirm-local')) throw new Error('--confirm-local required');
    return seedLocal(await passwordStdin());
  }
  if (command==='bootstrap-admin') {
    const email=process.argv[process.argv.indexOf('--email')+1];
    if (!process.argv.includes('--email') || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('--email required');
    const hash=await hashPassword(await passwordStdin());
    const pool=new Pool(databaseConfig('migrator')),tx=await pool.connect();
    try {
      await tx.query('BEGIN');await tx.query('SELECT pg_advisory_xact_lock(18763,3)');
      if ((await tx.query('SELECT id FROM platform.operator_grants LIMIT 1')).rowCount) throw new Error('Platform admin already exists');
      const user=(await tx.query<{id:string}>(`INSERT INTO identity.users(email_normalized,display_name,password_hash,status,email_verified_at)
        VALUES($1,'Quản trị nền tảng',$2,'ACTIVE',now()) RETURNING id`,[email.toLowerCase(),hash])).rows[0]!;
      for (const action of roleTemplates.find(role=>role.code==='PLATFORM_OPERATOR')!.actions) await tx.query(
        'INSERT INTO platform.operator_grants(user_id,action_code) VALUES($1,$2)',[user.id,action]);
      await tx.query('COMMIT');return {status:'CREATED',email};
    } catch(e) {await tx.query('ROLLBACK');throw e;} finally {tx.release();await pool.end();}
  }
  throw new Error('Unknown CLI command');
}
main().then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{
  // Deliberately no stack/connection string/password in operational output.
  const message=error instanceof Error ? error.message : 'CLI_FAILED';
  process.stderr.write(JSON.stringify({status:'FAILED',code:message.startsWith('Migration')?message:'CLI_FAILED'})+'\n');
  process.exitCode=1;
});
