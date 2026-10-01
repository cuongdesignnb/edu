import {performance} from 'node:perf_hooks';
import {Database} from '/srv/api/dist/database/database.js';
import {listResource} from '/srv/api/dist/database/resources.js';
import {schoolListResource} from '/srv/api/dist/modules/platform/platform-data.js';
import {seedId} from '/srv/api/dist/modules/identity/seed.js';
if(process.env.APP_ENV!=='test'||process.env.DB_NAME!=='edumanage_test_local')throw new Error('Only the explicitly isolated synthetic test database is permitted');
const db=new Database(),userId=seedId('user:operator');
try{
 for(const jit of ['on','off']){
  let checkpoint='start';const started=performance.now();
  try{const result=await db.transaction(async tx=>{
   const original=(await tx.query('SHOW jit')).rows[0].jit,timeout=(await tx.query('SHOW statement_timeout')).rows[0].statement_timeout;
   await tx.query("SELECT set_config('jit',$1,true)",[jit]);checkpoint='first-page';let at=performance.now();
   const first=await listResource(tx,schoolListResource,null,{limit:'1'},undefined,userId),firstMs=performance.now()-at;
   checkpoint='second-page';at=performance.now();const second=await listResource(tx,schoolListResource,null,{limit:'1',cursor:first.page.nextCursor},undefined,userId),secondMs=performance.now()-at;
   checkpoint='explain-count';const countTable=schoolListResource.unsearchedCountTable??schoolListResource.table;
   const plan=(await tx.query(`EXPLAIN(ANALYZE,FORMAT JSON) SELECT count(*) FROM ${countTable} t WHERE $1::uuid IS NULL`,[null])).rows[0]['QUERY PLAN'][0];
   return {originalJit:original,statementTimeout:timeout,firstMs,secondMs,firstRows:first.data.length,secondRows:second.data.length,total:first.page.total,minimalBaseCount:!!schoolListResource.unsearchedCountTable,countExecutionMs:plan['Execution Time'],countTotalCost:plan.Plan['Total Cost'],countJit:plan.JIT??null};
  },{userId,readOnly:true});console.log(JSON.stringify({kind:'platform-list-read-only-diagnostic',jit,...result}));}
  catch(error){console.log(JSON.stringify({kind:'platform-list-read-only-diagnostic',jit,checkpoint,errorCode:error.code??null,elapsedMs:performance.now()-started}));process.exitCode=1;}
 }
 console.log(JSON.stringify({kind:'platform-list-read-only-diagnostic',restoredJit:(await db.app.query('SHOW jit')).rows[0].jit,statementTimeout:(await db.app.query('SHOW statement_timeout')).rows[0].statement_timeout}));
}finally{await db.onApplicationShutdown();}
