import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';

const root=path.resolve(import.meta.dirname,'..'),qa=path.join(root,'qa/backend'),port=18763;
const evidence={kind:'BROWSER_CONTRACT_INTERCEPTED_API_NOT_POSTGRES_E2E',startedAt:new Date().toISOString(),host:'127.0.0.1',port};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function portFree(){
  return new Promise(resolve=>{
    const probe=net.createServer();probe.once('error',()=>resolve(false));
    probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(true)));
  });
}
function launch(args,logPath){
  const log=createWriteStream(logPath),child=spawn(process.execPath,args,{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true});
  const tracked={child,closed:false,error:null};child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
  child.once('error',error=>{tracked.error=error;});
  tracked.finished=new Promise(resolve=>child.once('close',(code,signal)=>{tracked.closed=true;log.end();resolve({code,signal});}));
  return tracked;
}
let server=null,code=1;
try{
  await fs.mkdir(qa,{recursive:true});evidence.portFreeBefore=await portFree();
  if(!evidence.portFreeBefore)throw new Error('Port 18763 is occupied. No process has been stopped or replaced.');
  server=launch(['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],path.join(qa,'b6-native-activation-browser-server-final.log'));
  evidence.ownedNextPid=server.child.pid;
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
    if(server.closed||server.error)throw new Error('The owned QA server failed to start.');
    try{const response=await fetch(`http://127.0.0.1:${port}/login`,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{/* Startup is bounded and checked again. */}
    await delay(200);
  }
  if(!ready)throw new Error('The owned QA server did not become ready.');
  const runner=launch(['node_modules/@playwright/test/cli.js','test','--config','playwright.native.config.ts'],path.join(qa,'b6-native-activation-browser-final.log'));
  const result=await runner.finished;evidence.playwrightExitCode=result.code;code=result.code??1;
}catch(error){evidence.error=error.message;code=1;}
finally{
  if(server&&!server.closed){
    evidence.ownedNextTerminationRequested=server.child.kill();
    let timeout;
    const result=await Promise.race([server.finished,new Promise(resolve=>{timeout=setTimeout(()=>resolve(null),10_000);})]);
    clearTimeout(timeout);
    evidence.ownedNextClosed=server.closed;evidence.ownedNextExit=result;
    if(!server.closed)code=1;
  }
  evidence.portFreeAfter=await portFree();if(server&&!evidence.portFreeAfter)code=1;
  evidence.finishedAt=new Date().toISOString();evidence.exitCode=code;
  await fs.writeFile(path.join(qa,'b6-native-activation-browser-run.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));process.exitCode=code;
}
