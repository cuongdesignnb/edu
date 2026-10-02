import Decimal from 'decimal.js';
import crypto from 'node:crypto';
import {one,iso,type Row,type Transaction} from '../../database/database';
import {listResource,type Resource} from '../../database/resources';
import {Permissions,grantAllows,type Grant} from '../../common/permissions';
import {canonical,audit} from '../../common/commands';
import {Problem,validation} from '../../common/problem';
import {conductPeriod,periodWritable,publicConductItems,version,reason} from './conduct-data';
import {loadRules} from './rules.service';
import {ruleWorkspaceView} from './rule-workspace';
import {score,points,ruleDelta} from './scoring';
import type {ConductService} from './conduct.service';
import type {PublicationsService} from '../publications/publications.service';
import type {RequestContext,Result} from '../../api.router';

export const conductWorkspaceOperations=['getConductWorkspaceWeeks','getConductWorkspaceRecords','getConductWorkspaceSummary','createConductWorkspaceRecord','updateConductWorkspaceRecord','reviewConductWorkspaceRecords','lockConductWorkspaceWeek','publishConductWorkspaceWeek','reopenConductWorkspaceWeek','getConductWorkspaceSnapshots','getConductWorkspaceSnapshot'];
const add=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const bounded=(rows:Row[],max=5000)=>{if(rows.length>max)throw new Problem(422,'WORKSPACE_LIMIT');return rows;};
type Context={s:string;y:string;c:string;today:string;reference:string;school:Row;cls:Row;grants:Grant[];userId:string};
export async function context(tx:Transaction,policy:Permissions,c:RequestContext):Promise<Context>{
 const s=c.params.schoolId!,y=c.params.yearId!,cl=c.params.classId!,access=await policy.require(tx,c.principal!,'class.read+conduct.read',{schoolId:s,yearId:y,classId:cl,allowSubject:true});
 const cls=await one<Row>(tx,'SELECT c.*,y.status AS year_status,y.starts_on,y.ends_on FROM app.classes c JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id WHERE c.school_id=$1 AND c.id=$2 AND c.year_id=$3',[s,cl,y]);if(!cls)throw new Problem(404,'RESOURCE_NOT_FOUND');
 const school=(await one<Row>(tx,'SELECT version,timezone,settings FROM platform.schools WHERE id=$1',[s]))!;
 return {s,y,c:cl,today:access.today,reference:access.today>=String(cls.ends_on)?add(String(cls.ends_on),-1):access.today<String(cls.starts_on)?String(cls.starts_on):access.today,school,cls,grants:access.grants,userId:c.principal!.userId};
}
export const scope=(x:Context)=>({schoolId:x.s,yearId:x.y,classId:x.c});
export function can(x:Context,a:string,d?:string,lesson?:Row){return x.grants.some(g=>grantAllows(g,a,{...scope(x),date:d},x.today)||!!lesson&&lesson.user_id===x.userId&&grantAllows(g,a,{...scope(x),date:d,subjectId:String(lesson.subject_id),allowSubject:true},x.today));}
function readable(x:Context,d:string){return x.grants.some(g=>grantAllows(g,'conduct.read',{...scope(x),date:d,allowSubject:true},x.today));}
function mutable(x:Context){if(x.cls.status==='ARCHIVED'||x.cls.year_status==='ARCHIVED')throw new Problem(409,'YEAR_ARCHIVED');}
function weekReadable(x:Context,w:Row){return Array.from({length:7},(_,n)=>add(String(w.starts_on),n)).some(d=>d<String(w.ends_on)&&readable(x,d));}
export async function week(tx:Transaction,x:Context,id:string){const w=await one<Row>(tx,'SELECT * FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 AND id=$3',[x.s,x.y,id]);if(!w||!weekReadable(x,w))throw new Problem(404,'RESOURCE_NOT_FOUND');return w;}
export async function selected(tx:Transaction,x:Context,w:Row){
 const p=await one<Row>(tx,'SELECT p.*,w.starts_on,w.ends_on,w.week_number FROM app.conduct_periods p JOIN app.school_weeks w ON w.school_id=p.school_id AND w.id=p.week_id WHERE p.school_id=$1 AND p.class_id=$2 AND p.week_id=$3',[x.s,x.c,w.id]);
 const setId=p?.rule_set_id??(await one<Row>(tx,'SELECT rule_set_id FROM app.class_rule_periods WHERE school_id=$1 AND class_id=$2 AND starts_on<=$3 AND (ends_on IS NULL OR ends_on>=$4)',[x.s,x.c,w.starts_on,w.ends_on]))?.rule_set_id;
 const set=setId?await one<Row>(tx,'SELECT * FROM app.rule_sets WHERE school_id=$1 AND id=$2 AND discarded_at IS NULL',[x.s,setId]):undefined;
 const enrollments=bounded((await tx.query<Row>(`SELECT e.*,s.full_name,s.student_code,s.version AS student_version FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id WHERE e.school_id=$1 AND e.class_id=$2 AND e.status<>'CANCELLED' AND daterange(e.starts_on,e.ends_on,'[)')&&daterange($3,$4,'[)') ORDER BY e.starts_on,e.id LIMIT 5001`,[x.s,x.c,w.starts_on,w.ends_on])).rows);
 const records=p?bounded((await tx.query<Row>(`SELECT r.*,to_char(r.occurred_at AT TIME ZONE sc.timezone,'YYYY-MM-DD') AS date,m.work_display_name AS actor_name FROM app.conduct_records r JOIN platform.schools sc ON sc.id=r.school_id LEFT JOIN app.memberships m ON m.school_id=r.school_id AND m.user_id=r.recorded_by WHERE r.school_id=$1 AND r.period_id=$2 ORDER BY r.created_at DESC,r.id LIMIT 10001`,[x.s,p.id])).rows,10000):[];
 const config=set?await loadRules(tx,x.s,String(set.id)):{rules:[],thresholds:[]};
 const pub=p?await one<Row>(tx,"SELECT * FROM app.publication_revisions WHERE school_id=$1 AND conduct_period_id=$2 AND status IN ('READY','PUBLISHED') ORDER BY CASE WHEN status='PUBLISHED' THEN 0 ELSE 1 END,revision DESC LIMIT 1",[x.s,p.id]):undefined;
 const lessons=bounded((await tx.query<Row>(`SELECT l.*,m.user_id,sub.name AS subject_name,to_char(l.starts_at AT TIME ZONE sc.timezone,'YYYY-MM-DD') AS date FROM app.lesson_occurrences l JOIN app.timetable_versions t ON t.school_id=l.school_id AND t.id=l.timetable_id JOIN platform.schools sc ON sc.id=l.school_id JOIN app.memberships m ON m.school_id=l.school_id AND m.id=l.member_id JOIN app.subjects sub ON sub.school_id=l.school_id AND sub.id=l.subject_id WHERE l.school_id=$1 AND l.class_id=$2 AND t.year_id=$3 AND l.starts_at>=($4::date::timestamp AT TIME ZONE sc.timezone) AND l.starts_at<($5::date::timestamp AT TIME ZONE sc.timezone) AND l.status='SCHEDULED' ORDER BY l.starts_at,l.id LIMIT 501`,[x.s,x.c,x.y,w.starts_on,w.ends_on])).rows,500);
 const source={weekId:String(w.id),periodId:p?String(p.id):null,version:Number(p?.version??0),dataVersion:Number(p?.data_version??0),classVersion:Number(x.cls.version),schoolVersion:Number(x.school.version),sourceHash:crypto.createHash('sha256').update(canonical({week:w,enrollments:enrollments.map(e=>[e.id,e.version,e.student_version]),records:records.map(r=>[r.id,r.version]),set:set?[set.id,set.version]:null,lessons:lessons.map(l=>[l.id,l.version]),publication:pub?[pub.id,pub.version]:null})).digest('hex'),publicationId:pub?.status==='PUBLISHED'?String(pub.id):null};
 return {w,p,set,enrollments,records,config,pub,lessons,source};
}
type Selection=Awaited<ReturnType<typeof selected>>;
function status(d:Selection){return d.p?.status==='LOCKED'?(d.pub?.status==='PUBLISHED'?'published':'locked'):'open';}
function weekDto(x:Context,w:Row,st='open'){return {id:w.id,index:w.week_number,startDate:w.starts_on,endDate:add(String(w.ends_on),-1),closeDeadline:w.input_deadline?new Date(w.input_deadline as Date).toISOString().slice(0,10):null,status:st,isCurrent:String(w.starts_on)<=x.reference&&String(w.ends_on)>x.reference};}
export function checkSource(d:Selection,value:unknown){if(canonical(value)!==canonical(d.source))throw new Problem(409,'STALE_SOURCE',undefined,Number(d.p?.data_version??0));}
export async function setView(tx:Transaction,x:Context,d:Selection){if(!d.set)return null;return ruleWorkspaceView(tx,{schoolId:x.s,today:x.today,ids:null,classIds:[x.c],can:()=>false},d.set,d.source.sourceHash);}
function visibleRecords(x:Context,d:Selection){return d.records.filter(r=>can(x,'conduct.read',String(r.date))||r.recorded_by===x.userId&&x.grants.some(g=>grantAllows(g,'conduct.read',{...scope(x),date:String(r.date),subjectId:String(r.subject_id),allowSubject:true},x.today)));}
function twins(records:Row[],r:Row){return records.filter(o=>o.id!==r.id&&o.enrollment_id===r.enrollment_id&&o.rule_id===r.rule_id&&o.date===r.date&&o.status!=='EXCLUDED'&&r.status!=='EXCLUDED'&&o.distinct_note===null&&r.distinct_note===null).map(o=>String(o.id));}
function recordView(x:Context,d:Selection,r:Row,rows=visibleRecords(x,d)){
 const e=d.enrollments.find(e=>e.id===r.enrollment_id),rule=d.config.rules.find(rule=>rule.id===r.rule_id);if(!e||!rule)throw new Problem(409,'CONDUCT_RECORD_SOURCE_UNAVAILABLE');
 const editable=status(d)==='open'&&r.status==='DRAFT'&&(can(x,'conduct.review',String(r.date))||r.recorded_by===x.userId&&can(x,'conduct.record',String(r.date),d.lessons.find(l=>l.id===r.lesson_id)));
 return {...scope(x),id:r.id,studentId:e.student_id,enrollmentId:e.id,weekId:d.w.id,date:r.date,ruleSetId:r.rule_set_id,ruleId:r.rule_id,points:Number(r.delta_snapshot),reason:r.public_reason,createdBy:r.recorded_by,createdAt:iso(r.created_at as Date),createdByName:r.actor_name??null,status:r.status==='DRAFT'?'pending_review':r.status==='APPROVED'?'approved':r.review_decision==='reject'?'rejected':'void',reviewNote:r.exclusion_reason??null,version:r.version,studentName:e.full_name,studentCode:e.student_code,ruleLabel:r.rule_label_snapshot,category:rule.group_name,fromAttendance:r.source_kind==='ATTENDANCE',linkedAttendanceRecordId:r.source_kind==='ATTENDANCE'?r.source_id:null,duplicateOf:twins(rows,r),ruleSetVersion:d.set!.revision,lessonId:r.lesson_id??null,canEdit:editable};
}
function rowsFor(set:Row,thresholds:Row[],enrollments:Row[],records:Row[],pending=false){
 const result:Row[]=[],groups=new Map<string,Row[]>();for(const e of enrollments){const list=groups.get(String(e.student_id))??[];list.push(e);groups.set(String(e.student_id),list);}
 for(const [id,list]of groups){const r=records.filter(r=>list.some(e=>e.id===r.enrollment_id)&&(r.status==='APPROVED'||pending&&r.status==='DRAFT'||r.status===undefined)),value=score(set,r.map(r=>String(r.delta_snapshot)),thresholds);
  result.push({studentId:id,studentName:list[0]!.full_name,studentCode:list[0]!.student_code??null,base:Number(value.basePoints),plus:Number(value.bonusPoints),minus:Number(value.penaltyPoints),total:Number(value.finalPoints),grade:value.classification,items:r.map(r=>({recordId:r.id,date:r.date,label:r.rule_label_snapshot,points:Number(r.delta_snapshot),shareWithParent:r.share_with_parent_snapshot}))});
 }return result.sort((a,b)=>String(a.studentName).localeCompare(String(b.studentName),'vi')||String(a.studentId).localeCompare(String(b.studentId)));
}
export async function snapshotView(tx:Transaction,x:Context,pub:Row){
 const snap=pub.staff_snapshot as {conduct:{students:Row[]};conductDisplay?:Row},period=await conductPeriod(tx,x.s,x.c,String(pub.conduct_period_id));
 const capture=pub.conduct_workspace_snapshot as {configuration:{set:Row;thresholds:Row[]};enrollments:Row[];records:Row[]}|null;
 const set=capture?.configuration.set??(await one<Row>(tx,'SELECT * FROM app.rule_sets WHERE school_id=$1 AND id=$2',[x.s,period.rule_set_id]))!;
 const rows=capture?rowsFor(capture.configuration.set,capture.configuration.thresholds,capture.enrollments,capture.records):snap.conduct.students.map(r=>({studentId:r.studentId,studentName:r.fullName,studentCode:null,base:Number(r.basePoints),plus:Number(r.bonusPoints),minus:Number(r.penaltyPoints),total:Number(r.finalPoints),grade:r.classification,items:[]}));
 const adjustment=await one<Row>(tx,'SELECT reason FROM app.adjustment_requests WHERE school_id=$1 AND result_publication_id=$2',[x.s,pub.id]);
 const actor=async(id:unknown)=>id?(await one<Row>(tx,'SELECT work_display_name FROM app.memberships WHERE school_id=$1 AND user_id=$2',[x.s,id]))?.work_display_name??null:null;
 return {id:pub.id,...scope(x),weekId:period.week_id,weekIndex:Number(period.week_number),rowCount:rows.length,avg:rows.length?Number(rows.reduce((sum,r)=>sum.plus(String(r.total)),new Decimal(0)).div(rows.length).toDecimalPlaces(1)):0,lockedByName:await actor(pub.created_by),publishedByName:await actor(pub.published_by),kind:'conduct_week',versionNo:pub.revision,ruleSetId:set.id,ruleSetVersionNo:snap.conductDisplay?.ruleSetRevision??set.revision,ruleSetName:snap.conductDisplay?.ruleSetName??set.name,lockedAt:iso(pub.created_at as Date),lockedBy:pub.created_by,publishedAt:pub.published_at?iso(pub.published_at as Date):null,publishedBy:pub.published_by??null,status:pub.status==='READY'?'locked':String(pub.status).toLowerCase(),rows,detailsAvailable:!!capture,sourceVersion:pub.source_version,publicationVersion:pub.version,supersedesId:(await one<Row>(tx,'SELECT id FROM app.publication_revisions WHERE school_id=$1 AND conduct_period_id=$2 AND revision<$3 ORDER BY revision DESC LIMIT 1',[x.s,pub.conduct_period_id,pub.revision]))?.id??null,adjustmentNote:adjustment?.reason??null};
}
async function checks(tx:Transaction,x:Context,d:Selection,service:ConductService){
 const pending=d.records.filter(r=>r.status==='DRAFT').length,dups=d.records.reduce((n,r)=>n+twins(d.records,r).length,0)/2,blocking:string[]=[];
 if(pending)blocking.push(`${pending} ghi nhận chưa rà soát`);if(dups)blocking.push(`${dups} cặp ghi nhận có thể trùng`);if(!d.enrollments.length)blocking.push('Không có học sinh trong kỳ');
 for(const r of d.records.filter(r=>r.status!=='EXCLUDED'))try{await service.validateCurrentSource(tx,r);}catch(e){if(!(e instanceof Problem)||e.code!=='STALE_SOURCE')throw e;blocking.push('Nguồn sự kiện đã thay đổi, cần rà soát lại');}
 const warnings:string[]=[],days=(await tx.query<Row>(`SELECT day::date::text AS day FROM generate_series($3::date,least($4::date-1,$5::date),'1 day') day WHERE extract(isodow FROM day)<7 AND NOT EXISTS(SELECT 1 FROM app.calendar_events h WHERE h.school_id=$1 AND h.year_id=$2 AND h.kind='HOLIDAY' AND (h.class_id IS NULL OR h.class_id=$6) AND h.starts_on<=day::date AND h.ends_on>day::date) AND NOT EXISTS(SELECT 1 FROM app.attendance_sessions a WHERE a.school_id=$1 AND a.class_id=$6 AND a.session_date=day::date AND a.granularity='DAILY')`,[x.s,x.y,d.w.starts_on,d.w.ends_on,x.today,x.c])).rows;
 if(days.length)warnings.push(`Chưa điểm danh ${days.length} ngày: ${days.map(r=>String(r.day)).join(', ')}`);
 const unmarked=await one<{n:number}>(tx,`SELECT count(DISTINCT a.session_date)::int AS n FROM app.attendance_sessions a WHERE a.school_id=$1 AND a.class_id=$2 AND a.granularity='DAILY' AND a.session_date>=$3 AND a.session_date<$4 AND a.session_date<=$5 AND EXISTS(SELECT 1 FROM app.enrollments e WHERE e.school_id=a.school_id AND e.class_id=a.class_id AND e.status<>'CANCELLED' AND e.starts_on<=a.session_date AND (e.ends_on IS NULL OR e.ends_on>a.session_date) AND NOT EXISTS(SELECT 1 FROM app.attendance_records r WHERE r.school_id=e.school_id AND r.session_id=a.id AND r.enrollment_id=e.id AND r.status<>'UNMARKED'))`,[x.s,x.c,d.w.starts_on,d.w.ends_on,x.today]);if(unmarked!.n)warnings.push(`Còn học sinh chưa điểm danh trong ${unmarked!.n} ngày`);
 return {pending,duplicates:dups,blocking:[...new Set(blocking)],warnings};
}
async function ensurePeriod(tx:Transaction,x:Context,d:Selection){if(d.p)return d.p;if(!d.set)throw new Problem(422,'RULE_SET_NOT_APPLIED');const row=await one<Row>(tx,'INSERT INTO app.conduct_periods(school_id,class_id,year_id,week_id,rule_set_id,input_deadline) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[x.s,x.c,x.y,d.w.id,d.set.id,d.w.input_deadline??null]);return conductPeriod(tx,x.s,x.c,String(row!.id),true);}
function requireAction(x:Context,a:string,d:string,lesson?:Row){if(!can(x,a,d,lesson))throw new Problem(404,'RESOURCE_NOT_FOUND');}
export async function authorizeConductWorkspace(tx:Transaction,p:Permissions,c:RequestContext){
 const x=await context(tx,p,c),op=c.operation.id;if(c.operation.method==='GET'){
  if(op.includes('Snapshot'))await p.require(tx,c.principal!,'publication.read',{...scope(x)});return;
 }
 mutable(x);const w=await week(tx,x,c.params.weekId!),d=await selected(tx,x,w);
 if(op==='createConductWorkspaceRecord'){const lesson=c.body.lessonId?d.lessons.find(l=>l.id===c.body.lessonId):undefined;if(c.body.lessonId&&!lesson)throw new Problem(404,'RESOURCE_NOT_FOUND');requireAction(x,'conduct.record',String(c.body.date),lesson);}
 else if(op==='updateConductWorkspaceRecord'){const r=visibleRecords(x,d).find(r=>r.id===c.params.recordId);if(!r)throw new Problem(404,'RESOURCE_NOT_FOUND');if(!can(x,'conduct.review',String(r.date))&&(r.recorded_by!==x.userId||!can(x,'conduct.record',String(r.date),d.lessons.find(l=>l.id===r.lesson_id))))throw new Problem(404,'RESOURCE_NOT_FOUND');}
 else{requireAction(x,c.operation.permission,String(w.starts_on));if(op==='lockConductWorkspaceWeek'&&c.body.alsoPublish)requireAction(x,'conduct.publish',String(w.starts_on));}
}
export async function conductWorkspace(tx:Transaction,p:Permissions,c:RequestContext,service:ConductService,publications:PublicationsService):Promise<Result>{
 const x=await context(tx,p,c),op=c.operation.id;
 if(op==='getConductWorkspaceWeeks'){
  if(Object.keys(c.query).length)throw new Problem(422,'INVALID_QUERY');
  const weeks=bounded((await tx.query<Row>(`SELECT w.*,p.status AS period_status,pub.id AS publication_id FROM app.school_weeks w LEFT JOIN app.conduct_periods p ON p.school_id=w.school_id AND p.week_id=w.id AND p.class_id=$3 LEFT JOIN app.publication_revisions pub ON pub.school_id=p.school_id AND pub.conduct_period_id=p.id AND pub.status='PUBLISHED' WHERE w.school_id=$1 AND w.year_id=$2 AND w.starts_on<=$4 ORDER BY w.week_number DESC,w.id LIMIT 501`,[x.s,x.y,x.c,x.reference])).rows,500).filter(w=>weekReadable(x,w));
  return {data:{...scope(x),today:x.today,weeks:weeks.map(w=>weekDto(x,w,w.period_status==='LOCKED'?(w.publication_id?'published':'locked'):'open'))}};
 }
 if(op==='getConductWorkspaceSnapshots'||op==='getConductWorkspaceSnapshot'){
  if(Object.keys(c.query).some(k=>!(op==='getConductWorkspaceSnapshots'?['limit','cursor']:[]).includes(k)))throw new Problem(422,'INVALID_QUERY');
  const get=async(id:string)=>{const pub=await one<Row>(tx,'SELECT * FROM app.publication_revisions WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND kind=\'CONDUCT\' AND id=$4',[x.s,x.c,x.y,id]);if(!pub)throw new Problem(404,'RESOURCE_NOT_FOUND');const period=await conductPeriod(tx,x.s,x.c,String(pub.conduct_period_id));requireAction(x,'publication.read',String(period.starts_on));return pub;};
  if(op==='getConductWorkspaceSnapshots'){
   const r:Resource={table:'app.publication_revisions',fields:{id:'id',createdAt:'created_at'},writeFields:[],search:[],filters:{}};
   const result=await listResource(tx,r,x.s,c.query,{sql:"t.class_id=$1 AND t.year_id=$2 AND t.kind='CONDUCT' AND EXISTS(SELECT 1 FROM app.conduct_periods p JOIN app.school_weeks w ON w.school_id=p.school_id AND w.id=p.week_id WHERE p.school_id=t.school_id AND p.id=t.conduct_period_id AND w.id=ANY($3::uuid[]))",values:[x.c,x.y,(await tx.query<Row>('SELECT id,starts_on FROM app.school_weeks WHERE school_id=$1 AND year_id=$2',[x.s,x.y])).rows.filter(w=>can(x,'publication.read',String(w.starts_on))).map(w=>w.id)]},x.userId),items=[];
   for(const row of result.data)items.push(await snapshotView(tx,x,await get(String(row.id))));return {data:{...scope(x),items},page:result.page};
  }
  const pub=await get(c.params.snapshotId!),snapshot=await snapshotView(tx,x,pub),w=await week(tx,x,String(snapshot.weekId)),d=await selected(tx,x,w),ruleSet=await setView(tx,x,d);
  const history=bounded((await tx.query<Row>('SELECT * FROM app.publication_revisions WHERE school_id=$1 AND conduct_period_id=$2 ORDER BY revision DESC LIMIT 501',[x.s,pub.conduct_period_id])).rows,500);
  const previous=history.find(h=>Number(h.revision)<Number(pub.revision)),prior=previous?await snapshotView(tx,x,previous):null;
  const actor=async(id:unknown)=>id?(await one<Row>(tx,'SELECT work_display_name FROM app.memberships WHERE school_id=$1 AND user_id=$2',[x.s,id]))?.work_display_name??null:null;
  return {data:{...scope(x),source:d.source,snapshot,ruleSet,week:weekDto(x,w,String(snapshot.status)==='published'?'published':'locked'),versions:history.map(h=>({id:h.id,versionNo:h.revision,status:h.status==='READY'?'locked':String(h.status).toLowerCase(),publishedAt:h.published_at?iso(h.published_at as Date):null,adjustmentNote:null})),diff:prior?snapshot.rows.filter(r=>prior.rows.find(o=>o.studentId===r.studentId)?.total!==r.total).map(r=>({studentId:r.studentId,studentName:r.studentName,before:prior.rows.find(o=>o.studentId===r.studentId)?.total??null,after:r.total})):[],lockedByName:await actor(snapshot.lockedBy),publishedByName:await actor(snapshot.publishedBy),className:x.cls.name,canRequestAdjustment:pub.status==='PUBLISHED'&&can(x,'conduct.adjust.request',String(w.starts_on)),pendingAdjustments:Number((await one<Row>(tx,"SELECT count(*)::int AS n FROM app.adjustment_requests WHERE school_id=$1 AND baseline_publication_id=$2 AND status IN ('SUBMITTED','APPROVED')",[x.s,pub.id]))!.n)}};
 }
 if(Object.keys(c.query).some(k=>!(op==='getConductWorkspaceRecords'?['studentId']:[]).includes(k)))throw new Problem(422,'INVALID_QUERY');
 const w=await week(tx,x,c.params.weekId!),d=await selected(tx,x,w),source=d.source,ruleSet=await setView(tx,x,d),period={status:status(d),lockedAt:d.p?.locked_at?iso(d.p.locked_at as Date):null,lockedByName:d.p?.locked_by?(await one<Row>(tx,'SELECT work_display_name FROM app.memberships WHERE school_id=$1 AND user_id=$2',[x.s,d.p.locked_by]))?.work_display_name??null:null};
 if(op==='getConductWorkspaceRecords'){
  const records=visibleRecords(x,d);return {data:{...scope(x),today:x.today,source,records:records.filter(r=>!c.query.studentId||d.enrollments.some(e=>e.id===r.enrollment_id&&e.student_id===c.query.studentId)).map(r=>recordView(x,d,r,records)),roster:d.enrollments.map(e=>({id:e.student_id,enrollmentId:e.id,fullName:e.full_name,code:e.student_code,startsOn:e.starts_on,endsOn:e.ends_on??null})),ruleSet,week:weekDto(x,w,status(d)),period,canRecord:status(d)==='open'&&(can(x,'conduct.record',String(w.starts_on))||d.lessons.some(l=>can(x,'conduct.record',String(l.date),l))),isReviewer:can(x,'conduct.review',String(w.starts_on)),lessons:d.lessons.filter(l=>can(x,'conduct.read',String(l.date),l)).map(l=>({id:l.id,date:l.date,subjectId:l.subject_id,subject:l.subject_name,start:iso(l.starts_at as Date),end:iso(l.ends_at as Date),canRecord:can(x,'conduct.record',String(l.date),l)}))}};
 }
 if(op==='getConductWorkspaceSummary'){
  if(!d.set)throw new Problem(422,'RULE_SET_NOT_APPLIED');const broad=can(x,'conduct.read',String(w.starts_on)),snap=broad&&d.pub&&d.p?.status==='LOCKED'?await snapshotView(tx,x,d.pub):null;
  return {data:{...scope(x),today:x.today,source,week:weekDto(x,w,status(d)),period,ruleSet,snapshot:snap,rows:broad?(snap?.rows??rowsFor(d.set,d.config.thresholds,d.enrollments,d.records)):[],preview:broad?rowsFor(d.set,d.config.thresholds,d.enrollments,d.records,true):[],summaryAvailable:broad,checks:broad?await checks(tx,x,d,service):{pending:0,duplicates:0,blocking:[],warnings:[]},perms:{lock:broad&&can(x,'conduct.lock',String(w.starts_on)),publish:broad&&can(x,'conduct.publish',String(w.starts_on)),review:broad&&can(x,'conduct.review',String(w.starts_on))},policy:null}};
 }
 checkSource(d,c.body.source);mutable(x);
 const receipt=async(changed=0,id?:string)=>{const next=await selected(tx,x,w),r=id?next.records.find(r=>r.id===id):undefined;return {data:{source:next.source,changed,status:status(next),record:r?recordView(x,next,r):null,snapshot:next.pub&&next.p?.status==='LOCKED'?await snapshotView(tx,x,next.pub):null}};};
 if(op==='createConductWorkspaceRecord'){
  const e=d.enrollments.find(e=>e.id===c.body.enrollmentId&&e.student_id===c.body.studentId&&String(e.starts_on)<=String(c.body.date)&&(!e.ends_on||String(e.ends_on)>String(c.body.date)));if(!e)validation('studentId','Học sinh không thuộc lớp tại ngày này');
  const rule=d.config.rules.find(r=>r.id===c.body.ruleId);if(!rule)validation('ruleId','Không thuộc nội quy đã cố định cho tuần');if(rule.attendance_status)validation('ruleId','Quy định này phải được liên kết từ bảng điểm danh');
  const twin=d.records.find(r=>r.enrollment_id===e.id&&r.rule_id===rule.id&&r.date===c.body.date&&r.status!=='EXCLUDED');
  if(twin&&!c.body.confirmDistinct)throw new Problem(409,'POSSIBLE_DUPLICATE');if(twin&&c.body.confirmDistinct)reason(c.body.distinctNote);if(!twin&&c.body.confirmDistinct)validation('confirmDistinct','Không có ghi nhận trùng để xác nhận');
  const p0=await ensurePeriod(tx,x,d),lesson=c.body.lessonId?d.lessons.find(l=>l.id===c.body.lessonId):undefined;
  const at=lesson?.starts_at??(await one<{at:Date}>(tx,"SELECT least(($2::date+time '12:00') AT TIME ZONE timezone,now()) AS at FROM platform.schools WHERE id=$1",[x.s,c.body.date]))!.at;
  if(lesson&&lesson.date!==c.body.date)validation('lessonId','Tiết học không đúng ngày');
  const body={periodId:p0.id,enrollmentId:e.id,ruleId:rule.id,publicReason:c.body.reason,occurredAt:iso(at as Date),sourceKind:'MANUAL',clientEventId:c.body.requestId,...(lesson?{lessonId:lesson.id}:{}),...(c.body.manualDelta!==null?{manualDelta:points(String(c.body.manualDelta))}:{})};
  const row=await service.insertRecord(tx,c,body);if(twin)await tx.query('UPDATE app.conduct_records SET distinct_note=$3 WHERE school_id=$1 AND id=$2',[x.s,row.id,reason(c.body.distinctNote)]);await audit(tx,c,'conductRecord',String(row.id),{sourceKind:'MANUAL'});return {...await receipt(1,String(row.id)),status:201};
 }
 if(op==='updateConductWorkspaceRecord'){
  if(!d.p)throw new Problem(404,'RESOURCE_NOT_FOUND');periodWritable(d.p);const old=visibleRecords(x,d).find(r=>r.id===c.params.recordId);if(!old)throw new Problem(404,'RESOURCE_NOT_FOUND');version(old,c.body.version);if(old.status!=='DRAFT')throw new Problem(409,'RECORD_REVIEWED');
  if(old.rule_id!==c.body.ruleId)validation('ruleId','Tạo sự kiện mới để thay quy định của ghi nhận');const rule=d.config.rules.find(r=>r.id===old.rule_id)!;
  const delta=c.body.manualDelta===null?old.delta_snapshot:ruleDelta(rule,points(String(c.body.manualDelta)));await tx.query('UPDATE app.conduct_records SET public_reason=$3,delta_snapshot=$4 WHERE school_id=$1 AND id=$2',[x.s,old.id,c.body.reason,delta]);await audit(tx,c,'conductRecord',String(old.id));return receipt(1,String(old.id));
 }
 if(op==='reviewConductWorkspaceRecords'){
  if(!d.p)throw new Problem(404,'RESOURCE_NOT_FOUND');if(d.p.status==='LOCKED')throw new Problem(409,'PERIOD_LOCKED');const batch=c.body.records as {id:string;version:number}[];if(new Set(batch.map(r=>r.id)).size!==batch.length)validation('records','Ghi nhận bị trùng');
  for(const item of batch){const r=d.records.find(r=>r.id===item.id);if(!r)throw new Problem(404,'RESOURCE_NOT_FOUND');requireAction(x,'conduct.review',String(r.date));version(r,item.version);if(c.body.decision==='approve'){if(r.status!=='DRAFT')throw new Problem(409,'INVALID_STATE');await service.validateCurrentSource(tx,r);}else if(r.status==='EXCLUDED'||c.body.decision==='reject'&&r.status!=='DRAFT')throw new Problem(409,'INVALID_STATE');}
  const note=c.body.decision==='approve'?null:reason(c.body.note);
  for(const item of batch){if(c.body.decision==='approve')await tx.query("UPDATE app.conduct_records SET status='APPROVED',approved_by=$3,approved_at=now() WHERE school_id=$1 AND id=$2",[x.s,item.id,x.userId]);else await tx.query("UPDATE app.conduct_records SET status='EXCLUDED',exclusion_reason=$3,review_decision=CASE WHEN $4='reject' THEN $4 ELSE review_decision END WHERE school_id=$1 AND id=$2",[x.s,item.id,note,c.body.decision]);await audit(tx,c,'conductRecord',item.id,{decision:c.body.decision});}return receipt(batch.length);
 }
 if(op==='reopenConductWorkspaceWeek'){
  if(!d.p||d.p.status!=='LOCKED'||!d.pub||d.pub.status!=='READY')throw new Problem(409,'PERIOD_NOT_REOPENABLE');
  if(await one(tx,"SELECT id FROM app.publication_revisions WHERE school_id=$1 AND conduct_period_id=$2 AND status IN ('PUBLISHED','SUPERSEDED','WITHDRAWN') AND published_at IS NOT NULL",[x.s,d.p.id]))throw new Problem(409,'PUBLISHED_PERIOD_IMMUTABLE');
  await tx.query("UPDATE app.publication_revisions SET status='WITHDRAWN',withdrawn_at=now() WHERE school_id=$1 AND conduct_period_id=$2 AND status='READY'",[x.s,d.p.id]);await tx.query("UPDATE app.conduct_periods SET status='OPEN',locked_at=NULL,locked_by=NULL WHERE school_id=$1 AND id=$2",[x.s,d.p.id]);await audit(tx,c,'conductPeriod',String(d.p.id),{reopened:true,reason:reason(c.body.reason)});return receipt();
 }
 if(op==='publishConductWorkspaceWeek'){
  if(!d.p||d.p.status!=='LOCKED'||!d.pub||d.pub.status!=='READY')throw new Problem(409,'PERIOD_NOT_LOCKED');const own={...c,body:{...c.body,expectedPublicationId:d.source.publicationId}};await service.publish(tx,own,d.p);return receipt();
 }
 const review=await checks(tx,x,d,service);if(review.blocking.length)throw new Problem(422,'REVIEW_BLOCKED');if(String(w.starts_on)>x.today)validation('weekId','Tuần chưa bắt đầu');if(d.p?.status==='LOCKED')throw new Problem(409,'PERIOD_LOCKED');
 const p0=await ensurePeriod(tx,x,d);await tx.query("UPDATE app.conduct_periods SET status='LOCKED',locked_at=now(),locked_by=$3 WHERE school_id=$1 AND id=$2",[x.s,p0.id,x.userId]);const locked=await conductPeriod(tx,x.s,x.c,String(p0.id));
 if(c.body.alsoPublish)await service.publish(tx,{...c,body:{...c.body,expectedPublicationId:source.publicationId}},locked);else{const revision=(await one<Row>(tx,'SELECT coalesce(max(revision),0)+1 AS n FROM app.publication_revisions WHERE school_id=$1 AND conduct_period_id=$2',[x.s,p0.id]))!.n,data=await publicConductItems(tx,locked,Number(revision));await publications.create(tx,c,{kind:'CONDUCT',id:String(p0.id),schoolId:x.s,classId:x.c,yearId:x.y,version:Number(locked.data_version)},data.snapshot,data.items,false);}
 await audit(tx,c,'conductPeriod',String(p0.id),{status:'LOCKED'});return receipt();
}
