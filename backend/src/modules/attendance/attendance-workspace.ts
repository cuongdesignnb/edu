import crypto from 'node:crypto';
import {Database,one,iso,type Transaction,type Row} from '../../database/database';
import {Permissions,grantAllows,type Grant} from '../../common/permissions';
import {Commands,canonical} from '../../common/commands';
import {Problem,notFound,validation} from '../../common/problem';
import type {RequestContext,Result} from '../../api.router';

const statuses=['PRESENT','LATE','EXCUSED','UNEXCUSED','UNMARKED'] as const;
const add=(day:string,n:number)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const monday=(day:string)=>add(day,-((new Date(day+'T00:00:00Z').getUTCDay()+6)%7));
type Context={schoolId:string;yearId:string;classId:string;date:string;today:string;cls:Row;grants:Grant[];userId:string};
async function context(tx:Transaction,policy:Permissions,c:RequestContext,date:string):Promise<Context>{
 const schoolId=c.params.schoolId!,yearId=c.params.yearId!,classId=c.params.classId!;
 const access=await policy.require(tx,c.principal!,'class.read+student.read',{schoolId,yearId,classId,date,allowSubject:true});
 const cls=await one<Row>(tx,`SELECT cl.*,y.starts_on,y.ends_on,y.status AS year_status FROM app.classes cl JOIN app.academic_years y ON y.school_id=cl.school_id AND y.id=cl.year_id WHERE cl.school_id=$1 AND cl.id=$2 AND cl.year_id=$3`,[schoolId,classId,yearId]);if(!cls)notFound();
 if(date<String(cls.starts_on)||date>=String(cls.ends_on))validation('date','Ngày phải nằm trong năm học');
 return {schoolId,yearId,classId,date,today:access.today,cls,grants:access.grants,userId:c.principal!.userId};
}
function can(ctx:Context,action:string,lesson?:Row){return ctx.grants.some(g=>grantAllows(g,action,{schoolId:ctx.schoolId,yearId:ctx.yearId,classId:ctx.classId,date:ctx.date},ctx.today)||!!lesson&&lesson.user_id===ctx.userId&&grantAllows(g,action,{schoolId:ctx.schoolId,yearId:ctx.yearId,classId:ctx.classId,date:ctx.date,subjectId:String(lesson.subject_id),allowSubject:true},ctx.today));}
async function lessons(tx:Transaction,ctx:Context){
 const values=(await tx.query<Row>(`SELECT l.*,m.user_id,sub.name AS subject_name,to_char(l.starts_at AT TIME ZONE s.timezone,'HH24:MI') AS starts_at_local,to_char(l.ends_at AT TIME ZONE s.timezone,'HH24:MI') AS ends_at_local,
  EXISTS(SELECT 1 FROM app.teaching_assignments a WHERE a.school_id=l.school_id AND a.class_id=l.class_id AND a.member_id=l.member_id AND a.subject_id=l.subject_id AND a.kind='SUBJECT' AND a.revoked_at IS NULL AND a.starts_on<=$3::date AND (a.ends_on IS NULL OR a.ends_on>$3::date)) AS assigned
  FROM app.lesson_occurrences l JOIN platform.schools s ON s.id=l.school_id JOIN app.memberships m ON m.school_id=l.school_id AND m.id=l.member_id JOIN app.subjects sub ON sub.school_id=l.school_id AND sub.id=l.subject_id
  WHERE l.school_id=$1 AND l.class_id=$2 AND l.starts_at>=($3::date::timestamp AT TIME ZONE s.timezone) AND l.starts_at<(($3::date+1)::timestamp AT TIME ZONE s.timezone) ORDER BY l.starts_at,l.id LIMIT 101`,[ctx.schoolId,ctx.classId,ctx.date])).rows;
 if(values.length>100)throw new Problem(422,'ATTENDANCE_LESSON_LIMIT');return values.filter(l=>can(ctx,'attendance.read',l));
}
function lessonDto(l:Row){return {id:l.id,period:l.period_number??null,subject:l.subject_name,start:l.starts_at_local,end:l.ends_at_local,status:l.status};}
async function selected(tx:Transaction,ctx:Context,slot:string){
 const all=await lessons(tx,ctx);let lesson:Row|undefined;
 if(slot!=='morning'&&slot!=='afternoon'){
  const matches=slot.startsWith('lesson-')?all.filter(l=>l.id===slot.slice(7)):all.filter(l=>l.period_number===Number(slot.slice(7)));
  if(matches.length>1)throw new Problem(409,'ATTENDANCE_LESSON_AMBIGUOUS');lesson=matches[0];if(!lesson)notFound();
 }
 if(!can(ctx,'attendance.read',lesson))notFound();
 const sources=(await tx.query<Row>(`SELECT a.*,m.work_display_name AS actor_name FROM app.attendance_sessions a LEFT JOIN app.memberships m ON m.school_id=a.school_id AND m.user_id=a.created_by
  WHERE a.school_id=$1 AND a.class_id=$2 AND a.year_id=$3 AND a.session_date=$4 AND ${lesson?'a.lesson_id=$5 AND a.granularity=\'LESSON\'':"a.granularity='DAILY' AND a.slot_key=ANY($5::text[])"} ORDER BY a.id LIMIT 3`,[ctx.schoolId,ctx.classId,ctx.yearId,ctx.date,lesson?lesson.id:slot==='morning'?['morning','daily']:['afternoon']])).rows;
 if(sources.length>1)throw new Problem(409,'ATTENDANCE_SOURCE_AMBIGUOUS');const session=sources[0];
 const pub=session?await one<Row>(tx,"SELECT id,source_version,published_at FROM app.publication_revisions WHERE school_id=$1 AND attendance_session_id=$2 AND status='PUBLISHED'",[ctx.schoolId,session.id]):undefined;
 return {all,lesson,session,pub};
}
async function roster(tx:Transaction,ctx:Context,sessionId?:unknown){
 const rows=(await tx.query<Row>(`SELECT e.id AS enrollment_id,e.version AS enrollment_version,e.starts_on,e.ends_on,e.status AS enrollment_status,s.id AS student_id,s.student_code AS code,s.full_name,
  g.name AS group_name,r.id AS record_id,r.version AS record_version,coalesce(r.status,'UNMARKED') AS status,r.public_note,
  EXISTS(SELECT 1 FROM app.audit_events ae WHERE ae.school_id=e.school_id AND ae.target_type='attendanceRecord' AND ae.target_id=r.id) AS edited
  FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id
  LEFT JOIN app.attendance_records r ON r.school_id=e.school_id AND r.enrollment_id=e.id AND r.session_id=$5
  LEFT JOIN LATERAL(SELECT cg.name FROM app.group_memberships gm JOIN app.class_groups cg ON cg.school_id=gm.school_id AND cg.id=gm.group_id WHERE gm.school_id=e.school_id AND gm.class_id=e.class_id AND gm.enrollment_id=e.id AND gm.cancelled_at IS NULL AND gm.starts_on<=$4 AND (gm.ends_on IS NULL OR gm.ends_on>$4) ORDER BY cg.sort_order,cg.id LIMIT 1) g ON true
  WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4) ORDER BY s.full_name COLLATE app.vi_names,s.id LIMIT 5001`,[ctx.schoolId,ctx.classId,ctx.yearId,ctx.date,sessionId??null])).rows;
 if(rows.length>5000)throw new Problem(422,'CLASS_ROSTER_LIMIT');if(new Set(rows.map(r=>r.student_id)).size!==rows.length)throw new Problem(409,'CLASS_ROSTER_AMBIGUOUS');
 return rows;
}
function source(ctx:Context,rows:Row[],session?:Row,pub?:Row){return {classVersion:Number(ctx.cls.version),rosterHash:crypto.createHash('sha256').update(canonical(rows.map(r=>({id:r.enrollment_id,version:r.enrollment_version,startsOn:r.starts_on,endsOn:r.ends_on,status:r.enrollment_status})).sort((a,b)=>String(a.id).localeCompare(String(b.id))))).digest('hex'),sessionId:session?.id??null,version:session?Number(session.version):null,dataVersion:session?Number(session.data_version):null,publicationId:pub?.id??null};}
const sessionState=(s?:Row,p?:Row)=>!s?'none':s.status==='OPEN'?'open':p&&p.source_version===s.data_version?'published':'locked';
async function sheet(tx:Transaction,ctx:Context,slot:string){
 const picked=await selected(tx,ctx,slot),{session,pub,lesson}=picked,rows=await roster(tx,ctx,session?.id);
 const holidays=(await tx.query<Row>("SELECT title FROM app.calendar_events WHERE school_id=$1 AND year_id=$2 AND kind='HOLIDAY' AND starts_on<=$3 AND ends_on>$3 AND (class_id IS NULL OR class_id=$4) ORDER BY id",[ctx.schoolId,ctx.yearId,ctx.date,ctx.classId])).rows;
 const holiday=holidays.length?holidays.map(h=>h.title).join(' · '):null,week=await one<Row>(tx,'SELECT * FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 AND starts_on<=$3 AND ends_on>$3',[ctx.schoolId,ctx.yearId,ctx.date]);
 const canConduct=can(ctx,'conduct.read',lesson),period=canConduct&&week?await one<Row>(tx,'SELECT status FROM app.conduct_periods WHERE school_id=$1 AND class_id=$2 AND week_id=$3',[ctx.schoolId,ctx.classId,week.id]):undefined;
 const linked=canConduct&&session?(await tx.query<Row>("SELECT cr.id,cr.source_id,cr.delta_snapshot,cr.status FROM app.conduct_records cr JOIN app.attendance_records r ON r.school_id=cr.school_id AND r.id=cr.source_id WHERE cr.school_id=$1 AND cr.class_id=$2 AND r.session_id=$3 AND cr.source_kind='ATTENDANCE' AND cr.status<>'EXCLUDED' AND ($4::boolean OR cr.recorded_by=$5) ORDER BY cr.id LIMIT 5001",[ctx.schoolId,ctx.classId,session.id,can(ctx,'conduct.read'),ctx.userId])).rows:[];
 if(linked.length>5000)throw new Problem(422,'ATTENDANCE_LINK_LIMIT');
 const rules=canConduct&&can(ctx,'conduct.record',lesson)?(await tx.query<Row>(`SELECT r.attendance_status,r.label,r.default_delta AS delta FROM app.class_rule_periods cp JOIN app.conduct_rules r ON r.school_id=cp.school_id AND r.rule_set_id=cp.rule_set_id WHERE cp.school_id=$1 AND cp.class_id=$2 AND cp.starts_on<=$3 AND (cp.ends_on IS NULL OR cp.ends_on>$3) AND r.attendance_status IN ('LATE','UNEXCUSED') ORDER BY r.attendance_status`,[ctx.schoolId,ctx.classId,ctx.date])).rows:[];
 const locked=session?.status==='LOCKED',published=sessionState(session,pub)==='published';
 const canRecord=can(ctx,'attendance.record',lesson)&&ctx.cls.status!=='ARCHIVED'&&ctx.cls.year_status!=='ARCHIVED'&&ctx.date<=ctx.today&&!holiday&&new Date(ctx.date+'T00:00:00Z').getUTCDay()!==0&&(!lesson||lesson.status==='SCHEDULED'&&lesson.assigned)&&(!locked||can(ctx,'attendance.reopen',lesson)&&(!published||can(ctx,'attendance.publish',lesson)));
 const tally={PRESENT:0,LATE:0,EXCUSED:0,UNEXCUSED:0,UNMARKED:0};for(const r of rows){if(!statuses.includes(r.status as typeof statuses[number]))throw new Problem(500,'ATTENDANCE_SOURCE_INVALID');tally[r.status as keyof typeof tally]++;}
 return {schoolId:ctx.schoolId,yearId:ctx.yearId,classId:ctx.classId,date:ctx.date,slot,today:ctx.today,className:String(ctx.cls.name),source:source(ctx,rows,session,pub),session:session?{id:session.id,version:session.version,dataVersion:session.data_version,updatedAt:iso(session.updated_at as Date),publishedAt:published?iso(pub!.published_at as Date):null,locked:!!locked}:null,sessionStatus:sessionState(session,pub),
  rows:rows.map(r=>({studentId:r.student_id,enrollmentId:r.enrollment_id,recordVersion:r.record_version??null,code:r.code,fullName:r.full_name,groupName:r.group_name??null,status:r.status,note:r.public_note??'',edited:!!r.edited,linkedConduct:linked.find(l=>l.source_id===r.record_id)?{id:linked.find(l=>l.source_id===r.record_id)!.id,points:Number(linked.find(l=>l.source_id===r.record_id)!.delta_snapshot),status:linked.find(l=>l.source_id===r.record_id)!.status}:null})),counts:tally,
  lessons:picked.all.map(lessonDto),lesson:lesson?lessonDto(lesson):null,canRecord,canPublish:can(ctx,'attendance.publish',lesson)&&ctx.cls.status!=='ARCHIVED'&&ctx.cls.year_status!=='ARCHIVED'&&!holiday&&ctx.date<=ctx.today,canLink:can(ctx,'conduct.record',lesson),holiday,isSunday:new Date(ctx.date+'T00:00:00Z').getUTCDay()===0,updatedByName:session?.actor_name??null,week:week?{id:week.id,index:week.week_number}:null,periodLocked:!!period&&period.status!=='OPEN',linkRules:rules.map(r=>({link:r.attendance_status,label:r.label,points:Number(r.delta)}))};
}

