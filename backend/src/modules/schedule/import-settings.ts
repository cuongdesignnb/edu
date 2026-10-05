import {one,type Row,type Transaction,type Database} from '../../database/database';
import type {Permissions} from '../../common/permissions';
import {audit,type Commands} from '../../common/commands';
import {validation} from '../../common/problem';
import type {RequestContext} from '../../api.router';
export async function scheduleImportSettings(db:Database,policy:Permissions,commands:Commands,c:RequestContext){
 const schoolId=c.params.schoolId!,write=c.operation.method!=='GET';
 const authorize=(tx:Transaction)=>policy.require(tx,c.principal!,write?'school.settings':'school.read',{schoolId,allowScopedContext:!write,allowSubject:!write});
 const work=async(tx:Transaction)=>{
  const row=(await one<Row>(tx,'SELECT settings FROM platform.schools WHERE id=$1'+(write?' FOR UPDATE':''),[schoolId]))!;
  const settings=row.settings as Row??{},current=settings.scheduleImport as Row|undefined;
  if(write){
   for(const [kind,table]of [['subjects','subjects'],['teachers','memberships']] as const){const mapping=(c.body.aliases as Record<string,Record<string,string>>)[kind]!;
    for(const id of new Set(Object.values(mapping)))if(!await one(tx,`SELECT id FROM app.${table} WHERE school_id=$1 AND id=$2`,[schoolId,id]))validation('aliases','Ánh xạ phải thuộc trường hiện tại');
   }
   for(const [key,time] of Object.entries(c.body.periodTimes as Record<string,{start:string;end:string}>))if(!/^(morning|afternoon|unspecified):([1-9]|1[0-2])$/.test(key)||time.start>=time.end)validation('periodTimes','Khóa tiết hoặc giờ bắt đầu/kết thúc không hợp lệ');
   const next={version:Number(current?.version??0)+1,aliases:c.body.aliases,periodTimes:c.body.periodTimes};
   if(Number(current?.version??0)!==c.body.expectedVersion)validation('expectedVersion','Cấu hình đã thay đổi; tải lại trước khi lưu');
   await tx.query("UPDATE platform.schools SET settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{scheduleImport}',$2::jsonb) WHERE id=$1",[schoolId,JSON.stringify(next)]);
   await audit(tx,c,'school',schoolId,{scheduleImportVersion:next.version});return {data:next};
  }
  return {data:current??{version:0,aliases:{subjects:{},teachers:{}},periodTimes:{}}};
 };
 return write?commands.execute(c,authorize,work):db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId,userId:c.principal!.userId,readOnly:true});
}
