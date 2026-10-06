import crypto from 'node:crypto';
import {Injectable} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {Database,one,type Row,type Transaction} from '../../database/database';
import {IdentityService} from '../identity/identity.service';
import {runtimeConfig} from '../../common/config';
import {hashPassword,verifyPassword,hashToken,randomToken,csrfFor,setCookie} from '../../common/security';
import {Problem,notFound,validation} from '../../common/problem';
import type {Handler,RequestContext,CapabilityPrincipal,Result} from '../../api.router';
import {conductPeriod} from '../conduct/conduct-data';
import {ruleDelta} from '../conduct/scoring';
import {ScheduleService} from '../schedule/schedule.service';
import {id,text,expected,officerAudit,capabilityCommand,weekSubmission,weeklyWritable} from './notebook-common';
const cookie=()=>runtimeConfig().secure?'__Host-edu_officer':'edu_officer';
const active=`a.revoked_at IS NULL AND a.valid_from<=(now() AT TIME ZONE s.timezone)::date
 AND (a.valid_until IS NULL OR a.valid_until>(now() AT TIME ZONE s.timezone)::date)
 AND e.status<>'CANCELLED' AND e.starts_on<=(now() AT TIME ZONE s.timezone)::date AND (e.ends_on IS NULL OR e.ends_on>(now() AT TIME ZONE s.timezone)::date)
 AND c.year_id=a.year_id AND c.status<>'ARCHIVED' AND y.status<>'ARCHIVED' AND s.status='ACTIVE'`;
