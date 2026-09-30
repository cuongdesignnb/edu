import { one,iso,type Row,type Transaction } from '../../database/database';
import { dto,type Resource } from '../../database/resources';
import { Problem,validation } from '../../common/problem';

const meta={id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at'};
export const timetableResource:Resource={table:'app.timetable_versions',fields:{...meta,classId:'class_id',yearId:'year_id',revision:'revision',startsOn:'starts_on',endsOn:'ends_on',status:'status',dataVersion:'data_version',publishedAt:'published_at'},writeFields:[],search:[],filters:{status:'status'}};
export const dutyResource:Resource={table:'app.duty_schedules',fields:{...meta,classId:'class_id',yearId:'year_id',startsOn:'starts_on',endsOn:'ends_on',status:'status',dataVersion:'data_version',publishedAt:'published_at'},writeFields:[],search:[],filters:{status:'status'}};
export const lessonResource:Resource={table:'app.lesson_occurrences',fields:{id:'id',classId:'class_id',subjectId:'subject_id',memberId:'member_id',roomId:'room_id',startsAt:'starts_at',endsAt:'ends_at',status:'status',periodNumber:'period_number',changeReason:'change_reason'},writeFields:[],search:[],filters:{classId:'class_id',memberId:'member_id',roomId:'room_id'}};
export interface Entry {id?:string|null;weekday:number;periodNumber:number;subjectId:string|null;memberId:string|null;roomId?:string|null;startsAtLocal:string;endsAtLocal:string}
export interface DutyInput {id?:string;enrollmentId:string;dutyDate:string;task:string;status?:string}
export interface GroupDutyInput {id?:string;groupId:string;dutyDate:string;task:string;status?:string}
export interface Occurrence extends Row {class_id:string;subject_id:string;member_id:string;room_id:string|null;starts_at:Date;ends_at:Date;day:string;entry_id:string;period_number:number}
export type Conflict={kind:'CLASS'|'TEACHER'|'ROOM'|'ASSIGNMENT'|'HOLIDAY';startsAt:string;endsAt:string;message:string};

export function range(year:Row,starts:string,ends:string){
  if(starts<String(year.starts_on)||ends>String(year.ends_on)||starts>=ends||Date.parse(ends)-Date.parse(starts)>366*86400000)validation('startsOn','Khoảng lịch cần nằm trong năm học và tối đa 366 ngày');
}
export async function timetableDto(tx:Transaction,row:Row){
  const entries=(await tx.query<Row>(`SELECT id,weekday,period_number,subject_id,member_id,room_id,to_char(starts_at_local,'HH24:MI') AS starts,to_char(ends_at_local,'HH24:MI') AS ends
    FROM app.timetable_entries WHERE school_id=$1 AND timetable_id=$2 ORDER BY weekday,period_number`,[row.school_id,row.id])).rows;
  return {...dto(timetableResource,row),entries:entries.map(e=>({id:e.id,weekday:e.weekday,periodNumber:e.period_number,subjectId:e.subject_id,memberId:e.member_id,...(e.room_id?{roomId:e.room_id}:{}),startsAtLocal:e.starts,endsAtLocal:e.ends}))};
}
export async function dutyDto(tx:Transaction,row:Row){
  const assignments=(await tx.query<Row>('SELECT id,enrollment_id,duty_date,task,status FROM app.duty_assignments WHERE school_id=$1 AND schedule_id=$2 ORDER BY duty_date,enrollment_id,id',[row.school_id,row.id])).rows;
  const groups=(await tx.query<Row>('SELECT id,group_id,duty_date,task,status FROM app.duty_group_plans WHERE school_id=$1 AND schedule_id=$2 ORDER BY duty_date,group_id,id',[row.school_id,row.id])).rows;
  return {...dto(dutyResource,row),assignments:assignments.map(a=>({id:a.id,enrollmentId:a.enrollment_id,dutyDate:a.duty_date,task:a.task,status:a.status})),groupAssignments:groups.map(g=>({id:g.id,groupId:g.group_id,dutyDate:g.duty_date,task:g.task,status:g.status}))};
}
export async function validateEntries(tx:Transaction,schoolId:string,entries:Entry[]){
  const periods=new Set<string>();
  for(const e of entries){
    if(!e.subjectId||!e.memberId||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.startsAtLocal)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.endsAtLocal)||e.startsAtLocal>=e.endsAtLocal)validation('entries','Môn, giáo viên và giờ học không hợp lệ');
    const key=`${e.weekday}:${e.periodNumber}`;if(periods.has(key))validation('entries','Tiết trong ngày bị trùng');periods.add(key);
    if(!(await tx.query("SELECT id FROM app.subjects WHERE school_id=$1 AND id=$2 AND status='ACTIVE'",[schoolId,e.subjectId])).rowCount)validation('entries.subjectId','Môn không khả dụng');
    if(!(await tx.query(`SELECT m.id FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1 AND m.id=$2 AND m.status='ACTIVE' AND m.ended_at IS NULL AND u.status='ACTIVE'`,[schoolId,e.memberId])).rowCount)validation('entries.memberId','Giáo viên không khả dụng');
    if(e.roomId&&!(await tx.query("SELECT id FROM app.rooms WHERE school_id=$1 AND id=$2 AND status='ACTIVE'",[schoolId,e.roomId])).rowCount)validation('entries.roomId','Phòng không khả dụng');
  }
}
export async function occurrences(tx:Transaction,row:Row):Promise<Occurrence[]>{
  const rows=(await tx.query<Occurrence>(`SELECT e.class_id,e.subject_id,e.member_id,e.room_id,e.id AS entry_id,e.period_number,d.day::date AS day,
    (d.day::date+e.starts_at_local) AT TIME ZONE s.timezone AS starts_at,(d.day::date+e.ends_at_local) AT TIME ZONE s.timezone AS ends_at
    FROM app.timetable_entries e JOIN platform.schools s ON s.id=e.school_id
    CROSS JOIN LATERAL generate_series($3::date::timestamp,($4::date-1)::timestamp,interval '1 day') d(day)
    WHERE e.school_id=$1 AND e.timetable_id=$2 AND extract(isodow FROM d.day)=e.weekday
    AND (d.day::date+e.starts_at_local) AT TIME ZONE s.timezone>now()
    ORDER BY d.day,e.starts_at_local,e.id LIMIT 5001`,[row.school_id,row.id,row.starts_on,row.ends_on])).rows;
  if(rows.length>5000)throw new Problem(422,'SCHEDULE_MATERIALIZATION_LIMIT');return rows;
}
export async function conflicts(tx:Transaction,row:Row,rows:Occurrence[]){
  const found:Conflict[]=[],allowed:Occurrence[]=[];
  const items=rows.map(l=>({classId:l.class_id,subjectId:l.subject_id,memberId:l.member_id,roomId:l.room_id,startsAt:iso(l.starts_at),endsAt:iso(l.ends_at),day:l.day,entryId:l.entry_id}));
  const blocked=(await tx.query<{entry_id:string;day:string;kind:Conflict['kind']}>(`WITH candidates AS(SELECT * FROM jsonb_to_recordset($3::jsonb) AS x("classId" uuid,"subjectId" uuid,"memberId" uuid,"roomId" uuid,"startsAt" timestamptz,"endsAt" timestamptz,day date,"entryId" uuid))
    SELECT c."entryId" AS entry_id,c.day,'HOLIDAY' AS kind FROM candidates c WHERE EXISTS(SELECT 1 FROM app.calendar_events h
     WHERE h.school_id=$1 AND h.year_id=$2 AND h.status='PUBLISHED' AND h.kind='HOLIDAY' AND (h.class_id IS NULL OR h.class_id=c."classId") AND h.starts_on<=c.day AND h.ends_on>c.day)
    UNION ALL SELECT c."entryId",c.day,'ASSIGNMENT' FROM candidates c WHERE NOT EXISTS(
     SELECT 1 FROM app.teaching_assignments a JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id
     JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id JOIN identity.users u ON u.id=m.user_id
     JOIN app.roles role ON role.school_id=g.school_id AND role.id=g.role_id AND role.status='ACTIVE'
     WHERE a.school_id=$1 AND a.class_id=c."classId" AND a.subject_id=c."subjectId" AND a.member_id=c."memberId" AND a.kind='SUBJECT' AND a.revoked_at IS NULL
      AND a.starts_on<=c.day AND a.ends_on>c.day AND g.revoked_at IS NULL AND g.valid_from<=c."startsAt" AND (g.valid_until IS NULL OR g.valid_until>=c."endsAt")
      AND m.status='ACTIVE' AND m.ended_at IS NULL AND u.status='ACTIVE')`,[row.school_id,row.year_id,JSON.stringify(items)])).rows;
  const blockedMap=new Map<string,Conflict['kind']>();
  for(const b of blocked){const key=`${b.entry_id}:${b.day}`;if(blockedMap.get(key)!=='HOLIDAY')blockedMap.set(key,b.kind);}
  for(const l of rows){const kind=blockedMap.get(`${l.entry_id}:${l.day}`);
    if(kind==='HOLIDAY')continue;
    if(kind){found.push({kind,startsAt:iso(l.starts_at),endsAt:iso(l.ends_at),message:'Phân công giáo viên không bao phủ tiết học'});continue;}allowed.push(l);
  }
  for(let i=0;i<allowed.length;i++)for(let j=i+1;j<allowed.length;j++){
    const a=allowed[i]!,b=allowed[j]!;if(a.ends_at<=b.starts_at)break;
    if(a.starts_at<b.ends_at&&b.starts_at<a.ends_at)found.push({kind:'CLASS',startsAt:iso(b.starts_at),endsAt:iso(b.ends_at),message:'Hai tiết của lớp bị chồng giờ'});
  }
  const overlap=(await tx.query<{starts_at:Date;ends_at:Date;kind:Conflict['kind']}>(`WITH candidates AS(SELECT * FROM jsonb_to_recordset($3::jsonb) AS x("classId" uuid,"memberId" uuid,"roomId" uuid,"startsAt" timestamptz,"endsAt" timestamptz))
    SELECT c."startsAt" AS starts_at,c."endsAt" AS ends_at,CASE WHEN l.class_id=c."classId" THEN 'CLASS' WHEN l.member_id=c."memberId" THEN 'TEACHER' ELSE 'ROOM' END AS kind
    FROM candidates c JOIN app.lesson_occurrences l ON l.school_id=$1 AND l.status='SCHEDULED' AND l.starts_at<c."endsAt" AND l.ends_at>c."startsAt"
    AND (l.class_id=c."classId" OR l.member_id=c."memberId" OR (c."roomId" IS NOT NULL AND l.room_id=c."roomId"))
    WHERE l.class_id<>$2 OR EXISTS(SELECT 1 FROM app.attendance_sessions a WHERE a.school_id=l.school_id AND a.lesson_id=l.id)
      OR EXISTS(SELECT 1 FROM app.conduct_records r WHERE r.school_id=l.school_id AND r.lesson_id=l.id AND r.status<>'EXCLUDED')
    LIMIT 100`,[row.school_id,row.class_id,JSON.stringify(allowed.map(l=>({classId:l.class_id,memberId:l.member_id,roomId:l.room_id,startsAt:iso(l.starts_at),endsAt:iso(l.ends_at)})))])).rows;
  for(const l of overlap)found.push({kind:l.kind,startsAt:iso(l.starts_at),endsAt:iso(l.ends_at),message:l.kind==='CLASS'?'Tiết cũ đã có dữ liệu nguồn, cần giữ lịch sử':'Trùng giáo viên hoặc phòng với lịch đã công bố'});
  // Even a removed entry cannot cancel an occurrence already used as a source.
  const referenced=await one<{starts_at:Date;ends_at:Date}>(tx,`SELECT l.starts_at,l.ends_at FROM app.lesson_occurrences l JOIN platform.schools s ON s.id=l.school_id
    WHERE l.school_id=$1 AND l.class_id=$2 AND l.status='SCHEDULED' AND l.starts_at>now()
    AND (l.starts_at AT TIME ZONE s.timezone)::date >=$3 AND (l.starts_at AT TIME ZONE s.timezone)::date<$4
    AND (EXISTS(SELECT 1 FROM app.attendance_sessions a WHERE a.school_id=l.school_id AND a.lesson_id=l.id)
      OR EXISTS(SELECT 1 FROM app.conduct_records r WHERE r.school_id=l.school_id AND r.lesson_id=l.id AND r.status<>'EXCLUDED')) LIMIT 1`,[row.school_id,row.class_id,row.starts_on,row.ends_on]);
  if(referenced)found.push({kind:'CLASS',startsAt:iso(referenced.starts_at),endsAt:iso(referenced.ends_at),message:'Khoảng thay lịch có tiết đã được sử dụng; không ghi đè lịch sử'});
  return {validation:{valid:found.length===0,conflicts:found.slice(0,100)},allowed};
}