export async function attendanceWorkspace(db:Database,policy:Permissions,c:RequestContext):Promise<Result>{return db.transaction(async tx=>{
 const access=await policy.require(tx,c.principal!,'class.read',{schoolId:c.params.schoolId!,yearId:c.params.yearId!,classId:c.params.classId!,allowSubject:true});
 if(c.operation.id==='getClassAttendanceWeek'){
  const year=await one<Row>(tx,'SELECT starts_on,ends_on FROM app.academic_years WHERE school_id=$1 AND id=$2',[c.params.schoolId,c.params.yearId]);if(!year)notFound();
  const reference=access.today<String(year.starts_on)?String(year.starts_on):access.today>=String(year.ends_on)?add(String(year.ends_on),-1):access.today,m=c.query.weekStart??monday(reference);if(m!==monday(m))validation('weekStart','Chọn ngày thứ Hai');
  const days=[],byStudent=new Map<string,{studentId:string;code:string;fullName:string;cells:{status:string;note:string;edited:boolean}[]}>();let week=null;
  for(let i=0;i<6;i++){
   const date=add(m,i);if(date<String(year.starts_on)||date>=String(year.ends_on)){days.push({date,sessionStatus:'outside_year',holiday:null,periodSessions:0});continue;}
   const ctx=await context(tx,policy,c,date),s=await sheet(tx,ctx,'morning');week??=s.week;
   const count=(await one<{n:number}>(tx,"SELECT count(*)::int AS n FROM app.attendance_sessions WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND session_date=$4 AND granularity='LESSON'",[ctx.schoolId,ctx.classId,ctx.yearId,date]))!.n;
   days.push({date,sessionStatus:date>ctx.today?'future':s.sessionStatus,holiday:s.holiday,periodSessions:count});
   for(const r of s.rows){let row=byStudent.get(String(r.studentId));if(!row){row={studentId:String(r.studentId),code:String(r.code),fullName:String(r.fullName),cells:Array.from({length:6},()=>({status:'not_enrolled',note:'',edited:false}))};byStudent.set(row.studentId,row);}row.cells[i]={status:s.holiday?'holiday':date>ctx.today?'future':String(r.status),note:date>ctx.today||s.holiday?'':String(r.note),edited:date>ctx.today||!!s.holiday?false:r.edited};}
  }
  return {data:{schoolId:c.params.schoolId,yearId:c.params.yearId,classId:c.params.classId,monday:m,today:access.today,week,days,rows:[...byStudent.values()].sort((a,b)=>a.fullName.localeCompare(b.fullName,'vi')||a.studentId.localeCompare(b.studentId)).map(r=>({...r,tally:Object.fromEntries(statuses.map(status=>[status,r.cells.filter(cell=>cell.status===status).length]))}))}};
 }
 const ctx=await context(tx,policy,c,c.query.date!),slot=c.query.slot??'morning';
 if(c.operation.id==='getClassAttendanceSlots'){
  const all=await lessons(tx,ctx),holiday=await one(tx,"SELECT id FROM app.calendar_events WHERE school_id=$1 AND year_id=$2 AND kind='HOLIDAY' AND starts_on<=$3 AND ends_on>$3 AND (class_id IS NULL OR class_id=$4)",[ctx.schoolId,ctx.yearId,ctx.date,ctx.classId]),writable=ctx.cls.status!=='ARCHIVED'&&ctx.cls.year_status!=='ARCHIVED'&&ctx.date<=ctx.today&&!holiday&&new Date(ctx.date+'T00:00:00Z').getUTCDay()!==0;
  if(!can(ctx,'attendance.read')&&!all.length&& !ctx.grants.some(g=>grantAllows(g,'attendance.read',{schoolId:ctx.schoolId,classId:ctx.classId,date:ctx.date,allowSubject:true},ctx.today)))notFound();
  return {data:{schoolId:ctx.schoolId,yearId:ctx.yearId,classId:ctx.classId,date:ctx.date,slots:[...(can(ctx,'attendance.read')?['morning','afternoon'].map(s=>({slot:s,label:s==='morning'?'Buổi sáng (cả buổi)':'Buổi chiều (cả buổi)',canRecord:writable&&can(ctx,'attendance.record')})):[]),...all.map(l=>({slot:l.period_number&&all.filter(a=>a.period_number===l.period_number).length===1?`period-${l.period_number}`:`lesson-${l.id}`,label:`${l.period_number?`Tiết ${l.period_number}`:'Tiết học'} – ${l.subject_name}${l.status==='SCHEDULED'?'':' (nghỉ)'}`,canRecord:writable&&l.status==='SCHEDULED'&&!!l.assigned&&can(ctx,'attendance.record',l)}))]}};
 }
 const data=await sheet(tx,ctx,slot);if(c.operation.id==='getClassAttendanceSheet')return {data};
 const pupil=data.rows.find(r=>r.studentId===c.params.studentId);if(!pupil)notFound();
 const history=(await tx.query<Row>(`SELECT a.id,a.created_at,a.reason,a.redacted_after,m.work_display_name AS actor_name FROM app.audit_events a JOIN app.attendance_records r ON r.school_id=a.school_id AND r.id=a.target_id LEFT JOIN app.memberships m ON m.school_id=a.school_id AND m.user_id=a.actor_user_id WHERE a.school_id=$1 AND a.target_type='attendanceRecord' AND r.session_id=$2 AND r.enrollment_id=$3 ORDER BY a.created_at DESC,a.id DESC LIMIT 2001`,[ctx.schoolId,data.session?.id??null,pupil.enrollmentId])).rows;
 if(history.length>2000)throw new Problem(422,'ATTENDANCE_HISTORY_LIMIT');
 return {data:{schoolId:ctx.schoolId,yearId:ctx.yearId,classId:ctx.classId,studentId:pupil.studentId,studentName:pupil.fullName,code:pupil.code,date:ctx.date,slot,status:pupil.status,note:pupil.note,sessionStatus:data.sessionStatus,publishedAt:data.session?.publishedAt??null,linkedConduct:pupil.linkedConduct?[{...pupil.linkedConduct,reason:null}]:[],history:history.map(h=>({id:h.id,at:iso(h.created_at as Date),byName:h.actor_name??null,from:(h.redacted_after as Row).from,to:(h.redacted_after as Row).to,reason:h.reason??null}))}};
 },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});}

