import crypto from 'node:crypto';
import {Injectable} from '@nestjs/common';
import {Database,one,type Row,type Transaction} from '../../database/database';
import {Permissions} from '../../common/permissions';
import {Commands,audit} from '../../common/commands';
import {Problem,notFound,validation} from '../../common/problem';
import {hashPassword} from '../../common/security';
import {ScheduleService} from '../schedule/schedule.service';
import {ConductService} from '../conduct/conduct.service';
import {classZalo} from './zalo-helper';
import {id,text,expected,classPortal,expireWeekly,weekSubmission} from './notebook-common';
import type {Handler,RequestContext,Result} from '../../api.router';
@Injectable()
export class NotebookService{
 constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly schedule:ScheduleService,private readonly conduct:ConductService){}
 handlers():Record<string,Handler>{return Object.fromEntries(['getClassZaloHelper','getClassNotebookWorkspace','assignClassOfficer','rotateClassOfficerPin','revokeClassOfficer','reopenClassOfficerWeek','relockClassOfficerWeek','saveClassWeekDeadline','saveClassNotebookSettings','saveClassPositionPolicy','copyClassNotebookSchedule','withdrawClassNotebookTimetable','remindClassOfficer'].map(op=>[op,(c:RequestContext)=>this.handle(c)]));}
 private async scope(tx:Transaction,c:RequestContext){
  const action=c.operation.permission,access=await this.policy.require(tx,c.principal!,action,{schoolId:c.params.schoolId!,classId:c.params.classId!});
  const cls=await one<Row>(tx,`SELECT c.*,y.starts_on,y.ends_on,y.status AS year_status,s.timezone FROM app.classes c JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id JOIN platform.schools s ON s.id=c.school_id WHERE c.school_id=$1 AND c.id=$2`,[c.params.schoolId,c.params.classId]);if(!cls)notFound();
  if(c.operation.method!=='GET'&&(cls.status==='ARCHIVED'||cls.year_status==='ARCHIVED'))throw new Problem(409,'YEAR_ARCHIVED');return {cls,...access};
 }
 private async officer(tx:Transaction,c:RequestContext){const row=await one<Row>(tx,'SELECT * FROM app.class_officer_assignments WHERE school_id=$1 AND class_id=$2 AND id=$3 FOR UPDATE',[c.params.schoolId,c.params.classId,id(c.body.assignmentId)]);if(!row)notFound();return row;}
 private async pin(tx:Transaction,c:RequestContext,row:Row){
  const pin=c.body.pin===undefined?crypto.randomBytes(9).toString('base64url'):text(c.body.pin,'pin',6,128),hash=await hashPassword(pin);
  await tx.query(`INSERT INTO identity.class_officer_credentials(school_id,assignment_id,pin_hash) VALUES($1,$2,$3) ON CONFLICT(assignment_id) DO UPDATE SET pin_hash=EXCLUDED.pin_hash,failed_attempts=0,locked_until=NULL,rotated_at=now()`,[c.params.schoolId,row.id,hash]);
  await tx.query('UPDATE identity.class_officer_sessions SET revoked_at=now() WHERE school_id=$1 AND assignment_id=$2 AND revoked_at IS NULL',[c.params.schoolId,row.id]);
  await audit(tx,c,'class-officer',String(row.id),{role:row.role,credentialRotated:true});
  const slug=await classPortal(tx,c.params.schoolId!,c.params.classId!);return {data:{id:row.id,version:row.version,pin,loginPath:'/lop/'+slug+'/nhap-lieu?assignment='+row.id}};
 }
 private async handle(c:RequestContext):Promise<Result>{
  const work=async(tx:Transaction)=>{
   const {cls,today}=await this.scope(tx,c),school=c.params.schoolId!,classId=c.params.classId!,op=c.operation.id;
   if(op==='getClassZaloHelper')return classZalo(tx,c,this.policy,cls);
   if(op==='getClassNotebookWorkspace'){
    await expireWeekly(tx,school);
    const weeks=(await tx.query<Row>('SELECT id,week_number,starts_on,ends_on,input_deadline FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 ORDER BY week_number',[school,cls.year_id])).rows;
    const weekId=c.query.weekId?id(c.query.weekId):String((weeks.find(w=>String(w.starts_on)<=today&&String(w.ends_on)>today)??weeks.at(-1))?.id??'');
    if(!weeks.some(w=>w.id===weekId))throw new Problem(409,'WEEK_UNAVAILABLE');
    const officers=(await tx.query<Row>(`SELECT a.*,st.full_name,g.name AS group_name,cr.rotated_at,cr.locked_until,cr.failed_attempts FROM app.class_officer_assignments a JOIN app.enrollments e ON e.school_id=a.school_id AND e.id=a.enrollment_id JOIN app.students st ON st.school_id=e.school_id AND st.id=e.student_id LEFT JOIN app.class_groups g ON g.school_id=a.school_id AND g.id=a.group_id LEFT JOIN identity.class_officer_credentials cr ON cr.school_id=a.school_id AND cr.assignment_id=a.id WHERE a.school_id=$1 AND a.class_id=$2 ORDER BY a.revoked_at NULLS FIRST,a.role,st.full_name`,[school,classId])).rows;
    for(const a of officers.filter(a=>!a.revoked_at&&String(a.valid_from)<=today&&(!a.valid_until||String(a.valid_until)>today)))await weekSubmission(tx,{...a,timezone:cls.timezone},weekId);
    const submissions=(await tx.query<Row>('SELECT * FROM app.class_week_submissions WHERE school_id=$1 AND class_id=$2 AND week_id=$3',[school,classId,weekId])).rows;
    const roster=(await tx.query<Row>(`SELECT e.id AS enrollment_id,st.id AS student_id,st.full_name,st.student_code FROM app.enrollments e JOIN app.students st ON st.school_id=e.school_id AND st.id=e.student_id WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4) ORDER BY st.full_name,st.id`,[school,classId,cls.year_id,today])).rows;
    const groups=(await tx.query<Row>('SELECT id,name FROM app.class_groups WHERE school_id=$1 AND class_id=$2 ORDER BY sort_order,name',[school,classId])).rows;
    const positions=(await tx.query<Row>('SELECT id,version,name,description,weekly_bonus,officer_role,group_id FROM app.class_positions WHERE school_id=$1 AND class_id=$2 ORDER BY name',[school,classId])).rows;
    const deadline=await one<Row>(tx,'SELECT * FROM app.class_week_settings WHERE school_id=$1 AND class_id=$2 AND week_id=$3',[school,classId,weekId]);
    const recentAudit=(await tx.query<Row>(`SELECT action,target_id,reason,redacted_after,created_at FROM app.audit_events WHERE school_id=$1 AND (target_id=ANY($2::uuid[]) OR redacted_after->>'classId'=$3) AND action LIKE 'weekly.%' ORDER BY created_at DESC LIMIT 100`,[school,submissions.map(s=>String(s.id)),classId])).rows;
    const terms=(await tx.query<Row>('SELECT id,name,starts_on,ends_on FROM app.terms WHERE school_id=$1 AND year_id=$2 ORDER BY starts_on',[school,cls.year_id])).rows;
    return {data:{classId,yearId:cls.year_id,className:cls.name,version:cls.version,today,settings:cls.notebook_settings,slug:(await one<Row>(tx,'SELECT slug FROM platform.public_class_portals WHERE school_id=$1 AND class_id=$2',[school,classId]))?.slug??null,weeks,weekId,roster,groups,positions,officers,submissions,deadline,recentAudit,terms}};
   }
   if(op==='assignClassOfficer'){
    const enrollment=id(c.body.enrollmentId),role=String(c.body.role),from=text(c.body.validFrom,'validFrom',10,10),until=c.body.validUntil===undefined||c.body.validUntil===null?String(cls.ends_on):text(c.body.validUntil,'validUntil',10,10);
    if(!['GROUP_LEADER','CLASS_LEADER','LABOR_VICE'].includes(role))validation('role','Chọn vai trò cán bộ lớp');
    if(from<today||from<String(cls.starts_on)||until<=from||until>String(cls.ends_on))validation('validFrom','Khoảng phân công phải nằm trong năm học và không lùi ngày');
    const e=await one<Row>(tx,"SELECT * FROM app.enrollments WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND id=$4 AND status<>'CANCELLED' AND starts_on<=$5 AND (ends_on IS NULL OR ends_on>=$6)",[school,classId,cls.year_id,enrollment,from,until]);if(!e)notFound();
    const group=role==='GROUP_LEADER'?id(c.body.groupId):null;
    if(group&&!await one(tx,'SELECT id FROM app.group_memberships WHERE school_id=$1 AND class_id=$2 AND enrollment_id=$3 AND group_id=$4 AND cancelled_at IS NULL AND starts_on<=$5 AND ends_on>=$6',[school,classId,enrollment,group,from,until]))validation('groupId','Tổ trưởng phải thuộc tổ trong cả khoảng phân công');
    if(await one(tx,`SELECT id FROM app.class_officer_assignments WHERE school_id=$1 AND class_id=$2 AND role=$3 AND revoked_at IS NULL AND daterange(valid_from,coalesce(valid_until,'infinity'::date),'[)')&&daterange($4::date,$5::date,'[)') AND ($3<>'GROUP_LEADER' OR group_id=$6)`,[school,classId,role,from,until,group]))throw new Problem(409,'OFFICER_HOLDER_CONFLICT');
    let positionAssignment:string|null=null;
    if(c.body.positionId){const pos=await one<Row>(tx,'SELECT * FROM app.class_positions WHERE school_id=$1 AND class_id=$2 AND id=$3',[school,classId,id(c.body.positionId)]);if(!pos||pos.officer_role&&pos.officer_role!==role||pos.group_id&&pos.group_id!==group)validation('positionId','Chức vụ không khớp vai trò/tổ');
     const current=await one<Row>(tx,'SELECT id FROM app.position_assignments WHERE school_id=$1 AND class_id=$2 AND position_id=$3 AND enrollment_id=$4 AND cancelled_at IS NULL AND starts_on<=$5 AND ends_on>=$6',[school,classId,pos.id,enrollment,from,until]);
     positionAssignment=String(current?.id??(await one<Row>(tx,'INSERT INTO app.position_assignments(school_id,class_id,position_id,enrollment_id,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[school,classId,pos.id,enrollment,from,until]))!.id);
    }
    const row=(await one<Row>(tx,'INSERT INTO app.class_officer_assignments(school_id,class_id,year_id,enrollment_id,group_id,position_assignment_id,role,valid_from,valid_until,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[school,classId,cls.year_id,enrollment,group,positionAssignment,role,from,until,c.principal!.userId]))!;
    return this.pin(tx,c,row);
   }
   if(op==='rotateClassOfficerPin'||op==='revokeClassOfficer'){
    const row=await this.officer(tx,c);expected(row,c.body.expectedVersion);if(row.revoked_at)throw new Problem(409,'OFFICER_REVOKED');
    if(op==='rotateClassOfficerPin'){const updated=(await one<Row>(tx,'UPDATE app.class_officer_assignments SET version=version+1 WHERE school_id=$1 AND id=$2 RETURNING *',[school,row.id]))!;return this.pin(tx,c,updated);}
    const reason=text(c.body.reason,'reason',5,2000);await tx.query('UPDATE app.class_officer_assignments SET revoked_at=now() WHERE school_id=$1 AND id=$2',[school,row.id]);await tx.query('UPDATE identity.class_officer_sessions SET revoked_at=now() WHERE school_id=$1 AND assignment_id=$2 AND revoked_at IS NULL',[school,row.id]);await audit(tx,c,'class-officer',String(row.id),{reason,revoked:true});return {data:{id:row.id,revoked:true}};
   }
   if(op==='reopenClassOfficerWeek'||op==='relockClassOfficerWeek'||op==='remindClassOfficer'){
    const officer=await this.officer(tx,c),state=await weekSubmission(tx,officer,id(c.body.weekId));expected(state.row,c.body.expectedVersion);const reason=text(c.body.reason,'reason',5,2000);
    if(op==='remindClassOfficer'){await audit(tx,{...c,operation:{...c.operation,id:'weekly.reminder'}},'weekly-submission',String(state.row.id),{classId,assignmentId:officer.id,message:reason});return {data:{id:state.row.id,message:reason}};}
    const reopen=op==='reopenClassOfficerWeek';await tx.query(`UPDATE app.class_week_submissions SET status=$3,reopened_until=CASE WHEN $4 THEN now()+interval '30 minutes' ELSE NULL END,reopened_by=$5,reopen_reason=$6,lock_at=CASE WHEN $4 THEN lock_at ELSE now() END WHERE school_id=$1 AND id=$2`,[school,state.row.id,reopen?'REOPENED':'LOCKED',reopen,c.principal!.userId,reason]);
    await audit(tx,{...c,operation:{...c.operation,id:reopen?'weekly.reopen':'weekly.manual-lock'}},'weekly-submission',String(state.row.id),{classId,assignmentId:officer.id,minutes:reopen?30:0});return {data:await one(tx,'SELECT * FROM app.class_week_submissions WHERE school_id=$1 AND id=$2',[school,state.row.id])};
   }
   if(op==='saveClassWeekDeadline'){
    const weekId=id(c.body.weekId);if(!await one(tx,'SELECT id FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 AND id=$3',[school,cls.year_id,weekId]))notFound();
    const reason=text(c.body.reason,'reason',5,2000),submit=new Date(String(c.body.submitDeadline)),lock=new Date(String(c.body.lockDeadline));if(!Number.isFinite(+submit)||!Number.isFinite(+lock)||submit>lock)validation('lockDeadline','Hạn khóa phải sau hạn nộp');
    const old=await one<Row>(tx,'SELECT * FROM app.class_week_settings WHERE school_id=$1 AND class_id=$2 AND week_id=$3 FOR UPDATE',[school,classId,weekId]);if(old)expected(old,c.body.expectedVersion);else if(c.body.expectedVersion!==0)throw new Problem(409,'VERSION_CONFLICT');
    const row=await one<Row>(tx,`INSERT INTO app.class_week_settings(school_id,class_id,week_id,submit_deadline,lock_deadline,reason) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school_id,class_id,week_id) DO UPDATE SET submit_deadline=EXCLUDED.submit_deadline,lock_deadline=EXCLUDED.lock_deadline,reason=EXCLUDED.reason,version=app.class_week_settings.version+1,updated_at=now() RETURNING *`,[school,classId,weekId,submit,lock,reason]);await audit(tx,c,'class-week',weekId,{classId,submitDeadline:submit.toISOString(),lockDeadline:lock.toISOString()});return {data:row};
   }
   if(op==='saveClassNotebookSettings'){
    expected(cls,c.body.expectedVersion);const settings=c.body.settings as Row;if(!settings||typeof settings!=='object')validation('settings','Thiếu cấu hình');
    if(settings.weeklyDeadlineDay!==undefined&&(!Number.isInteger(settings.weeklyDeadlineDay)||Number(settings.weeklyDeadlineDay)<0||Number(settings.weeklyDeadlineDay)>6))validation('settings.weeklyDeadlineDay','Ngày trong tuần 0–6');
    for(const k of ['weeklySubmitTime','weeklyLockTime'])if(settings[k]!==undefined&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(settings[k])))validation('settings.'+k,'Giờ HH:MM');
    const combined={...cls.notebook_settings as Row,...settings};if(String(combined.weeklySubmitTime??'18:00')>String(combined.weeklyLockTime??'20:00'))validation('settings.weeklyLockTime','Giờ khóa phải từ giờ nộp trở đi');
    if(settings.periodicClassificationPolicy){const p=settings.periodicClassificationPolicy as Row,thresholds=p.thresholds as Row[];if(!Array.isArray(thresholds)||!thresholds.length||thresholds.length>20||new Set(thresholds.map(t=>String(t.label).trim())).size!==thresholds.length)validation('settings.periodicClassificationPolicy','Nhập 1–20 mức xếp loại không trùng');for(const t of thresholds){text(t.label,'label',1,100);if(!Number.isFinite(Number(t.minimum_score))||Math.abs(Number(t.minimum_score))>100000)validation('minimum_score','Ngưỡng điểm không hợp lệ');}p.version=Number(((cls.notebook_settings as Row).periodicClassificationPolicy as Row)?.version??0)+1;}
    const row=await one<Row>(tx,'UPDATE app.classes SET notebook_settings=notebook_settings||$3::jsonb WHERE school_id=$1 AND id=$2 RETURNING id,version,notebook_settings',[school,classId,JSON.stringify(settings)]);await audit(tx,c,'class',classId,{keys:Object.keys(settings)});return {data:row};
   }
   if(op==='saveClassPositionPolicy'){
    const pos=await one<Row>(tx,'SELECT * FROM app.class_positions WHERE school_id=$1 AND class_id=$2 AND id=$3 FOR UPDATE',[school,classId,id(c.body.positionId)]);if(!pos)notFound();expected(pos,c.body.expectedVersion);
    const bonus=Number(c.body.weeklyBonus);if(!Number.isFinite(bonus)||bonus<0||bonus>1000)validation('weeklyBonus','Điểm cộng từ 0 đến 1000');
    const row=await one<Row>(tx,'UPDATE app.class_positions SET name=$3,description=$4,weekly_bonus=$5,officer_role=$6 WHERE school_id=$1 AND id=$2 RETURNING id,version,name,description,weekly_bonus,officer_role',[school,pos.id,text(c.body.name,'name',1,120),c.body.description??'',bonus,c.body.officerRole??null]);await audit(tx,c,'class-position',String(pos.id),{weeklyBonus:bonus});return {data:row};
   }
   const week=await one<Row>(tx,'SELECT * FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 AND id=$3',[school,cls.year_id,id(c.body.weekId)]);if(!week)notFound();
   if(op==='copyClassNotebookSchedule'){const draft=await this.schedule.draftWithin(tx,c,c.body.kind==='DUTY'?'DUTY':'TIMETABLE',week,{copyPrevious:true});return {data:draft.data};}
   if(op==='withdrawClassNotebookTimetable'){text(c.body.reason,'reason',5,2000);if(String(week.starts_on)<today)validation('weekId','Chỉ rút TKB tuần chưa bắt đầu');await this.policy.require(tx,c.principal!,'schedule.publish',{schoolId:school,classId});return this.schedule.withdrawWeek(tx,c,week);}
   throw new Problem(404,'RESOURCE_NOT_FOUND');
  };
  if(c.operation.method==='GET')return this.db.transaction(work,{schoolId:c.params.schoolId,userId:c.principal!.userId});
  return this.commands.execute(c,tx=>this.scope(tx,c),work,['assignClassOfficer','rotateClassOfficerPin'].includes(c.operation.id));
 }
}
