import 'reflect-metadata';
import fs from 'node:fs/promises';
import { runtimeConfig } from './common/config';
import { WorkerRunner } from './workers/runner';
async function main(){
  runtimeConfig();const runner=new WorkerRunner();let stopping=false;
  for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{stopping=true;});
  while(!stopping){
    try{await runner.processOnce();await fs.writeFile('/tmp/worker-heartbeat',new Date().toISOString());}
    catch{process.stderr.write('{"event":"worker_dependency_error"}\n');}
    await new Promise<void>(resolve=>setTimeout(resolve,1000));
  }
  await runner.close();
}
if(require.main===module)main().catch(()=>{process.stderr.write('{"event":"worker_startup_failed"}\n');process.exitCode=1;});