export async function attendanceWorkspaceCommand(db:Database,policy:Permissions,commands:Commands,apply:(tx:Transaction,c:RequestContext)=>Promise<Result>,c:RequestContext){
 const authorized=async(tx:Transaction)=>{const ctx=await context(tx,policy,c,String(c.body.date)),picked=await selected(tx,ctx,String(c.body.slot));if(!can(ctx,c.operation.id==='publishClassAttendanceSheet'?'attendance.publish':'attendance.record',picked.lesson))notFound();
  if(c.operation.id==='saveClassAttendanceSheet'&&picked.session?.status==='LOCKED'&&(!can(ctx,'attendance.reopen',picked.lesson)||sessionState(picked.session,picked.pub)==='published'&&!can(ctx,'attendance.publish',picked.lesson)))notFound();return ctx;};
 return commands.execute(c,authorized,async tx=>{
  const ctx=await authorized(tx),slot=String(c.body.slot),picked=await selected(tx,ctx,slot),rows=await roster(tx,ctx,picked.session?.id),expected=c.body.source;
  if(canonical(expected)!==canonical(source(ctx,rows,picked.session,picked.pub)))throw new Problem(409,'ATTENDANCE_SOURCE_CHANGED');
  const snapshot=await sheet(tx,ctx,slot),publish=c.operation.id==='publishClassAttendanceSheet';
  if(publish?!snapshot.canPublish:!snapshot.canRecord)throw new Problem(409,'ATTENDANCE_READ_ONLY');
  const invoke=(id:string,body:Record<string,unknown>,sessionId?:unknown)=>apply(tx,{...c,operation:{...c.operation,id,permission:id==='reopenAttendance'?'attendance.reopen':id==='publishAttendance'?'attendance.publish':'attendance.record'},params:{...c.params,...(sessionId?{sessionId:String(sessionId)}:{})},body});
  let session=picked.session,changed=0;const republish=sessionState(session,picked.pub)==='published';
  if(!publish){
   const entries=c.body.entries as {studentId:string;recordVersion:number|null;status:string;note:string}[];
   if(new Set(entries.map(e=>e.studentId)).size!==entries.length)validation('entries','Học sinh bị trùng');
   for(const entry of entries){const row=rows.find(r=>r.student_id===entry.studentId);if(!row)validation('entries','Học sinh không thuộc danh sách đã chọn');if(entry.recordVersion!==(row.record_version??null))throw new Problem(409,'VERSION_CONFLICT');}
   if(session?.status==='LOCKED'){if(typeof c.body.reason!=='string'||c.body.reason.trim().length<5)validation('reason','Ghi lý do tối thiểu 5 ký tự');await invoke('reopenAttendance',{expectedVersion:session.version,reason:c.body.reason},session.id);session=await one<Row>(tx,'SELECT * FROM app.attendance_sessions WHERE school_id=$1 AND id=$2',[ctx.schoolId,session.id]);}
   if(!session){const created=await invoke('createAttendanceSession',{date:ctx.date,granularity:picked.lesson?'LESSON':'DAILY',...(picked.lesson?{lessonId:picked.lesson.id}:{slot:slot==='afternoon'?'AFTERNOON':'MORNING'})});session=await one<Row>(tx,'SELECT * FROM app.attendance_sessions WHERE school_id=$1 AND id=$2',[ctx.schoolId,(created.data as Row).id]);}
   // New dated enrollments shown in the accepted roster enter as UNMARKED; old records/history remain intact.
   await tx.query(`INSERT INTO app.attendance_records(school_id,class_id,session_id,enrollment_id,recorded_by)
    SELECT $1,$2,$3,e.id,$4 FROM app.enrollments e WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$5 AND e.status<>'CANCELLED' AND e.starts_on<=$6 AND (e.ends_on IS NULL OR e.ends_on>$6)
    AND NOT EXISTS(SELECT 1 FROM app.attendance_records r WHERE r.school_id=e.school_id AND r.session_id=$3 AND r.enrollment_id=e.id) ORDER BY e.id`,[ctx.schoolId,ctx.classId,session!.id,ctx.userId,ctx.yearId,ctx.date]);
   session=await one<Row>(tx,'SELECT * FROM app.attendance_sessions WHERE school_id=$1 AND id=$2',[ctx.schoolId,session!.id]);
   const current=await roster(tx,ctx,session!.id),records=entries.filter(e=>{const r=current.find(r=>r.student_id===e.studentId)!;return r.status!==e.status||(r.public_note??'')!==e.note;}).map(e=>{const r=current.find(r=>r.student_id===e.studentId)!;return {enrollmentId:r.enrollment_id,expectedVersion:r.record_version,status:e.status,publicNote:e.note};});changed=records.length;
   let sync={created:0,excluded:0,blocked:[] as {enrollmentId:string;code:string}[]};if(records.length){const saved=await invoke('saveAttendanceRecords',{expectedVersion:session!.version,records,linkConduct:c.body.linkConduct===true,reason:c.body.reason},session!.id);sync=(saved.data as Row).conductSync as typeof sync;}
   session=await one<Row>(tx,'SELECT * FROM app.attendance_sessions WHERE school_id=$1 AND id=$2',[ctx.schoolId,session!.id]);
   if(republish)await invoke('publishAttendance',{expectedSourceVersion:session!.data_version,expectedPublicationId:picked.pub?.id??null},session!.id);
   return {data:{sessionId:session!.id,changed,linkedCreated:sync.created,linkedVoided:sync.excluded,blockedLinks:sync.blocked.map(b=>({studentId:rows.find(r=>r.enrollment_id===b.enrollmentId)?.student_id??null,code:b.code})),source:(await sheet(tx,ctx,slot)).source}};
  }
  if(!session)validation('source','Chưa có bản lưu để công bố');await invoke('publishAttendance',{expectedSourceVersion:session.data_version,expectedPublicationId:picked.pub?.id??null},session.id);
  return {data:{sessionId:session.id,changed:0,linkedCreated:0,linkedVoided:0,blockedLinks:[],source:(await sheet(tx,ctx,slot)).source}};
 });
}
