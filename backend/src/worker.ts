import 'reflect-metadata';
import fs from 'node:fs/promises';
import { Pool } from 'pg';
import { databaseConfig,runtimeConfig } from './common/config';
// The mail/outbox domain handlers are added in B5. No job is acknowledged here.
async function main(){
  runtimeConfig();const pool=new Pool(databaseConfig('worker'));let stopping=false;
  for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{stopping=true;});
  while(!stopping){
    try{await pool.query('SELECT 1');await fs.writeFile('/tmp/worker-heartbeat',new Date().toISOString());}
    catch{process.stderr.write('{"event":"worker_dependency_error"}\n');}
    await new Promise<void>(resolve=>setTimeout(resolve,1000));
  }
  await pool.end();
}
if(require.main===module)main().catch(()=>{process.stderr.write('{"event":"worker_startup_failed"}\n');process.exitCode=1;});
