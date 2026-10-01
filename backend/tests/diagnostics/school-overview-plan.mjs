import {Database} from '../../dist/database/database.js';
import {Permissions} from '../../dist/common/permissions.js';
import {DashboardsService} from '../../dist/modules/dashboards/dashboards.service.js';
import {seedId} from '../../dist/modules/identity/seed.js';
import {operations} from '../../dist/common/contract.js';
import {createHash} from 'node:crypto';

// Read-only diagnostic against the retained synthetic seed namespace. This is
// query evidence, not an HTTP test or the release load/latency acceptance drill.
if(process.env.APP_ENV!=='test'||process.env.DB_NAME!=='edumanage_test_local')throw new Error('Dedicated test database required');
const db=new Database(),transaction=db.transaction.bind(db),service=new DashboardsService(db,new Permissions(db));
let jit='on',materialized=false;
db.transaction=(work,context)=>transaction(async tx=>{
  const query=tx.query.bind(tx);await query(`SET LOCAL jit='${jit}'`);
  tx.query=async(sql,values)=>{
    if(typeof sql==='string'&&sql.startsWith('WITH data AS')&&sql.includes('tasks AS MATERIALIZED')){
      const selected=materialized?sql.replace('WITH data AS (','WITH data AS MATERIALIZED ('):sql;
      const effectiveJit=(await query('SHOW jit')).rows[0].jit,plan=(await query('EXPLAIN (FORMAT JSON) '+selected,values)).rows[0]['QUERY PLAN'][0];
      console.log(JSON.stringify({kind:'school-class-preview-plan',jit,effectiveJit,materialized,cost:plan.Plan['Total Cost'],rows:plan.Plan['Plan Rows'],jitPlan:plan.JIT??null}));
      const start=performance.now();try{const result=await query(selected,values);console.log(JSON.stringify({kind:'school-class-preview-execution',jit,materialized,ms:performance.now()-start,rowCount:result.rowCount,rowHash:createHash('sha256').update(JSON.stringify(result.rows)).digest('hex')}));return result;}
      catch(error){console.log(JSON.stringify({kind:'school-class-preview-execution',jit,materialized,ms:performance.now()-start,errorCode:error.code}));throw error;}
    }
    return query(sql,values);
  };
  try{const result=await work(tx);console.log(JSON.stringify({kind:'jit-restoration',jit,after:(await query('SHOW jit')).rows[0].jit}));return result;}finally{tx.query=query;}
},{...context,readOnly:true});
const context={principal:{userId:seedId('user:admin-a')},params:{schoolId:seedId('school:A')},query:{yearId:seedId('year:A')},operation:operations.find(o=>o.id==='getSchoolOverview')};
try{for(const mode of [['on',false],['on',true],['off',true],['off',true]]){[jit,materialized]=mode;const started=performance.now();try{await service.handlers().getSchoolOverview(context);console.log(JSON.stringify({kind:'school-overview-diagnostic',jit,materialized,ms:performance.now()-started,result:'completed'}));}catch(error){console.log(JSON.stringify({kind:'school-overview-diagnostic',jit,materialized,ms:performance.now()-started,errorCode:error.code??error.constructor.name}));}}}
finally{await db.onApplicationShutdown();}
