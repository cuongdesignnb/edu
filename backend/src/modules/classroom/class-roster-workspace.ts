import {Database,one,type Row,type Transaction} from '../../database/database';
import {Permissions,grantAllows,type Grant} from '../../common/permissions';
import {Problem,notFound,validation} from '../../common/problem';
import type {RequestContext} from '../../api.router';

const bounded=<T>(rows:T[],limit:number)=>{if(rows.length>limit)throw new Problem(422,'CLASS_ROSTER_LIMIT');return rows;};
type Context={schoolId:string;yearId:string;classId:string;today:string;referenceDate:string;classVersion:number;startsOn:string;endsOn:string;readOnly:boolean;grants:Grant[]};
const allows=(ctx:Context,action:string,date=ctx.referenceDate,subject=false)=>ctx.grants.some(g=>grantAllows(g,action,{schoolId:ctx.schoolId,yearId:ctx.yearId,classId:ctx.classId,date,allowSubject:subject},ctx.today));
async function context(tx:Transaction,policy:Permissions,c:RequestContext){
 const schoolId=c.params.schoolId!,yearId=c.params.yearId!,classId=c.params.classId!;
 const access=await policy.require(tx,c.principal!,'class.read',{schoolId,yearId,classId,allowSubject:true});
 const row=await one<Row>(tx,`SELECT cl.version,cl.status,y.status AS year_status,y.starts_on,y.ends_on,
  greatest(y.starts_on,least($4::date,y.ends_on-1))::text AS reference_date FROM app.classes cl
  JOIN app.academic_years y ON y.school_id=cl.school_id AND y.id=cl.year_id
  WHERE cl.school_id=$1 AND cl.id=$2 AND cl.year_id=$3`,[schoolId,classId,yearId,access.today]);
 if(!row)notFound();
 const referenceDate=c.query.onDate??String(row.reference_date);
 if(referenceDate<String(row.starts_on)||referenceDate>=String(row.ends_on))validation('onDate','Ngày ngoài năm học');
 await policy.require(tx,c.principal!,'student.read',{schoolId,yearId,classId,date:referenceDate,allowSubject:true});
 return {schoolId,yearId,classId,...access,referenceDate,classVersion:Number(row.version),startsOn:String(row.starts_on),endsOn:String(row.ends_on),readOnly:row.status==='ARCHIVED'||row.year_status==='ARCHIVED'};
}

