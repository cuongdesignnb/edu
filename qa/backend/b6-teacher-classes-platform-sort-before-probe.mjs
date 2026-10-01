import {performance} from 'node:perf_hooks';
import {Database} from '/srv/api/dist/database/database.js';
import {listResource} from '/srv/api/dist/database/resources.js';
import {schoolListResource} from '/srv/api/dist/modules/platform/platform-data.js';
import {seedId} from '/srv/api/dist/modules/identity/seed.js';
const db=new Database(),userId=seedId('user:operator');
try{
 for(const sort of ['classCount','staffCount']){
  const started=performance.now();
  try{const result=await db.transaction(async tx=>{
   const jit=(await tx.query('SHOW jit')).rows[0].jit,statementTimeout=(await tx.query('SHOW statement_timeout')).rows[0].statement_timeout;
   const schools=(await tx.query('SELECT count(*)::int AS n FROM platform.schools')).rows[0].n;
   const page=await listResource(tx,schoolListResource,null,{limit:'2',sort,dir:'desc'},undefined,userId);
   return {jit,statementTimeout,schools,total:page.page.total,rows:page.data.length,counts:page.data.map(v=>v[sort])};
  },{userId,readOnly:true});console.log(JSON.stringify({kind:'individual-sort-diagnostic-not-release-benchmark',sort,elapsedMs:performance.now()-started,...result}));}
  catch(error){console.log(JSON.stringify({kind:'individual-sort-diagnostic-not-release-benchmark',sort,elapsedMs:performance.now()-started,errorCode:error.code??null}));}
 }
}finally{await db.onApplicationShutdown();}
