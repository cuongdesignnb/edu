import {Database,one,iso,type Row,type Transaction} from '../../database/database';
import {Permissions} from '../../common/permissions';
import {Commands,audit} from '../../common/commands';
import {Problem,notFound,validation} from '../../common/problem';
import {PublicationsService,type ParentItem} from '../publications/publications.service';
import {timetableDto,lessonResource,validateEntries} from './schedule-data';
import {dto} from '../../database/resources';
import {nextDay} from './class-duty-workspace';
import {scheduleContext,schedulePublication,currentLesson,changeView,changeSelect,scheduleLimit,type ScheduleContext} from './schedule-workspace';
import type {RequestContext,Result} from '../../api.router';

type Source={lessonId:string;lessonVersion:number;draftId:string|null;draftVersion:number|null};
type ChangeInput={classId:string;date:string;period:number;kind?:string;subjectId:string|null;teacherMembershipId:string|null;roomId:string|null;reason?:string;source?:Source;publish?:boolean;expectedPublicationId?:string|null};
export type LessonConflict={kind:'teacher'|'room'|'inactive'|'assignment'|'history';message:string};
export function assertLessonSource(lesson:Row|undefined,source:Source){if(!lesson||lesson.id!==source.lessonId||Number(lesson.version)!==source.lessonVersion)throw new Problem(409,'STALE_SOURCE');}
function assertChangeVersion(change:Row,expected:unknown){if(change.version!==expected)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(change.version));}
async function sourceUnused(tx:Transaction,ctx:ScheduleContext,lesson:Row){
 const used=await one<Row>(tx,`SELECT l.id FROM app.lesson_occurrences l WHERE l.school_id=$1 AND l.id=$2 AND (
  EXISTS(SELECT 1 FROM app.attendance_sessions a WHERE a.school_id=l.school_id AND a.lesson_id=l.id)
  OR EXISTS(SELECT 1 FROM app.conduct_records r WHERE r.school_id=l.school_id AND r.lesson_id=l.id AND r.status<>'EXCLUDED'))`,[ctx.schoolId,lesson.id]);
 return !used;
}
async function candidate(tx:Transaction,ctx:ScheduleContext,input:ChangeInput,lesson:Row){
 const subjectId=input.subjectId??String(lesson.subject_id),memberId=input.teacherMembershipId??String(lesson.member_id),roomId=input.roomId??lesson.room_id as string|null;
 const times=await one<Row>(tx,"SELECT to_char($1::timestamptz AT TIME ZONE $3,'HH24:MI') AS start,to_char($2::timestamptz AT TIME ZONE $3,'HH24:MI') AS end",[lesson.starts_at,lesson.ends_at,ctx.timezone]);
 await validateEntries(tx,ctx.schoolId,[{weekday:new Date(input.date+'T00:00:00Z').getUTCDay()||7,periodNumber:input.period,subjectId,memberId,roomId,startsAtLocal:String(times!.start),endsAtLocal:String(times!.end)}]);
 return {subjectId,memberId,roomId,start:String(times!.start),end:String(times!.end)};
}
export async function lessonChangeConflicts(tx:Transaction,ctx:ScheduleContext,input:ChangeInput,lesson:Row):Promise<LessonConflict[]>{
 const found:LessonConflict[]=[];
 if(!await sourceUnused(tx,ctx,lesson))found.push({kind:'history',message:'Tiết đã có điểm danh hoặc ghi nhận; giữ nguyên lịch sử nguồn.'});
 if(input.kind==='cancel')return found;
 const target=await candidate(tx,ctx,input,lesson);
 const assignment=await one<Row>(tx,`SELECT a.id FROM app.teaching_assignments a JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id
  JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
  WHERE a.school_id=$1 AND a.class_id=$2 AND a.subject_id=$3 AND a.member_id=$4 AND a.kind='SUBJECT' AND a.revoked_at IS NULL
  AND a.starts_on<=$5 AND (a.ends_on IS NULL OR a.ends_on>$5) AND g.revoked_at IS NULL AND g.valid_from<=$6 AND (g.valid_until IS NULL OR g.valid_until>=$7)`,[ctx.schoolId,ctx.classId,target.subjectId,target.memberId,input.date,lesson.starts_at,lesson.ends_at]);
 if(!assignment)found.push({kind:'assignment',message:'Phân công giáo viên/môn không bao phủ tiết học được chọn.'});
 const overlaps=scheduleLimit((await tx.query<Row>(`SELECT l.member_id,l.room_id,c.name FROM app.lesson_occurrences l JOIN app.classes c ON c.school_id=l.school_id AND c.id=l.class_id
  WHERE l.school_id=$1 AND l.id<>$2 AND l.status='SCHEDULED' AND l.starts_at<$4 AND l.ends_at>$3
  AND (l.member_id=$5 OR ($6::uuid IS NOT NULL AND l.room_id=$6)) ORDER BY l.starts_at,l.id LIMIT 101`,[ctx.schoolId,lesson.id,lesson.starts_at,lesson.ends_at,target.memberId,target.roomId])).rows,100);
 for(const overlap of overlaps){if(overlap.member_id===target.memberId)found.push({kind:'teacher',message:`Giáo viên đang dạy lớp ${overlap.name} trong khung giờ này.`});if(target.roomId&&overlap.room_id===target.roomId)found.push({kind:'room',message:`Phòng đang được lớp ${overlap.name} sử dụng trong khung giờ này.`});}
 return found.slice(0,100);
}
async function publishProjection(tx:Transaction,publications:PublicationsService,c:RequestContext,ctx:ScheduleContext,source:Row){
 const rows=scheduleLimit((await tx.query<Row>(`WITH ranked AS(SELECT l.*,row_number() OVER(PARTITION BY (l.starts_at AT TIME ZONE sc.timezone)::date,l.period_number ORDER BY (l.status='SCHEDULED') DESC,l.created_at DESC,l.id DESC) AS rank
  FROM app.lesson_occurrences l JOIN platform.schools sc ON sc.id=l.school_id JOIN app.timetable_versions tv ON tv.school_id=l.school_id AND tv.id=l.timetable_id
  WHERE l.school_id=$1 AND l.class_id=$2 AND tv.year_id=$3 AND tv.status='PUBLISHED') SELECT * FROM ranked WHERE rank=1 ORDER BY starts_at,id LIMIT 10001`,[ctx.schoolId,ctx.classId,ctx.yearId])).rows,10000);
 const items=scheduleLimit((await tx.query<Row>(`WITH ranked AS(SELECT l.*,row_number() OVER(PARTITION BY (l.starts_at AT TIME ZONE sc.timezone)::date,l.period_number ORDER BY (l.status='SCHEDULED') DESC,l.created_at DESC,l.id DESC) AS rank
  FROM app.lesson_occurrences l JOIN platform.schools sc ON sc.id=l.school_id JOIN app.timetable_versions tv ON tv.school_id=l.school_id AND tv.id=l.timetable_id
  WHERE l.school_id=$1 AND l.class_id=$2 AND tv.year_id=$3 AND tv.status='PUBLISHED')
  SELECT e.student_id,(l.starts_at AT TIME ZONE sc.timezone)::date AS day,l.starts_at,l.ends_at,l.status,l.change_reason,s.name AS subject_name,m.work_display_name AS teacher_name,r.name AS room_name
  FROM ranked l JOIN platform.schools sc ON sc.id=l.school_id JOIN app.subjects s ON s.school_id=l.school_id AND s.id=l.subject_id JOIN app.memberships m ON m.school_id=l.school_id AND m.id=l.member_id LEFT JOIN app.rooms r ON r.school_id=l.school_id AND r.id=l.room_id
  JOIN app.enrollments e ON e.school_id=l.school_id AND e.class_id=l.class_id AND e.year_id=$3 AND e.status<>'CANCELLED'
   AND e.starts_on<=(l.starts_at AT TIME ZONE sc.timezone)::date AND (e.ends_on IS NULL OR e.ends_on>(l.starts_at AT TIME ZONE sc.timezone)::date)
  WHERE l.rank=1 ORDER BY e.student_id,l.starts_at,l.id LIMIT 100001`,[ctx.schoolId,ctx.classId,ctx.yearId])).rows,100000);
 const grouped=new Map<string,Record<string,unknown>[]>();
 for(const l of items){const id=String(l.student_id),batch=grouped.get(id)??[];if(batch.length>=5000)throw new Problem(422,'PROJECTION_LIMIT');batch.push({date:l.day,startsAt:iso(l.starts_at as Date),endsAt:iso(l.ends_at as Date),subjectName:l.subject_name,teacherName:l.teacher_name,status:l.status,...(l.room_name?{roomName:l.room_name}:{}),...(l.change_reason?{changeNote:l.change_reason}:{})});grouped.set(id,batch);}
 const projection:ParentItem[]=[...grouped].map(([studentId,items])=>({studentId,section:'timetable',schema:'ParentLessonBatch',payload:{items}}));
 await tx.query("UPDATE app.publication_revisions SET status='SUPERSEDED' WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND kind='TIMETABLE' AND status='PUBLISHED'",[ctx.schoolId,ctx.classId,ctx.yearId]);
 return publications.create(tx,{...c,body:{...c.body,expectedPublicationId:null}},{kind:'TIMETABLE',id:String(source.id),schoolId:ctx.schoolId,classId:ctx.classId,yearId:ctx.yearId,version:Number(source.data_version)},{timetable:await timetableDto(tx,source),lessons:rows.map(l=>dto(lessonResource,l))},projection,true);
}
async function publishChange(tx:Transaction,policy:Permissions,publications:PublicationsService,c:RequestContext,ctx:ScheduleContext,change:Row,lesson:Row){
 await policy.require(tx,c.principal!,'schedule.publish',{schoolId:ctx.schoolId,classId:ctx.classId,yearId:ctx.yearId,date:String(change.lesson_date)});
 const current=await schedulePublication(tx,ctx);if((c.body.expectedPublicationId??null)!==(current?.id??null))throw new Problem(409,'PUBLICATION_CONFLICT');
 const input:ChangeInput={classId:ctx.classId,date:String(change.lesson_date),period:Number(change.period_number),kind:String(change.kind),subjectId:change.subject_id as string|null,teacherMembershipId:change.member_id as string|null,roomId:change.room_id as string|null};
 const conflicts=await lessonChangeConflicts(tx,ctx,input,lesson);if(conflicts.length)validation('form',conflicts.map(v=>v.message).join(' '));
 const source=(await one<Row>(tx,`INSERT INTO app.timetable_versions(school_id,class_id,year_id,revision,starts_on,ends_on,created_by)
  SELECT $1,$2,$3,coalesce(max(revision),0)+1,$4,$5,$6 FROM app.timetable_versions WHERE school_id=$1 AND class_id=$2 RETURNING *`,[ctx.schoolId,ctx.classId,ctx.yearId,input.date,nextDay(input.date),c.principal!.userId]))!;
 if(input.kind!=='cancel'){
  const target=await candidate(tx,ctx,input,lesson),entry=(await one<Row>(tx,`INSERT INTO app.timetable_entries(school_id,class_id,timetable_id,subject_id,member_id,room_id,weekday,period_number,starts_at_local,ends_at_local)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[ctx.schoolId,ctx.classId,source.id,target.subjectId,target.memberId,target.roomId,new Date(input.date+'T00:00:00Z').getUTCDay()||7,input.period,target.start,target.end]))!;
  if(lesson.status==='SCHEDULED')await tx.query("UPDATE app.lesson_occurrences SET status='CANCELLED',change_reason=$3 WHERE school_id=$1 AND id=$2",[ctx.schoolId,lesson.id,change.reason]);
  await tx.query(`INSERT INTO app.lesson_occurrences(school_id,class_id,timetable_id,subject_id,member_id,room_id,starts_at,ends_at,entry_id,period_number,change_reason)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[ctx.schoolId,ctx.classId,source.id,target.subjectId,target.memberId,target.roomId,lesson.starts_at,lesson.ends_at,entry.id,input.period,change.reason]);
 }else if(lesson.status==='SCHEDULED')await tx.query("UPDATE app.lesson_occurrences SET status='CANCELLED',change_reason=$3 WHERE school_id=$1 AND id=$2",[ctx.schoolId,lesson.id,change.reason]);
 else validation('period','Tiết này đã nghỉ; hãy chọn thay đổi để khôi phục lịch học.');
 const published=(await one<Row>(tx,"UPDATE app.timetable_versions SET status='PUBLISHED',published_at=now() WHERE school_id=$1 AND id=$2 RETURNING *",[ctx.schoolId,source.id]))!;
 await tx.query("UPDATE app.lesson_changes SET status='PUBLISHED',timetable_id=$3 WHERE school_id=$1 AND id=$2",[ctx.schoolId,change.id,source.id]);
 await publishProjection(tx,publications,c,ctx,published);
}

export async function scheduleLessonCheck(db:Database,policy:Permissions,c:RequestContext){
 return db.transaction(async tx=>{const input=c.body as unknown as ChangeInput,ctx=await scheduleContext(tx,policy,c,input.classId,'schedule.manage',input.date),lesson=await currentLesson(tx,ctx.schoolId,ctx.classId,input.date,input.period);if(!lesson)notFound();return {data:{conflicts:await lessonChangeConflicts(tx,ctx,input,lesson)}};},{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});
}
export async function scheduleLessonCommand(policy:Permissions,commands:Commands,publications:PublicationsService,c:RequestContext):Promise<Result>{
 const op=c.operation.id,save=op==='saveScheduleLessonChange',discard=op==='discardScheduleLessonChange',input=c.body as unknown as ChangeInput,source=input.source!;
 const authorize=async(tx:Transaction)=>{
  let change:Row|undefined;
  if(!save){change=await one<Row>(tx,changeSelect+' WHERE lc.school_id=$1 AND lc.id=$2',[c.params.schoolId,c.params.changeId]);if(!change||change.class_id!==input.classId)notFound();}
  const ctx=await scheduleContext(tx,policy,c,input.classId,'schedule.manage',save?input.date:String(change!.lesson_date),true);
  if(!discard&&(!save||input.publish))await policy.require(tx,c.principal!,'schedule.publish',{schoolId:ctx.schoolId,classId:ctx.classId,date:save?input.date:String(change!.lesson_date)});
  return {ctx,change};
 };
 return commands.execute(c,authorize,async tx=>{
  const {ctx}=await authorize(tx),date=save?input.date:String((await one<Row>(tx,'SELECT lesson_date FROM app.lesson_changes WHERE school_id=$1 AND id=$2',[ctx.schoolId,c.params.changeId]))!.lesson_date),period=save?input.period:Number((await one<Row>(tx,'SELECT period_number FROM app.lesson_changes WHERE school_id=$1 AND id=$2',[ctx.schoolId,c.params.changeId]))!.period_number);
  let change=await one<Row>(tx,changeSelect+' WHERE lc.school_id=$1 AND lc.class_id=$2 AND lc.lesson_date=$3 AND lc.period_number=$4 AND '+(save?"lc.status='DRAFT'":"lc.id=$5")+' FOR UPDATE OF lc',save?[ctx.schoolId,ctx.classId,date,period]:[ctx.schoolId,ctx.classId,date,period,c.params.changeId]);
  if(discard){if(!change)notFound();assertChangeVersion(change,c.body.expectedVersion);if(change.status!=='DRAFT')throw new Problem(409,'SCHEDULE_IMMUTABLE');if(source.draftId!==change.id||source.draftVersion!==change.version)throw new Problem(409,'STALE_SOURCE');await tx.query("UPDATE app.lesson_changes SET status='DISCARDED' WHERE school_id=$1 AND id=$2",[ctx.schoolId,change.id]);await audit(tx,c,'lesson-change',String(change.id));return {data:{id:change.id,discarded:true}};}
  const lesson=await currentLesson(tx,ctx.schoolId,ctx.classId,date,period);assertLessonSource(lesson,source);
  if(change&&(change.lesson_id!==lesson!.id||Number(change.lesson_version)!==Number(lesson!.version)))throw new Problem(409,'STALE_SOURCE');
  if(date<ctx.today||new Date(lesson!.starts_at as Date).getTime()<=Date.now())validation('date','Không đổi tiết đã qua hoặc đã bắt đầu.');
  if(save){
   if((change?.id??null)!==source.draftId||(change?.version??null)!==source.draftVersion)throw new Problem(409,'VERSION_CONFLICT');
   if(input.kind==='substitute'&&!input.teacherMembershipId)validation('teacher','Chọn giáo viên dạy thay');
   if(input.kind==='room'&&!input.roomId)validation('room','Chọn phòng mới');
   if(input.kind==='swap'&&!input.subjectId&&!input.teacherMembershipId)validation('subjectId','Chọn môn hoặc giáo viên mới');
   if(!input.reason||input.reason.trim().length<5)validation('reason','Lý do tối thiểu 5 ký tự');
   if(input.kind!=='cancel')await candidate(tx,ctx,input,lesson!);
   const args=[ctx.schoolId,ctx.classId,ctx.yearId,lesson!.id,Number(lesson!.version),date,period,input.kind,input.subjectId,input.teacherMembershipId,input.roomId,input.reason.trim(),c.principal!.userId];
   if(change)await tx.query('UPDATE app.lesson_changes SET kind=$3,subject_id=$4,member_id=$5,room_id=$6,reason=$7 WHERE school_id=$1 AND id=$2',[ctx.schoolId,change.id,input.kind,input.subjectId,input.teacherMembershipId,input.roomId,input.reason.trim()]);
   else change=(await one<Row>(tx,`INSERT INTO app.lesson_changes(school_id,class_id,year_id,lesson_id,lesson_version,lesson_date,period_number,kind,subject_id,member_id,room_id,reason,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,args))!;
   change=(await one<Row>(tx,changeSelect+' WHERE lc.school_id=$1 AND lc.id=$2',[ctx.schoolId,change!.id]))!;
  }else{
   if(!change)notFound();assertChangeVersion(change,c.body.expectedVersion);if(change.status!=='DRAFT')throw new Problem(409,'SCHEDULE_IMMUTABLE');
   if(source.draftId!==change.id||source.draftVersion!==change.version||change.lesson_id!==lesson!.id||Number(change.lesson_version)!==lesson!.version)throw new Problem(409,'STALE_SOURCE');
  }
  const conflicts=await lessonChangeConflicts(tx,ctx,save?input:{classId:ctx.classId,date,period,kind:String(change!.kind),subjectId:change!.subject_id as string|null,teacherMembershipId:change!.member_id as string|null,roomId:change!.room_id as string|null},lesson!);
  if(!save||input.publish)await publishChange(tx,policy,publications,c,ctx,change!,lesson!);
  change=(await one<Row>(tx,changeSelect+' WHERE lc.school_id=$1 AND lc.id=$2',[ctx.schoolId,change!.id]))!;
  const current=await schedulePublication(tx,ctx),view=changeView(change,ctx,current?.id??null);await audit(tx,c,'lesson-change',String(change.id),{published:change.status==='PUBLISHED'});
  return {data:save?{change:view,conflicts}:view};
 });
}