/** Exact class/date snapshot. Family and link facts require independent current authority and current enrollment. */
export async function classRosterWorkspace(db:Database,policy:Permissions,c:RequestContext){
 return db.transaction(async tx=>{
  if(Object.keys(c.query).some(k=>!['q','groupId','linkStatus','onDate'].includes(k)))throw new Problem(422,'INVALID_QUERY');
  const ctx=await context(tx,policy,c),{schoolId,yearId,classId,referenceDate,today}=ctx;
  const canChange=!ctx.readOnly&&today>=ctx.startsOn&&today<ctx.endsOn;
  const seeGuardians=allows(ctx,'guardian.read',today),seeLinks=allows(ctx,'parent_access.issue',today)||allows(ctx,'parent_access.manage',today);
  if(c.query.linkStatus&&!seeLinks)throw new Problem(403,'FORBIDDEN');
  const params=[schoolId,classId,yearId,referenceDate,today,seeGuardians,seeLinks];
  const groups=bounded((await tx.query<Row>('SELECT id,name,sort_order FROM app.class_groups WHERE school_id=$1 AND class_id=$2 ORDER BY sort_order,id LIMIT 101',params.slice(0,2))).rows,100);
  if(c.query.groupId&&c.query.groupId!=='none'&&!groups.some(g=>g.id===c.query.groupId))notFound();
  const rows=bounded((await tx.query<Row>(`SELECT s.id,s.student_code,s.full_name,s.gender,e.id AS enrollment_id,e.version AS enrollment_version,e.starts_on,
   (SELECT gm.group_id FROM app.group_memberships gm WHERE gm.school_id=e.school_id AND gm.class_id=e.class_id AND gm.enrollment_id=e.id
     AND gm.cancelled_at IS NULL AND gm.starts_on<=$4::date AND gm.ends_on>$4::date) AS group_id,
   ARRAY(SELECT p.name FROM app.position_assignments a JOIN app.class_positions p ON p.school_id=a.school_id AND p.id=a.position_id
     WHERE a.school_id=e.school_id AND a.class_id=e.class_id AND a.enrollment_id=e.id AND a.cancelled_at IS NULL
     AND a.starts_on<=$4::date AND a.ends_on>$4::date ORDER BY p.code,p.id,a.id LIMIT 501) AS positions,
   EXISTS(SELECT 1 FROM app.enrollments old WHERE old.school_id=e.school_id AND old.student_id=e.student_id AND old.year_id=e.year_id
     AND old.class_id<>e.class_id AND old.status<>'CANCELLED' AND old.starts_on<e.starts_on AND old.ends_on<=e.starts_on) AS transferred_in,
   (e.starts_on<=$5::date AND (e.ends_on IS NULL OR e.ends_on>$5::date)) AS current_enrollment,
   CASE WHEN $6::boolean AND e.starts_on<=$5::date AND (e.ends_on IS NULL OR e.ends_on>$5::date) THEN
    (SELECT jsonb_build_object('name',g.full_name,'relation',gr.relationship_label,'verification',gr.status)
     FROM app.guardian_relationships gr JOIN app.guardians g ON g.school_id=gr.school_id AND g.id=gr.guardian_id
     WHERE gr.school_id=e.school_id AND gr.student_id=e.student_id AND gr.status<>'REVOKED' AND gr.revoked_at IS NULL AND g.status='ACTIVE'
     ORDER BY gr.is_primary DESC,gr.created_at,gr.id LIMIT 1) END AS guardian,
   CASE WHEN $7::boolean AND e.starts_on<=$5::date AND (e.ends_on IS NULL OR e.ends_on>$5::date) THEN
    CASE WHEN EXISTS(SELECT 1 FROM app.parent_access_links l JOIN app.guardian_relationships gr ON gr.school_id=l.school_id AND gr.id=l.relationship_id
      WHERE l.school_id=e.school_id AND l.student_id=e.student_id AND l.year_id=e.year_id AND l.revoked_at IS NULL AND l.expires_at>now()
      AND gr.status='VERIFIED' AND gr.can_receive_info AND gr.revoked_at IS NULL AND EXISTS(SELECT 1 FROM app.parent_access_events ev
       WHERE ev.school_id=l.school_id AND ev.access_link_id=l.id AND ev.event_kind IN ('EXCHANGED','READ'))) THEN 'opened'
     WHEN EXISTS(SELECT 1 FROM app.parent_access_links l JOIN app.guardian_relationships gr ON gr.school_id=l.school_id AND gr.id=l.relationship_id
      WHERE l.school_id=e.school_id AND l.student_id=e.student_id AND l.year_id=e.year_id AND l.revoked_at IS NULL AND l.expires_at>now()
      AND gr.status='VERIFIED' AND gr.can_receive_info AND gr.revoked_at IS NULL) THEN 'issued'
     WHEN EXISTS(SELECT 1 FROM app.parent_access_links l WHERE l.school_id=e.school_id AND l.student_id=e.student_id AND l.year_id=e.year_id AND l.revoked_at IS NOT NULL) THEN 'revoked'
     ELSE 'none' END END AS link_status
   FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id
   WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED' AND e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date)
   ORDER BY regexp_replace(btrim(s.full_name),'^.*[[:space:]]','') COLLATE app.vi_names,s.full_name COLLATE app.vi_names,s.id,e.id LIMIT 5001`,params)).rows,5000);
  const students=rows.map((r,index)=>{
   const positions=r.positions as string[];bounded(positions,500);
   return {id:r.id,studentCode:r.student_code,fullName:r.full_name,gender:r.gender,enrollmentId:r.enrollment_id,enrollmentVersion:r.enrollment_version,startsOn:r.starts_on,
    ordinal:index+1,groupId:r.group_id??null,groupName:groups.find(g=>g.id===r.group_id)?.name??null,positions,transferredIn:r.transferred_in,
    currentEnrollment:r.current_enrollment,guardian:r.guardian??null,linkStatus:r.link_status??null};
  });
  const left=bounded((await tx.query<Row>(`SELECT e.id AS enrollment_id,s.id,s.student_code,s.full_name,e.ends_on,
   (SELECT r.reason FROM app.transfer_requests r WHERE r.school_id=e.school_id AND r.from_enrollment_id=e.id AND r.status='APPLIED' ORDER BY r.updated_at DESC,r.id DESC LIMIT 1) AS end_reason FROM app.enrollments e
   JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3
   AND e.status<>'CANCELLED' AND e.ends_on<=$4::date ORDER BY e.ends_on DESC,e.id DESC LIMIT 2001`,params.slice(0,4))).rows,2000);
  const folded=c.query.q?(await one<{q:string}>(tx,'SELECT app.fold_vi(btrim($1)) AS q',[c.query.q]))!.q:null;
  // Search values are folded by PostgreSQL; only this exact authorized class snapshot is matched.
  let matches=new Set(students.map(s=>String(s.id)));
  if(folded){const ids=(await tx.query<{id:string}>(`SELECT id FROM app.students WHERE school_id=$1 AND id=ANY($2::uuid[])
    AND (app.fold_vi(full_name) LIKE $3 ESCAPE '\\' OR app.fold_vi(student_code) LIKE $3 ESCAPE '\\')`,[schoolId,[...matches],'%'+folded.replace(/[\\%_]/g,'\\$&')+'%'])).rows;matches=new Set(ids.map(r=>r.id));}
  const filtered=students.filter(s=>matches.has(String(s.id))&&(!c.query.groupId||(c.query.groupId==='none'?s.groupId===null:s.groupId===c.query.groupId))&&(!c.query.linkStatus||s.linkStatus===c.query.linkStatus));
  return {data:{schoolId,yearId,classId,today,referenceDate,classVersion:ctx.classVersion,readOnly:ctx.readOnly,seeGuardians,seeLinks,
   canAdd:canChange&&allows(ctx,'student.manage',today),
   canTransfer:canChange&&allows(ctx,'student.transfer.request',today),canGroups:canChange&&allows(ctx,'group.manage',today),canReadGroups:allows(ctx,'group.manage'),
   canSeating:allows(ctx,'seating.manage'),groups:groups.map(g=>({id:g.id,name:g.name})),total:students.length,rows:filtered,
   leftRecently:left.map(r=>({id:r.id,enrollmentId:r.enrollment_id,fullName:r.full_name,studentCode:r.student_code,endsOn:r.ends_on,reason:r.end_reason??null})),
   linkSummary:seeLinks?{total:students.filter(s=>s.currentEnrollment).length,withLink:students.filter(s=>['issued','opened'].includes(String(s.linkStatus))).length,opened:students.filter(s=>s.linkStatus==='opened').length}:null}};
 },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});
}

