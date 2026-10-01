import {performance} from 'node:perf_hooks';
import {Database} from '/srv/api/dist/database/database.js';
import {listResource} from '/srv/api/dist/database/resources.js';
import {schoolListResource} from '/srv/api/dist/modules/platform/platform-data.js';
import {seedId} from '/srv/api/dist/modules/identity/seed.js';
if(process.env.APP_ENV!=='test'||process.env.DB_NAME!=='edumanage_test_local')throw new Error('Only the isolated EduManage synthetic test database is permitted');
const db=new Database(),userId=seedId('user:operator');let checkpoint='start',started=performance.now();
try{
 const result=await db.transaction(async tx=>{
  const originalJit=(await tx.query('SHOW jit')).rows[0].jit,statementTimeout=(await tx.query('SHOW statement_timeout')).rows[0].statement_timeout;
  const source=(await tx.query("SELECT regexp_replace(code,'-[0-2]$','') AS prefix FROM platform.schools WHERE code LIKE 'NULL-PAGE-%' ORDER BY created_at DESC,id LIMIT 1")).rows[0];if(!source)throw new Error('Required retained nullable-keyset fixture is absent');
  const schools=Number((await tx.query('SELECT count(*)::int AS total FROM platform.schools')).rows[0].total);let cursor,total,times=[],seen=[];
  do{checkpoint='searched-page-'+(times.length+1);const at=performance.now(),page=await listResource(tx,schoolListResource,null,{q:source.prefix,sort:'level',limit:'1',...(cursor?{cursor}:{})},undefined,userId);times.push(performance.now()-at);total=page.page.total;seen.push(...page.data.map(value=>value.id));cursor=page.page.nextCursor;if(times.length>3)throw new Error('Unexpected nullable-keyset fixture size');}while(cursor);
  if(total!==3||seen.length!==3||new Set(seen).size!==3)throw new Error('The actual nullable school cohort was not retained');
  return {originalJit,statementTimeout,schools,total,pageMs:times,minimalSearchedCount:!!schoolListResource.searchedCountTable};
 },{userId,readOnly:true});console.log(JSON.stringify({kind:'platform-search-read-only-diagnostic',...result}));
}catch(error){console.log(JSON.stringify({kind:'platform-search-read-only-diagnostic',checkpoint,errorCode:error.code??null,elapsedMs:performance.now()-started}));process.exitCode=1;}
finally{console.log(JSON.stringify({kind:'platform-search-read-only-diagnostic',restoredJit:(await db.app.query('SHOW jit')).rows[0].jit,statementTimeout:(await db.app.query('SHOW statement_timeout')).rows[0].statement_timeout}));await db.onApplicationShutdown();}