@Injectable()
export class OfficersService{
 constructor(private readonly db:Database,private readonly identity:IdentityService,private readonly schedule:ScheduleService){}
 handlers():Record<string,Handler>{return {loginClassOfficer:c=>this.login(c),getClassOfficerWorkspace:c=>this.workspace(c),saveClassOfficerEntry:c=>this.command(c),submitClassOfficerWeek:c=>this.command(c),saveClassOfficerDuty:c=>this.command(c),saveClassOfficerTimetable:c=>this.command(c),logoutClassOfficer:c=>this.command(c)};}
 async portal(slug:string){const p=await one<Row>(this.db.app as unknown as Transaction,`SELECT p.school_id,p.class_id FROM platform.public_class_portals p JOIN platform.schools s ON s.id=p.school_id AND s.status='ACTIVE' WHERE p.slug=$1`,[slug]);if(!p)notFound();return p;}
 private async assignment(tx:Transaction,schoolId:string,classId:string,assignmentId:string){
  const p=await one<Row>(tx,`SELECT a.*,s.timezone,e.student_id,st.full_name,c.notebook_settings,c.name AS class_name
  FROM app.class_officer_assignments a JOIN app.enrollments e ON e.school_id=a.school_id AND e.id=a.enrollment_id AND e.class_id=a.class_id AND e.year_id=a.year_id
  JOIN app.students st ON st.school_id=e.school_id AND st.id=e.student_id JOIN app.classes c ON c.school_id=a.school_id AND c.id=a.class_id
  JOIN app.academic_years y ON y.school_id=a.school_id AND y.id=a.year_id JOIN platform.schools s ON s.id=a.school_id
  WHERE a.school_id=$1 AND a.class_id=$2 AND a.id=$3 AND ${active}`,[schoolId,classId,assignmentId]);if(!p)throw new Problem(401,'OFFICER_ACCESS_INVALID');
  if(p.role==='GROUP_LEADER'&&!await one(tx,`SELECT id FROM app.group_memberships WHERE school_id=$1 AND class_id=$2 AND enrollment_id=$3 AND group_id=$4 AND cancelled_at IS NULL AND starts_on<=(now() AT TIME ZONE $5)::date AND (ends_on IS NULL OR ends_on>(now() AT TIME ZONE $5)::date)`,[schoolId,classId,p.enrollment_id,p.group_id,p.timezone]))throw new Problem(401,'OFFICER_ACCESS_INVALID');
  if(p.position_assignment_id&&!await one(tx,'SELECT id FROM app.position_assignments WHERE school_id=$1 AND id=$2 AND enrollment_id=$3 AND cancelled_at IS NULL AND starts_on<=(now() AT TIME ZONE $4)::date AND (ends_on IS NULL OR ends_on>(now() AT TIME ZONE $4)::date)',[schoolId,p.position_assignment_id,p.enrollment_id,p.timezone]))throw new Problem(401,'OFFICER_ACCESS_INVALID');
  return p;
 }
 private async login(c:RequestContext):Promise<Result>{
  const p=await this.portal(c.params.publicClassSlug!),assignmentId=id(c.body.assignmentId),pin=text(c.body.pin,'pin',6,128);
  await this.identity.rateLimit('officer-login:ip:'+c.request.ip,20,300);await this.identity.rateLimit('officer-login:assignment:'+assignmentId,10,300);
  const token=randomToken(),sessionId=crypto.randomUUID(),tokenHash=hashToken(token),csrfToken=csrfFor(sessionId,tokenHash);
  const result=await this.db.transaction(async tx=>{
   let assignment:Row;try{assignment=await this.assignment(tx,String(p.school_id),String(p.class_id),assignmentId);}catch{return {valid:false};}
   const credential=await one<Row>(tx,'SELECT * FROM identity.class_officer_credentials WHERE school_id=$1 AND assignment_id=$2 FOR UPDATE',[p.school_id,assignmentId]);
   if(!credential||credential.locked_until&&new Date(credential.locked_until as Date).getTime()>Date.now())return {valid:false};
   if(!await verifyPassword(String(credential.pin_hash),pin)){
    await tx.query("UPDATE identity.class_officer_credentials SET failed_attempts=failed_attempts+1,locked_until=CASE WHEN failed_attempts+1>=5 THEN now()+interval '15 minutes' ELSE NULL END WHERE school_id=$1 AND assignment_id=$2",[p.school_id,assignmentId]);return {valid:false};
   }
   await tx.query('UPDATE identity.class_officer_credentials SET failed_attempts=0,locked_until=NULL WHERE school_id=$1 AND assignment_id=$2',[p.school_id,assignmentId]);
   await tx.query(`INSERT INTO identity.class_officer_sessions(id,school_id,assignment_id,token_hash,csrf_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '45 minutes')`,[sessionId,p.school_id,assignmentId,tokenHash,hashToken(csrfToken)]);
   return {valid:true,role:String(assignment.role)};
  },{schoolId:String(p.school_id)});
  if(!result.valid)throw new Problem(401,'OFFICER_ACCESS_INVALID');setCookie(c.reply,cookie(),token,2700);
  return {data:{csrfToken,role:result.role,expiresAt:new Date(Date.now()+2700_000).toISOString()}};
 }
 async authenticate(request:FastifyRequest,slug:string):Promise<CapabilityPrincipal>{
  const token=request.cookies[cookie()];if(!token)throw new Problem(401,'OFFICER_ACCESS_INVALID');const portal=await this.portal(slug);
  return this.db.transaction(async tx=>{
   const session=await one<Row>(tx,'SELECT * FROM identity.class_officer_sessions WHERE school_id=$1 AND token_hash=$2 AND revoked_at IS NULL AND expires_at>now()',[portal.school_id,hashToken(token)]);if(!session)throw new Problem(401,'OFFICER_ACCESS_INVALID');
   const row=await this.assignment(tx,String(portal.school_id),String(portal.class_id),String(session.assignment_id));
   return {sessionId:String(session.id),schoolId:String(portal.school_id),classId:String(portal.class_id),yearId:String(row.year_id),assignmentId:String(row.id),role:String(row.role),tokenHash:String(session.token_hash),csrfHash:String(session.csrf_hash),row};
  },{schoolId:String(portal.school_id)});
 }
 private async targets(tx:Transaction,p:Row,date:string){
  const schoolId=String(p.school_id),classId=String(p.class_id);
  if(p.role==='LABOR_VICE')return [];
  const condition=p.role==='GROUP_LEADER'?`EXISTS(SELECT 1 FROM app.group_memberships gm WHERE gm.school_id=e.school_id AND gm.class_id=e.class_id AND gm.enrollment_id=e.id AND gm.group_id=$4 AND gm.cancelled_at IS NULL AND gm.starts_on<=$3 AND (gm.ends_on IS NULL OR gm.ends_on>$3))`:
   `EXISTS(SELECT 1 FROM app.class_officer_assignments a WHERE a.school_id=e.school_id AND a.class_id=e.class_id AND a.enrollment_id=e.id AND a.role='GROUP_LEADER' AND a.revoked_at IS NULL AND a.valid_from<=$3 AND (a.valid_until IS NULL OR a.valid_until>$3)) AND $4::uuid IS NULL`;
  return (await tx.query<Row>(`SELECT e.id AS enrollment_id,st.id AS student_id,st.full_name FROM app.enrollments e JOIN app.students st ON st.school_id=e.school_id AND st.id=e.student_id
  WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$5 AND e.status<>'CANCELLED' AND e.starts_on<=$3 AND (e.ends_on IS NULL OR e.ends_on>$3) AND ${condition} ORDER BY st.full_name,st.id`,[schoolId,classId,date,p.group_id??null,p.year_id])).rows;
 }
 private async workspace(c:RequestContext):Promise<Result>{
  const cap=c.capability!;
  return this.db.transaction(async tx=>{
   const p=await this.assignment(tx,cap.schoolId,cap.classId,cap.assignmentId!),weeks=(await tx.query<Row>('SELECT id,week_number,starts_on,ends_on FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 ORDER BY week_number',[cap.schoolId,cap.yearId])).rows;
   const today=String((await one<Row>(tx,"SELECT (now() AT TIME ZONE $1)::date AS day",[p.timezone]))!.day);
   const current=weeks.find(w=>String(w.starts_on)<=today&&String(w.ends_on)>today)??weeks.at(-1);if(!current)throw new Problem(409,'WEEK_UNAVAILABLE');
   const weekId=c.query.weekId?id(c.query.weekId):String(current.id),state=await weekSubmission(tx,p,weekId),date=c.query.onDate?text(c.query.onDate,'onDate',10,10):today;
   if(c.query.onDate&&(date<String(state.week.starts_on)||date>=String(state.week.ends_on)))throw validation('onDate','Ngày phải thuộc tuần đang chọn.');
   const targets=await this.targets(tx,p,date),period=await one<Row>(tx,'SELECT id,status,rule_set_id FROM app.conduct_periods WHERE school_id=$1 AND class_id=$2 AND week_id=$3',[cap.schoolId,cap.classId,weekId]);
   const rules=period?(await tx.query<Row>("SELECT id,label,value_mode,default_delta,minimum_delta,maximum_delta,max_occurrences_per_day,reason_required FROM app.conduct_rules WHERE school_id=$1 AND rule_set_id=$2 AND attendance_status IS NULL ORDER BY label",[cap.schoolId,period.rule_set_id])).rows:[];
   const records=period?(await tx.query<Row>(`SELECT id,version,enrollment_id,rule_id,rule_label_snapshot,delta_snapshot,public_reason,status,officer_assignment_id,occurred_at FROM app.conduct_records WHERE school_id=$1 AND period_id=$2 AND enrollment_id=ANY($3::uuid[]) ORDER BY occurred_at DESC LIMIT 5000`,[cap.schoolId,period.id,targets.map(t=>t.enrollment_id)])).rows:[];
   const roster=p.role==='LABOR_VICE'?(await tx.query<Row>(`SELECT e.id AS enrollment_id,st.full_name,g.group_id FROM app.enrollments e JOIN app.students st ON st.school_id=e.school_id AND st.id=e.student_id LEFT JOIN app.group_memberships g ON g.school_id=e.school_id AND g.enrollment_id=e.id AND g.cancelled_at IS NULL AND g.starts_on<=$3 AND (g.ends_on IS NULL OR g.ends_on>$3) WHERE e.school_id=$1 AND e.class_id=$2 AND e.status<>'CANCELLED' AND e.starts_on<=$3 AND (e.ends_on IS NULL OR e.ends_on>$3) ORDER BY st.full_name`,[cap.schoolId,cap.classId,date])).rows:targets;
   const timetable=p.role==='CLASS_LEADER'?(await tx.query<Row>("SELECT id,version,starts_on,ends_on,status FROM app.timetable_versions WHERE school_id=$1 AND class_id=$2 ORDER BY revision DESC LIMIT 10",[cap.schoolId,cap.classId])).rows:[];
   const groups=(await tx.query<Row>('SELECT id,name FROM app.class_groups WHERE school_id=$1 AND class_id=$2 ORDER BY sort_order',[cap.schoolId,cap.classId])).rows;
   const submissions=p.role==='CLASS_LEADER'?(await tx.query<Row>(`SELECT a.role,g.name AS group_name,x.status,x.submitted_at,x.lock_at FROM app.class_officer_assignments a LEFT JOIN app.class_groups g ON g.school_id=a.school_id AND g.id=a.group_id LEFT JOIN app.class_week_submissions x ON x.school_id=a.school_id AND x.officer_assignment_id=a.id AND x.week_id=$3 WHERE a.school_id=$1 AND a.class_id=$2 AND a.role='GROUP_LEADER' AND a.revoked_at IS NULL`,[cap.schoolId,cap.classId,weekId])).rows:[];
   const teaching=p.role==='CLASS_LEADER'?(await tx.query<Row>(`SELECT DISTINCT a.member_id,a.subject_id,m.work_display_name AS teacher_name,su.name AS subject_name FROM app.teaching_assignments a JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id AND m.status='ACTIVE' JOIN app.subjects su ON su.school_id=a.school_id AND su.id=a.subject_id WHERE a.school_id=$1 AND a.class_id=$2 AND a.kind='SUBJECT' AND a.revoked_at IS NULL AND a.starts_on<=$3 AND (a.ends_on IS NULL OR a.ends_on>$3) ORDER BY su.name,m.work_display_name`,[cap.schoolId,cap.classId,date])).rows:[];
   return {data:{assignmentId:p.id,className:p.class_name,displayName:p.full_name,role:p.role,groupId:p.group_id,referenceDate:date,csrfToken:csrfFor(cap.sessionId,cap.tokenHash),serverNow:new Date().toISOString(),weeks,weekId,submission:state.row,deadlines:state.deadlines,period,targets:roster,rules,records,groups,submissions,timetables:timetable,teaching,timetableEnabled:(p.notebook_settings as Row)?.officerTimetableEnabled===true}};
  },{schoolId:cap.schoolId});
 }
 private async command(c:RequestContext):Promise<Result>{
  const cap=c.capability!;
  return this.db.transaction(async tx=>{
   await tx.query('SELECT app.lock_school()');
   if(!await one(tx,'SELECT id FROM identity.class_officer_sessions WHERE school_id=$1 AND id=$2 AND revoked_at IS NULL AND expires_at>now()',[cap.schoolId,cap.sessionId]))throw new Problem(401,'OFFICER_ACCESS_INVALID');
   const p=await this.assignment(tx,cap.schoolId,cap.classId,cap.assignmentId!);
   if(c.operation.id==='logoutClassOfficer'){await tx.query('UPDATE identity.class_officer_sessions SET revoked_at=now() WHERE school_id=$1 AND id=$2',[cap.schoolId,cap.sessionId]);c.reply.clearCookie(cookie(),{path:'/'});return {data:{loggedOut:true}};}
   const state=await weekSubmission(tx,p,id(c.body.weekId));weeklyWritable(state.row,state.deadlines);
   return capabilityCommand(tx,c,async()=>{
    expected(state.row,c.body.expectedVersion);
    if(c.operation.id==='submitClassOfficerWeek'){
     if(state.row.status==='SUBMITTED')throw new Problem(409,'WEEK_ALREADY_SUBMITTED');
     await tx.query("UPDATE app.class_week_submissions SET status='SUBMITTED',submitted_at=now(),lock_at=least(now()+interval '5 minutes',$3::timestamptz),reopened_until=NULL WHERE school_id=$1 AND id=$2",[cap.schoolId,state.row.id,state.deadlines.lock]);
     await officerAudit(tx,c,'weekly.submit',String(state.row.id),{graceMinutes:5});
    }else if(c.operation.id==='saveClassOfficerEntry'){
     if(!['GROUP_LEADER','CLASS_LEADER'].includes(cap.role!))throw new Problem(403,'OFFICER_ROLE_DENIED');
     const date=text(c.body.occurredOn,'occurredOn',10,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<String(state.week.starts_on)||date>=String(state.week.ends_on))validation('occurredOn','Ngày phải thuộc tuần');
     const today=String((await one<Row>(tx,"SELECT (now() AT TIME ZONE $1)::date AS day",[p.timezone]))!.day);
     if(date>today)validation('occurredOn','Sự kiện chưa xảy ra');
     if(date<String(p.valid_from)||p.valid_until&&date>=String(p.valid_until))notFound();
     const targets=await this.targets(tx,p,date),ids=c.body.enrollmentIds as string[];if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(value=>!targets.some(t=>t.enrollment_id===value)))throw new Problem(404,'RESOURCE_NOT_FOUND');
     const period=await one<Row>(tx,'SELECT id FROM app.conduct_periods WHERE school_id=$1 AND class_id=$2 AND week_id=$3',[cap.schoolId,cap.classId,state.week.id]);if(!period)throw new Problem(409,'WEEKLY_PERIOD_NOT_PREPARED');
     const source=await conductPeriod(tx,cap.schoolId,cap.classId,String(period.id),true);if(source.status!=='OPEN')throw new Problem(409,'PERIOD_LOCKED');
     const rule=await one<Row>(tx,'SELECT * FROM app.conduct_rules WHERE school_id=$1 AND rule_set_id=$2 AND id=$3 AND attendance_status IS NULL',[cap.schoolId,source.rule_set_id,id(c.body.ruleId)]);if(!rule)notFound();
     const occurrences=Number(c.body.occurrences);if(!Number.isInteger(occurrences)||occurrences<1||occurrences>50)validation('occurrences','Số lần từ 1 đến 50');
     const delta=ruleDelta(rule,c.body.manualDelta as string|undefined),note=text(c.body.note??(rule.reason_required?undefined:String(rule.label)),'note',3,500);
     const at=(await one<Row>(tx,"SELECT least(($2::date+time '12:00') AT TIME ZONE timezone,now()) AS at FROM platform.schools WHERE id=$1",[cap.schoolId,date]))!.at;
     if(c.body.recordId){const old=await one<Row>(tx,"SELECT * FROM app.conduct_records WHERE school_id=$1 AND period_id=$2 AND id=$3 AND officer_assignment_id=$4 AND status='DRAFT' FOR UPDATE",[cap.schoolId,period.id,id(c.body.recordId),p.id]);if(!old||ids.length!==1||old.enrollment_id!==ids[0]||old.rule_id!==rule.id)notFound();expected(old,c.body.recordVersion);
      if(c.body.exclude===true)await tx.query("UPDATE app.conduct_records SET status='EXCLUDED',exclusion_reason=$3 WHERE school_id=$1 AND id=$2",[cap.schoolId,old.id,text(c.body.note,'note',5,500)]);
      else await tx.query('UPDATE app.conduct_records SET delta_snapshot=$3,public_reason=$4 WHERE school_id=$1 AND id=$2',[cap.schoolId,old.id,delta,note]);
     }else for(const enrollment of ids)for(let n=0;n<occurrences;n++)await tx.query(`INSERT INTO app.conduct_records(school_id,class_id,period_id,rule_set_id,rule_id,enrollment_id,delta_snapshot,rule_label_snapshot,public_reason,occurred_at,source_kind,source_key,recorded_by,officer_assignment_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'MANUAL',$11,$12,$13)`,[cap.schoolId,cap.classId,period.id,source.rule_set_id,rule.id,enrollment,delta,rule.label,note,at,'officer:'+crypto.randomUUID(),p.created_by,p.id]);
     await officerAudit(tx,c,'officer.conduct-entry',String(state.row.id),{count:ids.length*occurrences,duringReopen:state.row.status==='REOPENED'});
    }else if(c.operation.id==='saveClassOfficerDuty'){
     if(cap.role!=='LABOR_VICE')throw new Problem(403,'OFFICER_ROLE_DENIED');
     await this.schedule.officerDraft(tx,c,p,'DUTY',state.week);
     await officerAudit(tx,c,'officer.duty-draft',String(state.row.id),{duringReopen:state.row.status==='REOPENED'});
    }else if(c.operation.id==='saveClassOfficerTimetable'){
     if(cap.role!=='CLASS_LEADER'||(p.notebook_settings as Row)?.officerTimetableEnabled!==true)throw new Problem(403,'OFFICER_ROLE_DENIED');
     await this.schedule.officerDraft(tx,c,p,'TIMETABLE',state.week);
     await officerAudit(tx,c,'officer.timetable-draft',String(state.row.id),{duringReopen:state.row.status==='REOPENED'});
    }
    if(c.operation.id!=='submitClassOfficerWeek')await tx.query('UPDATE app.class_week_submissions SET version=version+1 WHERE school_id=$1 AND id=$2',[cap.schoolId,state.row.id]);
    return {data:await one(tx,'SELECT id,status,version,submitted_at,lock_at,reopened_until FROM app.class_week_submissions WHERE school_id=$1 AND id=$2',[cap.schoolId,state.row.id])};
   });
  },{schoolId:cap.schoolId});
 }
}