/** Transfer requests disclose only dated eligible source pupils and minimal target-class counts. */
export async function classTransferOptions(db:Database,policy:Permissions,c:RequestContext){
 return db.transaction(async tx=>{
  if(Object.keys(c.query).some(k=>k!=='onDate'))throw new Problem(422,'INVALID_QUERY');
  const ctx=await context(tx,policy,c),{schoolId,yearId,classId,today,referenceDate}=ctx;
  await policy.require(tx,c.principal!,'student.transfer.request',{schoolId,yearId,classId,date:referenceDate});
  if(ctx.readOnly||referenceDate<today)throw new Problem(409,'CLASS_READ_ONLY');
  const students=bounded((await tx.query<Row>(`SELECT s.id,s.full_name,s.student_code,e.id AS enrollment_id,e.version,e.starts_on,e.ends_on
   FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id
   WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED' AND e.starts_on<$4::date
   AND (e.ends_on IS NULL OR e.ends_on>$4::date) ORDER BY s.full_name COLLATE app.vi_names,s.id LIMIT 5001`,[schoolId,classId,yearId,referenceDate])).rows,5000);
  const targets=bounded((await tx.query<Row>(`SELECT c.id,c.name,c.capacity,(SELECT count(*)::int FROM app.enrollments e WHERE e.school_id=c.school_id AND e.class_id=c.id
   AND e.year_id=c.year_id AND e.status<>'CANCELLED' AND e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date)) AS size
   FROM app.classes c WHERE c.school_id=$1 AND c.year_id=$3 AND c.id<>$2 AND c.status='ACTIVE' ORDER BY c.name COLLATE app.vi_names,c.id LIMIT 501`,[schoolId,classId,yearId,referenceDate])).rows,500);
  return {data:{schoolId,yearId,classId,today,referenceDate,startsOn:ctx.startsOn,endsOn:ctx.endsOn,
   students:students.map(s=>({id:s.id,fullName:s.full_name,studentCode:s.student_code,enrollmentId:s.enrollment_id,enrollmentVersion:s.version,startsOn:s.starts_on,endsOn:s.ends_on??null})),
   targets:targets.map(r=>({id:r.id,name:r.name,size:r.size,capacity:r.capacity??null}))}};
 },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});
}
