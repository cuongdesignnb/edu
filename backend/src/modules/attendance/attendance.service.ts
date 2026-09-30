import { Injectable } from '@nestjs/common';
import { Database,one,iso,type Transaction,type Row } from '../../database/database';
import { dto,getResource,listResource,resource,type Resource } from '../../database/resources';
import { Permissions,grantAllows } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,validation } from '../../common/problem';
import { PublicationsService,type ParentItem } from '../publications/publications.service';
import type { RequestContext,Result,Handler } from '../../api.router';
const r:Resource={table:'app.attendance_sessions',fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',classId:'class_id',yearId:'year_id',date:'session_date',granularity:'granularity',lessonId:'lesson_id',status:'status',dataVersion:'data_version',slot:'slot_key'},writeFields:[],search:[],filters:{status:'status',granularity:'granularity',classId:'class_id'}};
const rr:Resource={table:'app.attendance_records',fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',enrollmentId:'enrollment_id',status:'status',lateMinutes:'late_minutes',publicNote:'public_note',internalNote:'internal_note'},writeFields:[],search:[],filters:{}};
function sessionDto(row:Row){const value=dto(r,row);if(value.granularity==='DAILY')value.slot=value.slot==='afternoon'?'AFTERNOON':'MORNING';else delete value.slot;return value;}
function recordDto(row:Row){return Object.fromEntries(Object.entries(dto(rr,row)).filter(([,value])=>value!==null));}
@Injectable()
export class AttendanceService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly publications:PublicationsService){}
  handlers():Record<string,Handler>{return Object.fromEntries(['listAttendanceSessions','createAttendanceSession','getAttendanceSession','saveAttendanceRecords','getAttendanceSummary','publishAttendance','reopenAttendance'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  private async session(tx:Transaction,schoolId:string,classId:string,id:string,lock=false){
    const row=await one<Row>(tx,`SELECT * FROM app.attendance_sessions WHERE school_id=$1 AND class_id=$2 AND id=$3${lock?' FOR UPDATE':''}`,[schoolId,classId,id]);if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');return row;
  }
  private async lesson(tx:Transaction,schoolId:string,classId:string,lessonId:string){
    const lesson=await one<Row>(tx,`SELECT l.*,to_char(l.starts_at AT TIME ZONE s.timezone,'YYYY-MM-DD') AS local_date FROM app.lesson_occurrences l
      JOIN platform.schools s ON s.id=l.school_id WHERE l.school_id=$1 AND l.class_id=$2 AND l.id=$3`,[schoolId,classId,lessonId]);if(!lesson)throw new Problem(404,'RESOURCE_NOT_FOUND');return lesson;
  }
  private async authorizeSession(tx:Transaction,c:RequestContext,row:Row,action:string){
    let lesson:Row|undefined;
    if(row.granularity==='LESSON'){if(typeof row.lesson_id!=='string')validation('lessonId','Chọn tiết học cụ thể');lesson=await this.lesson(tx,c.params.schoolId!,c.params.classId!,row.lesson_id);}
    const allowed=await this.policy.require(tx,c.principal!,action,{schoolId:c.params.schoolId!,classId:c.params.classId!,date:String(row.session_date),subjectId:lesson?.subject_id as string|undefined,allowSubject:!!lesson});
    const classScope=allowed.grants.some(g=>grantAllows(g,action,{schoolId:c.params.schoolId!,classId:c.params.classId!,date:String(row.session_date)},allowed.today));
    if(lesson&&!classScope){
      const own=await one(tx,'SELECT id FROM app.memberships WHERE school_id=$1 AND id=$2 AND user_id=$3 AND status=\'ACTIVE\'',[c.params.schoolId,lesson.member_id,c.principal!.userId]);
      if(!own)throw new Problem(404,'RESOURCE_NOT_FOUND');
    }
    return {allowed,lesson,classScope};
  }
  private async records(tx:Transaction,row:Row){return (await tx.query<Row>('SELECT * FROM app.attendance_records WHERE school_id=$1 AND session_id=$2 ORDER BY enrollment_id',[row.school_id,row.id])).rows;}
  private async detail(tx:Transaction,row:Row){return {...sessionDto(row),records:(await this.records(tx,row)).map(recordDto)};}
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,classId=c.params.classId!,op=c.operation.id;
    const authorize=async(tx:Transaction)=>{
      if(['listAttendanceSessions','getAttendanceSummary'].includes(op))return this.policy.require(tx,c.principal!,'attendance.read',{schoolId,classId,allowSubject:true});
      if(op==='createAttendanceSession')return this.authorizeSession(tx,c,{session_date:c.body.date,granularity:c.body.granularity,lesson_id:c.body.lessonId},'attendance.record');
      return this.authorizeSession(tx,c,await this.session(tx,schoolId,classId,c.params.sessionId!),c.operation.permission);
    };
    const work=async(tx:Transaction):Promise<Result>=>{
      const cls=await getResource(tx,resource('class'),schoolId,classId),year=await getResource(tx,resource('year'),schoolId,String(cls.year_id));
      if(op==='listAttendanceSessions'||op==='getAttendanceSummary'){
        const allowed=await this.policy.require(tx,c.principal!,'attendance.read',{schoolId,classId,allowSubject:true});
        const broad=allowed.grants.some(g=>grantAllows(g,'attendance.read',{schoolId,classId},allowed.today));
        const eligible=broad?undefined:(await tx.query<{id:string;subject_id:string;local_date:string}>(`SELECT l.id,l.subject_id,(l.starts_at AT TIME ZONE s.timezone)::date AS local_date FROM app.lesson_occurrences l JOIN app.memberships m ON m.school_id=l.school_id AND m.id=l.member_id
          JOIN platform.schools s ON s.id=l.school_id JOIN app.teaching_assignments a ON a.school_id=l.school_id AND a.class_id=l.class_id AND a.member_id=l.member_id AND a.subject_id=l.subject_id
          WHERE l.school_id=$1 AND l.class_id=$2 AND m.user_id=$3 AND a.kind='SUBJECT' AND a.revoked_at IS NULL
          AND a.starts_on<=(now() AT TIME ZONE s.timezone)::date AND (a.ends_on IS NULL OR a.ends_on>(now() AT TIME ZONE s.timezone)::date)
          AND a.starts_on<=(l.starts_at AT TIME ZONE s.timezone)::date AND (a.ends_on IS NULL OR a.ends_on>(l.starts_at AT TIME ZONE s.timezone)::date)`,[schoolId,classId,c.principal!.userId])).rows
          .filter(row=>allowed.grants.some(g=>grantAllows(g,'attendance.read',{schoolId,classId,allowSubject:true,subjectId:row.subject_id,date:row.local_date},allowed.today))).map(row=>row.id);
        const from=c.query.from??String(year.starts_on),to=c.query.to??String(year.ends_on);
        if(from>=to||from<String(year.starts_on)||to>String(year.ends_on))validation('from','Khoảng ngày phải nằm trong năm học và dùng ngày kết thúc loại trừ');
        if(op==='listAttendanceSessions'){
          const result=await listResource(tx,r,schoolId,{...c.query,classId},{sql:`t.session_date>=$1 AND t.session_date<$2${eligible?' AND t.lesson_id=ANY($3::uuid[])':''}`,values:eligible?[from,to,eligible]:[from,to]},c.principal!.userId);
          result.data=result.data.map(value=>{if(value.granularity==='DAILY')value.slot=value.slot==='afternoon'?'AFTERNOON':'MORNING';else delete value.slot;return value;});return result;
        }
        if((Date.parse(to)-Date.parse(from))/86400000>92)validation('to','Tổng hợp chuyên cần tối đa 92 ngày mỗi lần');
        const granularity=c.query.granularity??'DAILY',slot=c.query.slot==='AFTERNOON'?'afternoon':'morning';
        const rows=(await tx.query<Row>(`SELECT ar.* FROM app.attendance_sessions s JOIN app.attendance_records ar ON ar.school_id=s.school_id AND ar.session_id=s.id
          WHERE s.school_id=$1 AND s.class_id=$2 AND s.session_date>=$3 AND s.session_date<$4 AND s.granularity=$5
          ${granularity==='DAILY'?"AND s.slot_key IN ($6,'daily')":"AND $6::text IS NOT NULL"}${eligible?' AND s.lesson_id=ANY($7::uuid[])':''} ORDER BY s.session_date,s.id,ar.enrollment_id`,
        eligible?[schoolId,classId,from,to,granularity,slot,eligible]:[schoolId,classId,from,to,granularity,slot])).rows;
        const counts={unmarked:0,present:0,late:0,excused:0,unexcused:0,expected:rows.length};for(const row of rows)counts[String(row.status).toLowerCase() as keyof typeof counts]++;
        return {data:{granularity,from,to,counts,records:rows.map(recordDto)}};
      }
      if(op==='getAttendanceSession')return {data:await this.detail(tx,await this.session(tx,schoolId,classId,c.params.sessionId!))};
      await tx.query('SELECT app.lock_school()');
      if(year.status==='ARCHIVED'||cls.status==='ARCHIVED')throw new Problem(409,'YEAR_ARCHIVED');
      if(op==='createAttendanceSession'){
        const date=String(c.body.date),scope=await this.authorizeSession(tx,c,{session_date:date,granularity:c.body.granularity,lesson_id:c.body.lessonId},'attendance.record');
        if(date<String(year.starts_on)||date>=String(year.ends_on)||date>scope.allowed.today)validation('date','Ngày ngoài năm hoặc chưa tới');
        if((await tx.query("SELECT id FROM app.calendar_events WHERE school_id=$1 AND year_id=$2 AND kind='HOLIDAY' AND starts_on<=$3 AND ends_on>$3 AND (class_id IS NULL OR class_id=$4)",[schoolId,year.id,date,classId])).rowCount)throw new Problem(422,'SCHOOL_HOLIDAY');
        const lesson=scope.lesson;
        if(lesson&&c.body.slot)validation('slot','Tiết học không dùng buổi sáng/chiều');
        if(c.body.granularity==='DAILY'&&c.body.lessonId)validation('lessonId','Điểm danh buổi không gắn tiết');
        if(lesson&&(lesson.status!=='SCHEDULED'||lesson.local_date!==date))validation('lessonId','Tiết không diễn ra trong ngày này');
        if(lesson&&!(await tx.query(`SELECT id FROM app.teaching_assignments WHERE school_id=$1 AND class_id=$2 AND member_id=$3 AND subject_id=$4 AND kind='SUBJECT'
          AND revoked_at IS NULL AND starts_on<=$5 AND (ends_on IS NULL OR ends_on>$5)`,[schoolId,classId,lesson.member_id,lesson.subject_id,date])).rowCount)validation('lessonId','Thiếu phân công có hiệu lực trong ngày');
        const slot=lesson?String(lesson.id):c.body.slot==='AFTERNOON'?'afternoon':'morning';
        const session=await one<Row>(tx,`INSERT INTO app.attendance_sessions(school_id,class_id,year_id,session_date,granularity,slot_key,lesson_id,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[schoolId,classId,year.id,date,c.body.granularity,slot,lesson?.id??null,c.principal!.userId]);
        await tx.query(`INSERT INTO app.attendance_records(school_id,class_id,session_id,enrollment_id,recorded_by)
          SELECT school_id,class_id,$3,id,$4 FROM app.enrollments WHERE school_id=$1 AND class_id=$2 AND status<>'CANCELLED'
          AND starts_on<=$5 AND (ends_on IS NULL OR ends_on>$5) ORDER BY id`,[schoolId,classId,session!.id,c.principal!.userId,date]);
        await audit(tx,c,'attendance',String(session!.id),{date,slot});return {data:await this.detail(tx,await this.session(tx,schoolId,classId,String(session!.id))),status:201};
      }
      const session=await this.session(tx,schoolId,classId,c.params.sessionId!,true);
      await this.authorizeSession(tx,c,session,c.operation.permission);
      if(op==='publishAttendance'){
        if(Number(session.data_version)!==c.body.expectedSourceVersion)throw new Problem(409,'STALE_SOURCE',undefined,Number(session.data_version));
        const records=await this.records(tx,session);if(!records.length||records.some(row=>row.status==='UNMARKED'))throw new Problem(422,'ATTENDANCE_UNMARKED');
        const enrollments=(await tx.query<Row>(`SELECT id,student_id FROM app.enrollments WHERE school_id=$1 AND class_id=$2 AND status<>'CANCELLED'
          AND starts_on<=$3 AND (ends_on IS NULL OR ends_on>$3) ORDER BY id`,[schoolId,classId,session.session_date])).rows;
        if(enrollments.length!==records.length||records.some(row=>!enrollments.some(e=>e.id===row.enrollment_id)))throw new Problem(409,'ROSTER_CHANGED');
        const at=(await one<{at:Date}>(tx,'SELECT now() AS at'))!.at;
        const items:ParentItem[]=records.map(row=>({studentId:String(enrollments.find(e=>e.id===row.enrollment_id)!.student_id),section:'attendance',schema:'ParentAttendance',payload:{date:session.session_date,
          slotLabel:session.granularity==='DAILY'?(session.slot_key==='afternoon'?'Buổi chiều':'Buổi sáng'):'Tiết học',status:row.status,...(row.public_note?{publicNote:row.public_note}:{}),publishedAt:iso(at)}}));
        await tx.query("UPDATE app.attendance_sessions SET status='LOCKED' WHERE school_id=$1 AND id=$2",[schoolId,session.id]);
        const updated=await this.session(tx,schoolId,classId,String(session.id));
        return {data:await this.publications.create(tx,c,{kind:'ATTENDANCE',id:String(session.id),schoolId,classId,yearId:String(session.year_id),version:Number(session.data_version)},{attendance:await this.detail(tx,updated)},items,true)};
      }
      if(session.version!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(session.version));
      if(op==='reopenAttendance'){
        if(session.status!=='LOCKED')throw new Problem(409,'INVALID_STATE');if(String(c.body.reason).trim().length<5)validation('reason','Ghi lý do ít nhất 5 ký tự');
        await tx.query("UPDATE app.attendance_sessions SET status='OPEN' WHERE school_id=$1 AND id=$2",[schoolId,session.id]);await audit(tx,c,'attendance',String(session.id),{status:'OPEN'});
        return {data:await this.detail(tx,await this.session(tx,schoolId,classId,String(session.id)))};
      }
      if(session.status!=='OPEN')throw new Problem(409,'ATTENDANCE_LOCKED');
      const entries=c.body.records as {enrollmentId:string;expectedVersion:number;status:string;lateMinutes?:number;publicNote?:string;internalNote?:string}[];
      if(new Set(entries.map(e=>e.enrollmentId)).size!==entries.length)validation('records','Học sinh bị trùng trong request');
      for(const entry of [...entries].sort((a,b)=>a.enrollmentId.localeCompare(b.enrollmentId))){
        const current=await one<Row>(tx,'SELECT * FROM app.attendance_records WHERE school_id=$1 AND session_id=$2 AND enrollment_id=$3 FOR UPDATE',[schoolId,session.id,entry.enrollmentId]);if(!current)validation('enrollmentId','Không thuộc danh sách điểm danh của buổi');
        if(current.version!==entry.expectedVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(current.version));
        if(entry.status!=='LATE'&&(entry.lateMinutes??0)!==0)validation('lateMinutes','Số phút chỉ dùng cho đi muộn');
        await tx.query(`UPDATE app.attendance_records SET status=$4,late_minutes=$5,public_note=CASE WHEN $6::boolean THEN $7 ELSE public_note END,
          internal_note=CASE WHEN $8::boolean THEN $9 ELSE internal_note END,recorded_by=$10 WHERE school_id=$1 AND session_id=$2 AND enrollment_id=$3`,
        [schoolId,session.id,entry.enrollmentId,entry.status,entry.status==='LATE'?entry.lateMinutes??0:null,Object.hasOwn(entry,'publicNote'),entry.publicNote??null,Object.hasOwn(entry,'internalNote'),entry.internalNote??null,c.principal!.userId]);
      }
      await audit(tx,c,'attendance',String(session.id),{changed:entries.length});return {data:await this.detail(tx,await this.session(tx,schoolId,classId,String(session.id)))};
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId});
    return this.commands.execute(c,authorize,work);
  }
}
