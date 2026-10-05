import { Database,iso,type Transaction } from '../../database/database';
import { Permissions } from '../../common/permissions';
import { Problem } from '../../common/problem';
import type { Handler,RequestContext } from '../../api.router';

const keys=['platform-overview','school-overview','teacher-overview','class-homeroom','class-subject','class-staff'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Progress={tour_key:string;tour_version:number;status:string;updated_at:Date};
const dto=(r:Progress)=>({tourKey:r.tour_key,tourVersion:r.tour_version,status:r.status,updatedAt:iso(r.updated_at)});
/** Personal preferences use the authenticated owner and a monotonic, atomic upsert. */
export function onboardingHandlers(db:Database,policy:Permissions):Record<string,Handler>{
 const handle:Handler=async(c:RequestContext)=>{
  const write=c.operation.id==='putMyOnboarding',schoolId=write?c.body.schoolId:c.query.schoolId??null;
  if(schoolId!==null&&(typeof schoolId!=='string'||!uuid.test(schoolId)))throw new Problem(422,'VALIDATION_ERROR');
  if(Object.keys(c.query).some(k=>k!=='schoolId'))throw new Problem(422,'VALIDATION_ERROR');
  const tourKey=c.params.tourKey,scopeKey=schoolId?'SCHOOL:'+String(schoolId).toLowerCase():'PLATFORM';
  if(write&&(!keys.includes(tourKey!)||c.body.tourVersion!==1||(tourKey==='platform-overview')!==!schoolId))throw new Problem(422,'VALIDATION_ERROR');
  return db.transaction(async(tx:Transaction)=>{
   if(!schoolId){const permitted=await tx.query(`SELECT id FROM platform.operator_grants WHERE user_id=$1 AND revoked_at IS NULL AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) LIMIT 1`,[c.principal!.userId]);if(!permitted.rowCount)throw new Problem(403,'FORBIDDEN');}
   else {
    const membership=await tx.query(`SELECT m.id FROM app.memberships m JOIN platform.schools s ON s.id=m.school_id
      WHERE m.school_id=$1 AND m.user_id=$2 AND m.status='ACTIVE' AND m.ended_at IS NULL AND s.status='ACTIVE'`,[schoolId,c.principal!.userId]);
    if(!membership.rowCount)throw new Problem(404,'RESOURCE_NOT_FOUND');
    if(write){
     if(tourKey==='school-overview')await policy.require(tx,c.principal!,'school.read',{schoolId:schoolId as string});
     else if(tourKey==='teacher-overview')await policy.require(tx,c.principal!,'teacher.self',{schoolId:schoolId as string,allowScopedContext:true,allowSubject:true});
     else {
      const permitted=await policy.collection(tx,c.principal!,'class.read',schoolId as string,true);
      if(!permitted.all&&!permitted.classIds.length)throw new Problem(403,'FORBIDDEN');
      if(tourKey==='class-homeroom'&&!permitted.grants.some(g=>g.role_code==='HOMEROOM'&&permitted.classIds.includes(g.class_id!)))throw new Problem(403,'FORBIDDEN');
      if(tourKey==='class-subject'&&!permitted.grants.some(g=>g.role_code==='SUBJECT_TEACHER'&&permitted.classIds.includes(g.class_id!)))throw new Problem(403,'FORBIDDEN');
     }
    }
   }
   if(!write){const rows=await tx.query<Progress>('SELECT tour_key,tour_version,status,updated_at FROM identity.onboarding_progress WHERE user_id=$1 AND scope_key=$2 ORDER BY tour_key,tour_version',[c.principal!.userId,scopeKey]);return {data:{progress:rows.rows.map(dto)}};}
   const saved=await tx.query<Progress>(`INSERT INTO identity.onboarding_progress(user_id,school_id,scope_key,tour_key,tour_version,status)
     VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,scope_key,tour_key,tour_version) DO UPDATE
     SET status=CASE WHEN onboarding_progress.status='completed' THEN 'completed' ELSE EXCLUDED.status END,
         updated_at=CASE WHEN onboarding_progress.status='completed' OR onboarding_progress.status=EXCLUDED.status THEN onboarding_progress.updated_at ELSE now() END
     RETURNING tour_key,tour_version,status,updated_at`,[c.principal!.userId,schoolId,scopeKey,tourKey,1,c.body.status]);
   return {data:dto(saved.rows[0]!)};
  },{userId:c.principal!.userId,schoolId:schoolId as string|undefined,readOnly:!write});
 };
 return {getMyOnboarding:handle,putMyOnboarding:handle};
}
