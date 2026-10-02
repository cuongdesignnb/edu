import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import {one,iso,type Transaction,type Row} from '../../database/database';
import {getResource,resource} from '../../database/resources';
import {Permissions,grantAllows,type Grant} from '../../common/permissions';
import {Problem,notFound,validation} from '../../common/problem';
import {canonical} from '../../common/commands';
import type {ReportData,ReportRow,ReportColumn} from './report-render';
export interface ReportInput {reportType:string;yearId?:string;classId?:string;studentId?:string;studentIds?:string[];gradeId?:string;weekId?:string;from?:string;to?:string;dataSource?:string;scope?:'SCHOOL'|'CLASS'}
export interface ReportContext {schoolId:string;userId:string;input:Required<Pick<ReportInput,'reportType'|'yearId'|'from'|'to'|'dataSource'>>&ReportInput;school:Row;year:Row;cls?:Row;grants:Grant[];today:string;fingerprint:string;bindings:unknown[]}
const titles:Record<string,string>={attendance:'Chuyên cần',conduct:'Thi đua theo tuần',activities:'Hoạt động và minh chứng','class-progress':'Tiến độ vận hành lớp','parent-access':'Sử dụng link tra cứu',student:'Báo cáo cá nhân','student-directory':'Danh sách học sinh được chọn'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const contextSql=`filters AS (SELECT $6::date AS from_date,$7::date AS to_date,$8::uuid AS student_id,$9::uuid AS user_id,$10::uuid AS week_id),g AS (SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(scope_type text,class_id uuid,subject_id uuid,starts_on date,ends_on date,actions text[])),
 base AS (SELECT c.* FROM app.classes c WHERE c.school_id=$1 AND c.year_id=$3::uuid AND ($4::uuid IS NULL OR c.id=$4::uuid) AND ($5::uuid IS NULL OR c.grade_level_id=$5::uuid))`;
export function allowed(date:string,cls:string,subject?:string){return `EXISTS(SELECT 1 FROM g WHERE 'report.read'=ANY(g.actions) AND (g.scope_type='SCHOOL' OR (g.class_id=${cls} AND (g.starts_on IS NULL OR g.starts_on<=${date}) AND (g.ends_on IS NULL OR g.ends_on>${date}) AND (g.scope_type='CLASS'${subject?` OR (g.scope_type='SUBJECT' AND ${subject==='*'?'true':`g.subject_id=${subject}`})`:''}))))`;}
export async function reportContext(tx:Transaction,policy:Permissions,schoolId:string,userId:string,input:ReportInput,exporting=false):Promise<ReportContext>{
  if(!Object.hasOwn(titles,input.reportType))notFound();
  for(const key of ['yearId','classId','studentId','gradeId','weekId'] as const)if(input[key]&&!uuid.test(input[key]!))validation(key,'Mã tham chiếu không hợp lệ');
  const school=(await one<Row>(tx,'SELECT * FROM platform.schools WHERE id=$1',[schoolId]))!;
  if(!school)notFound();
  const cls=input.classId?await getResource(tx,resource('class'),schoolId,input.classId):undefined;
  if(input.scope==='CLASS'&&!cls)validation('classId','Bản xuất chi tiết lớp cần lớp cụ thể');
  const directory=input.reportType==='student-directory';if(directory&&(cls||input.scope==='CLASS'||!Array.isArray(input.studentIds)||!input.studentIds.length||input.studentIds.length>5000||input.studentIds.some(id=>!uuid.test(id))||new Set(input.studentIds).size!==input.studentIds.length))validation('studentIds','Chọn danh sách học sinh hợp lệ của trường');
  if(!directory&&input.studentIds!==undefined)validation('studentIds','Báo cáo này không hỗ trợ danh sách học sinh');
  const access=await policy.require(tx,{userId},directory?(exporting?'report.read+student.read+report.export':'report.read+student.read'):exporting?'report.read+report.export':'report.read',{schoolId,...(cls?{classId:String(cls.id)}:{}),allowSubject:!!cls&&['attendance','activities'].includes(input.reportType)});
  if(input.reportType==='student'&&(!cls||!input.studentId))validation('studentId','Chọn một học sinh của lớp');
  const yearId=input.yearId??cls?.year_id as string|undefined;
  const year=yearId?await getResource(tx,resource('year'),schoolId,yearId):await one<Row>(tx,"SELECT * FROM app.academic_years WHERE school_id=$1 AND status='ACTIVE' ORDER BY starts_on DESC,id LIMIT 1",[schoolId]);
  if(!year)validation('yearId','Trường chưa có năm học để báo cáo');if(cls&&cls.year_id!==year.id)notFound();
  if(input.gradeId)await getResource(tx,resource('grade'),schoolId,input.gradeId);
  if(input.weekId){const week=await getResource(tx,resource('week'),schoolId,input.weekId);if(week.year_id!==year.id)notFound();input={...input,from:String(week.starts_on),to:String(week.ends_on)};}
  const from=input.from??String(year.starts_on),to=input.to??String(year.ends_on);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||new Date(from).toISOString().slice(0,10)!==from||new Date(to).toISOString().slice(0,10)!==to||from>=to||from<String(year.starts_on)||to>String(year.ends_on))validation('from','Khoảng ngày phải thuộc năm học; ngày kết thúc loại trừ');
  if(input.studentId){if(!cls)validation('classId','Báo cáo học sinh cần lớp cụ thể');if(!await one(tx,"SELECT id FROM app.enrollments WHERE school_id=$1 AND student_id=$2 AND class_id=$3 AND status<>'CANCELLED' AND daterange(starts_on,ends_on,'[)')&&daterange($4,$5,'[)')",[schoolId,input.studentId,cls.id,from,to]))notFound();}
  const source=input.dataSource??'LIVE_INTERNAL';if(!['LIVE_INTERNAL','PUBLISHED_SNAPSHOT'].includes(source)||source==='PUBLISHED_SNAPSHOT'&&['class-progress','parent-access','student','student-directory'].includes(input.reportType))validation('dataSource','Loại báo cáo không có nguồn công bố tương ứng');
  const relevantActions=directory?['report.read','report.export','student.read','guardian.read']:['report.read','report.export'];
  const relevant=access.grants.filter(g=>relevantActions.some(a=>grantAllows(g,a,{schoolId,...(g.class_id?{classId:g.class_id}:{}),allowSubject:!!cls&&['attendance','activities'].includes(input.reportType)},access.today)))
    .map(g=>({id:g.id,role_id:g.role_id,assignment_id:g.assignment_id,scope_type:g.scope_type,class_id:g.class_id,subject_id:g.subject_id,starts_on:g.starts_on,ends_on:g.ends_on,actions:g.actions.filter(a=>relevantActions.includes(a)).sort()})).sort((a,b)=>a.id.localeCompare(b.id));
  const fingerprint=crypto.createHash('sha256').update(canonical(relevant)).digest('hex');
  return {schoolId,userId,school,year,cls,grants:access.grants,today:access.today,fingerprint,input:{...input,yearId:String(year.id),from,to,dataSource:source},bindings:[schoolId,JSON.stringify(relevant),year.id,cls?.id??null,input.gradeId??null,from,to,input.studentId??null,userId,input.weekId??null]};
}
async function query(tx:Transaction,ctx:ReportContext,sql:string){const rows=(await tx.query<Row>(`WITH ${contextSql} ${sql} LIMIT 10001`,ctx.bindings)).rows;if(rows.length>10000)throw new Problem(422,'REPORT_ROW_LIMIT_EXCEEDED');return rows;}
const row=(r:Row,values:Record<string,unknown>):ReportRow=>({label:String(r.label),...(r.class_id?{classId:String(r.class_id)}:{}),...(r.student_id?{studentId:String(r.student_id)}:{}),values});
const columns=(pairs:[string,string][]):ReportColumn[]=>pairs.map(([key,label])=>({key,label}));
const attendanceColumns=columns([['sessions','Buổi / tiết đã lưu'],['published','Đã công bố'],['present','Có mặt'],['late','Đi muộn'],['excused','Nghỉ có phép'],['unexcused','Nghỉ không phép'],['unmarked','Chưa điểm danh'],['total','Lượt học sinh-buổi'],['rate','Tỷ lệ hiện diện (%)']]);
async function attendance(tx:Transaction,ctx:ReportContext){
  const detail=!!ctx.cls&&ctx.input.scope!=='SCHOOL',where=allowed('s.session_date','c.id','l.subject_id'),broad=allowed('s.session_date','c.id');
  const rows=await query(tx,ctx,`, facts AS (SELECT c.id AS class_id,c.name AS class_name,e.student_id,st.full_name AS student_name,s.id AS session_id,r.status,
    EXISTS(SELECT 1 FROM app.publication_revisions p WHERE p.school_id=s.school_id AND p.attendance_session_id=s.id AND p.status='PUBLISHED' AND p.source_version=s.data_version) AS published
    FROM base c JOIN app.attendance_sessions s ON s.school_id=c.school_id AND s.class_id=c.id
    LEFT JOIN app.lesson_occurrences l ON l.school_id=s.school_id AND l.id=s.lesson_id LEFT JOIN app.memberships m ON m.school_id=l.school_id AND m.id=l.member_id
    JOIN app.attendance_records r ON r.school_id=s.school_id AND r.session_id=s.id JOIN app.enrollments e ON e.school_id=r.school_id AND e.id=r.enrollment_id
    JOIN app.students st ON st.school_id=e.school_id AND st.id=e.student_id
    WHERE s.session_date>=$6::date AND s.session_date<$7::date AND ($8::uuid IS NULL OR e.student_id=$8::uuid)
    AND (${broad} AND s.granularity='DAILY' AND s.slot_key IN ('morning','daily') OR ${where} AND NOT ${broad} AND s.granularity='LESSON' AND m.user_id=$9::uuid))
    SELECT class_id,${detail?'student_id,student_name':'NULL::uuid AS student_id,class_name'} AS label,
    count(DISTINCT session_id)::int AS sessions,count(DISTINCT session_id) FILTER(WHERE published)::int AS published,
    count(*) FILTER(WHERE status='PRESENT')::int AS present,count(*) FILTER(WHERE status='LATE')::int AS late,
    count(*) FILTER(WHERE status='EXCUSED')::int AS excused,count(*) FILTER(WHERE status='UNEXCUSED')::int AS unexcused,
    count(*) FILTER(WHERE status='UNMARKED')::int AS unmarked,count(*)::int AS total FROM facts GROUP BY class_id,${detail?'student_id,student_name':'class_name'} ORDER BY label,class_id`);
  return {rows:rows.map(r=>row(r,Object.fromEntries(attendanceColumns.map(c=>[c.key,c.key==='rate'?Number(new Decimal(Number(r.present)+Number(r.late)).mul(100).div(Number(r.total)||1).toFixed(2)):r[c.key]])))),columns:attendanceColumns,pins:[] as string[]};
}
async function published(tx:Transaction,ctx:ReportContext,type=ctx.input.reportType){
  const kinds:Record<string,string>={attendance:'ATTENDANCE',conduct:'CONDUCT',activities:'ACTIVITY'};
  const rows=await query(tx,ctx,`SELECT c.id AS class_id,i.student_id,s.full_name AS label,p.id AS publication_id,p.revision,p.kind,i.payload,
    coalesce(a.session_date,w.starts_on,(act.due_at AT TIME ZONE sch.timezone)::date) AS source_date
    FROM base c JOIN platform.schools sch ON sch.id=c.school_id JOIN app.publication_revisions p ON p.school_id=c.school_id AND p.class_id=c.id
    JOIN app.parent_publication_items i ON i.school_id=p.school_id AND i.publication_id=p.id JOIN app.students s ON s.school_id=i.school_id AND s.id=i.student_id
    LEFT JOIN app.attendance_sessions a ON a.school_id=p.school_id AND a.id=p.attendance_session_id LEFT JOIN app.lesson_occurrences l ON l.school_id=a.school_id AND l.id=a.lesson_id LEFT JOIN app.memberships m ON m.school_id=l.school_id AND m.id=l.member_id
    LEFT JOIN app.conduct_periods cp ON cp.school_id=p.school_id AND cp.id=p.conduct_period_id LEFT JOIN app.school_weeks w ON w.school_id=cp.school_id AND w.id=cp.week_id
    LEFT JOIN app.activities act ON act.school_id=p.school_id AND act.id=p.activity_id
    WHERE p.status='PUBLISHED' AND p.kind='${kinds[type]}' AND ($8::uuid IS NULL OR i.student_id=$8::uuid) AND ($10::uuid IS NULL OR cp.week_id=$10::uuid)
    AND coalesce(a.session_date,w.starts_on,(act.due_at AT TIME ZONE sch.timezone)::date)>=$6::date AND coalesce(a.session_date,w.starts_on,(act.due_at AT TIME ZONE sch.timezone)::date)<$7::date
    AND (${allowed('coalesce(a.session_date,w.starts_on,(act.due_at AT TIME ZONE sch.timezone)::date)','c.id')}${type==='activities'?` OR ${allowed('(act.due_at AT TIME ZONE sch.timezone)::date','c.id','*')}`:type==='attendance'?` OR (${allowed('a.session_date','c.id','l.subject_id')} AND a.granularity='LESSON' AND m.user_id=$9::uuid)`:''}) ${type==='conduct'?`AND ${allowed('(w.ends_on-1)','c.id')}`:''} ORDER BY source_date,p.id,i.student_id`);
  const fields:Record<string,[string,string][]>= {attendance:[['date','Ngày'],['slotLabel','Buổi / tiết'],['status','Trạng thái'],['publicNote','Ghi chú công khai']],conduct:[['periodLabel','Tuần'],['basePoints','Điểm gốc'],['bonusPoints','Cộng'],['penaltyPoints','Trừ'],['finalPoints','Tổng'],['classification','Xếp loại']],activities:[['title','Hoạt động'],['dueAt','Hạn'],['studentStatus','Trạng thái'],['publicReviewNote','Nhận xét đã chia sẻ']]};
  const cols=columns([...fields[type]!,['revision','Bản công bố']]);
  return {rows:rows.map(r=>{const payload=r.payload as Row;return row(r,Object.fromEntries(cols.map(c=>[c.key,c.key==='revision'?r.revision:payload[c.key]??null])));}),columns:cols,pins:[...new Set(rows.map(r=>String(r.publication_id)))]};
}
async function conduct(tx:Transaction,ctx:ReportContext){
  const snapshots=`, snapshots AS (SELECT DISTINCT ON(cp.id) c.id AS class_id,c.name AS class_name,cp.id,cp.status,w.week_number,p.id AS publication_id,p.status AS publication_status,p.revision,p.staff_snapshot
    FROM base c JOIN app.conduct_periods cp ON cp.school_id=c.school_id AND cp.class_id=c.id JOIN app.school_weeks w ON w.school_id=cp.school_id AND w.id=cp.week_id
    LEFT JOIN app.publication_revisions p ON p.school_id=cp.school_id AND p.conduct_period_id=cp.id AND p.status IN ('READY','PUBLISHED') AND cp.status='LOCKED'
    WHERE w.starts_on>=$6::date AND w.starts_on<$7::date AND ($10::uuid IS NULL OR w.id=$10::uuid) AND ${allowed('w.starts_on','c.id')} AND ${allowed('(w.ends_on-1)','c.id')} ORDER BY cp.id,p.created_at DESC,p.id DESC)`;
  if(!ctx.cls||ctx.input.scope==='SCHOOL'){
    const rows=await query(tx,ctx,`${snapshots} SELECT x.class_id,x.class_name AS label,x.week_number,x.status,x.publication_id,x.publication_status,x.revision,
      (SELECT count(*)::int FROM jsonb_array_elements(x.staff_snapshot#>'{conduct,students}') s WHERE $8::uuid IS NULL OR s->>'studentId'=$8::text) AS students,
      (SELECT round(avg((s->>'finalPoints')::numeric),2)::text FROM jsonb_array_elements(x.staff_snapshot#>'{conduct,students}') s WHERE $8::uuid IS NULL OR s->>'studentId'=$8::text) AS average,
      coalesce((SELECT jsonb_object_agg(label,n) FROM (SELECT coalesce(s->>'classification','Chưa xếp loại') AS label,count(*)::int AS n FROM jsonb_array_elements(x.staff_snapshot#>'{conduct,students}') s WHERE $8::uuid IS NULL OR s->>'studentId'=$8::text GROUP BY 1) bands),'{}'::jsonb) AS classifications
      FROM snapshots x ORDER BY week_number,label,x.id`);
    const cols=columns([['week','Tuần'],['status','Trạng thái'],['revision','Bản chốt'],['students','Học sinh trong bản chốt'],['average','Điểm trung bình'],['classifications','Phân bố xếp loại']]);
    return {rows:rows.map(r=>row(r,{week:r.week_number,status:r.publication_status??r.status,revision:r.revision??null,students:r.students,average:r.average,classifications:r.classifications})),columns:cols,pins:[...new Set(rows.filter(r=>r.publication_id).map(r=>String(r.publication_id)))]};
  }
  const rows=await query(tx,ctx,`${snapshots} SELECT x.class_id,x.class_name,s->>'studentId' AS student_id,coalesce(s->>'fullName',x.class_name) AS label,x.week_number,x.status,x.publication_id,x.publication_status,x.revision,s AS score
    FROM snapshots x LEFT JOIN LATERAL jsonb_array_elements(x.staff_snapshot#>'{conduct,students}') s ON true WHERE ($8::uuid IS NULL OR s->>'studentId'=$8::text) ORDER BY week_number,label,x.id`);
  const cols=columns([['week','Tuần'],['status','Trạng thái'],['revision','Bản chốt'],['basePoints','Điểm gốc'],['bonusPoints','Cộng'],['penaltyPoints','Trừ'],['finalPoints','Tổng'],['classification','Xếp loại']]);
  return {rows:rows.map(r=>row(r,{week:r.week_number,status:r.publication_status??r.status,revision:r.revision??null,...Object.fromEntries(['basePoints','bonusPoints','penaltyPoints','finalPoints','classification'].map(k=>[k,(r.score as Row|null)?.[k]??null]))})),columns:cols,pins:rows.filter(r=>r.publication_id).map(r=>String(r.publication_id))};
}
async function activities(tx:Transaction,ctx:ReportContext){
  const detail=!!ctx.cls&&ctx.input.scope!=='SCHOOL';
  const facts=`FROM base c JOIN app.activities a ON a.school_id=c.school_id AND a.class_id=c.id JOIN platform.schools sch ON sch.id=c.school_id
    JOIN app.activity_participants p ON p.school_id=a.school_id AND p.activity_id=a.id AND p.cancelled_at IS NULL
    JOIN app.enrollments e ON e.school_id=p.school_id AND e.id=p.enrollment_id JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id
    WHERE a.status IN ('ASSIGNED','CLOSED') AND (a.due_at AT TIME ZONE sch.timezone)::date>=$6::date AND (a.due_at AT TIME ZONE sch.timezone)::date<$7::date
    AND ($8::uuid IS NULL OR e.student_id=$8::uuid) AND ${allowed('(a.due_at AT TIME ZONE sch.timezone)::date','c.id','*')}`;
  if(!detail){const cols=columns([['activities','Hoạt động'],['assigned','Lượt được giao'],['approved','Đã duyệt'],['supplement','Cần bổ sung'],['pendingEvidence','Minh chứng chờ duyệt']]);
    const rows=await query(tx,ctx,`SELECT c.id AS class_id,c.name AS label,count(DISTINCT a.id)::int AS activities,count(*)::int AS assigned,count(*) FILTER(WHERE p.status='APPROVED')::int AS approved,count(*) FILTER(WHERE p.status='NEEDS_REVISION')::int AS supplement,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM app.evidence ev WHERE ev.school_id=p.school_id AND ev.participant_id=p.id AND ev.status='SUBMITTED'))::int AS "pendingEvidence" ${facts} GROUP BY c.id,c.name ORDER BY c.name,c.id`);
    return {rows:rows.map(r=>row(r,Object.fromEntries(cols.map(c=>[c.key,r[c.key]])))),columns:cols,pins:[] as string[]};}
  const rows=await query(tx,ctx,`SELECT c.id AS class_id,c.name AS class_name,a.id AS activity_id,a.title,e.student_id,s.full_name AS label,p.status,
    EXISTS(SELECT 1 FROM app.evidence ev WHERE ev.school_id=p.school_id AND ev.participant_id=p.id AND ev.status='SUBMITTED') AS pending_evidence
    ${facts} ORDER BY c.name,a.id,s.full_name,s.id`);
  const cols=columns([['activity','Hoạt động'],['status','Trạng thái'],['pendingEvidence','Có minh chứng chờ duyệt']]);return {rows:rows.map(r=>row(r,{activity:r.title,status:r.status,pendingEvidence:!!r.pending_evidence})),columns:cols,pins:[] as string[]};
}
async function operations(tx:Transaction,ctx:ReportContext){
  const ref="greatest($6::date,least($7::date-1,(SELECT (now() AT TIME ZONE timezone)::date FROM platform.schools WHERE id=$1)))",roster=`e.status<>'CANCELLED' AND e.starts_on<=${ref} AND (e.ends_on IS NULL OR e.ends_on>${ref})`;
  const rows=ctx.input.reportType==='parent-access'?await query(tx,ctx,`SELECT c.id AS class_id,c.name AS label,count(DISTINCT l.id)::int AS links,
    count(DISTINCT l.id) FILTER(WHERE l.revoked_at IS NULL AND l.expires_at>now() AND gr.status='VERIFIED' AND gr.can_receive_info AND gr.revoked_at IS NULL)::int AS active,
    count(DISTINCT l.id) FILTER(WHERE EXISTS(SELECT 1 FROM app.parent_access_events ev WHERE ev.school_id=l.school_id AND ev.access_link_id=l.id AND ev.event_kind IN ('EXCHANGED','READ')))::int AS opened
    FROM base c LEFT JOIN app.enrollments e ON e.school_id=c.school_id AND e.class_id=c.id AND ${roster} LEFT JOIN app.parent_access_links l ON l.school_id=e.school_id AND l.student_id=e.student_id AND l.year_id=e.year_id AND l.created_at::date>=$6::date AND l.created_at::date<$7::date
    LEFT JOIN app.guardian_relationships gr ON gr.school_id=l.school_id AND gr.id=l.relationship_id WHERE ${allowed(ref,'c.id')} GROUP BY c.id,c.name ORDER BY c.name,c.id`):await query(tx,ctx,`SELECT c.id AS class_id,c.name AS label,c.status,
    (SELECT count(*)::int FROM app.enrollments e WHERE e.school_id=c.school_id AND e.class_id=c.id AND ${roster}) AS students,
    EXISTS(SELECT 1 FROM app.teaching_assignments a JOIN app.role_grants rg ON rg.school_id=a.school_id AND rg.id=a.role_grant_id JOIN app.roles role ON role.school_id=rg.school_id AND role.id=rg.role_id AND role.status='ACTIVE' JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id AND m.status='ACTIVE' AND m.ended_at IS NULL JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE' WHERE a.school_id=c.school_id AND a.class_id=c.id AND a.kind='HOMEROOM' AND a.revoked_at IS NULL AND rg.revoked_at IS NULL AND rg.valid_from<=now() AND (rg.valid_until IS NULL OR rg.valid_until>now()) AND a.starts_on<=${ref} AND (a.ends_on IS NULL OR a.ends_on>${ref})) AS homeroom,
    (SELECT count(*)::int FROM app.conduct_records r WHERE r.school_id=c.school_id AND r.class_id=c.id AND r.status='DRAFT' AND r.occurred_at::date>=$6::date AND r.occurred_at::date<$7::date) AS pending,
    (SELECT count(*)::int FROM app.conduct_periods p WHERE p.school_id=c.school_id AND p.class_id=c.id AND p.status<>'LOCKED' AND p.input_deadline<now()) AS overdue,
    EXISTS(SELECT 1 FROM app.attendance_sessions s WHERE s.school_id=c.school_id AND s.class_id=c.id AND s.session_date=${ref} AND s.granularity='DAILY' AND s.slot_key IN ('morning','daily')) AS attendance
    FROM base c WHERE ${allowed(ref,'c.id')} ORDER BY c.name,c.id`);
  const cols=ctx.input.reportType==='parent-access'?columns([['links','Link đã cấp'],['active','Đang hiệu lực'],['opened','Link đã mở (không xác định danh tính)']]):columns([['status','Trạng thái lớp'],['students','Học sinh'],['homeroom','Có GVCN'],['attendance','Đã điểm danh tại ngày tham chiếu'],['pending','Ghi nhận chờ rà soát'],['overdue','Tuần quá hạn chưa chốt']]);
  return {rows:rows.map(r=>row(r,Object.fromEntries(cols.map(c=>[c.key,r[c.key]])))),columns:cols,pins:[] as string[]};
}
export async function buildReport(tx:Transaction,ctx:ReportContext):Promise<ReportData>{
  let result:Awaited<ReturnType<typeof attendance>>;
  if(ctx.input.reportType==='student-directory'){
    const seeGuardians=ctx.grants.some(g=>grantAllows(g,'guardian.read',{schoolId:ctx.schoolId},ctx.today)),ref=String((await one<{d:string}>(tx,'SELECT greatest($1::date,least($2::date,$3::date-1))::text AS d',[ctx.year.starts_on,ctx.today,ctx.year.ends_on]))!.d);
    const rows=(await tx.query<Row>(`SELECT s.id,s.full_name,s.student_code,s.date_of_birth,s.gender,s.status,c.name AS class_name,
      CASE WHEN $5::boolean THEN (SELECT count(*)::int FROM app.guardian_relationships gr WHERE gr.school_id=s.school_id AND gr.student_id=s.id AND gr.status<>'REVOKED' AND gr.revoked_at IS NULL) END AS guardians,
      CASE WHEN $5::boolean THEN (SELECT count(*)::int FROM app.guardian_relationships gr WHERE gr.school_id=s.school_id AND gr.student_id=s.id AND gr.status='VERIFIED' AND gr.revoked_at IS NULL) END AS verified
      FROM app.students s JOIN LATERAL(SELECT e.class_id FROM app.enrollments e WHERE e.school_id=s.school_id AND e.student_id=s.id AND e.year_id=$3 AND e.status<>'CANCELLED' AND e.starts_on<=$4::date ORDER BY (e.ends_on IS NULL OR e.ends_on>$4::date) DESC,e.starts_on DESC,e.id LIMIT 1) e ON true
      JOIN app.classes c ON c.school_id=s.school_id AND c.id=e.class_id WHERE s.school_id=$1 AND s.id=ANY($2::uuid[]) ORDER BY s.full_name,s.id LIMIT 5001`,[ctx.schoolId,ctx.input.studentIds,ctx.year.id,ref,seeGuardians])).rows;
    if(rows.length!==ctx.input.studentIds!.length)notFound();
    const cols=columns([['code','Mã HS'],['dateOfBirth','Ngày sinh'],['gender','Giới tính'],['className','Lớp'],['status','Trạng thái'],['guardians','Số người giám hộ'],['verified','Đã xác minh']]);
    result={rows:rows.map(r=>({label:String(r.full_name),studentId:String(r.id),values:{code:r.student_code,dateOfBirth:r.date_of_birth,gender:r.gender,className:r.class_name,status:r.status,guardians:r.guardians,verified:r.verified}})),columns:cols,pins:[]};
  }else if(ctx.input.reportType==='student'){
    const a=await attendance(tx,ctx),c=await published(tx,ctx,'conduct'),act=await activities(tx,ctx);
    result={rows:[...a.rows.map(r=>({...r,values:{section:'Chuyên cần',item:`${ctx.input.from} - ${ctx.input.to}`,result:r.values}})),...c.rows.map(r=>({...r,values:{section:'Thi đua đã công bố',item:r.values.periodLabel,result:r.values}})),...act.rows.map(r=>({...r,values:{section:'Hoạt động',item:r.values.activity,result:r.values.status}}))],columns:columns([['section','Mục'],['item','Nội dung'],['result','Kết quả']]),pins:c.pins};
  }else if(ctx.input.dataSource==='PUBLISHED_SNAPSHOT')result=await published(tx,ctx);
  else if(ctx.input.reportType==='attendance')result=await attendance(tx,ctx);
  else if(ctx.input.reportType==='conduct')result=await conduct(tx,ctx);
  else if(ctx.input.reportType==='activities')result=await activities(tx,ctx);
  else result=await operations(tx,ctx);
  if(result.rows.length>10000)throw new Problem(422,'REPORT_ROW_LIMIT_EXCEEDED');
  const asOf=String(iso((await one<{at:Date}>(tx,'SELECT now() AS at'))!.at));
  const sums=new Map<string,number>();for(const row of result.rows)for(const [key,value]of Object.entries(row.values))if(typeof value==='number'&&!['rate','week','revision'].includes(key))sums.set(key,(sums.get(key)??0)+value);
  const metrics=[{key:'rows',label:'Dòng kết quả trong phạm vi',value:result.rows.length,denominator:null,unit:'dòng',asOf},...result.columns.filter(c=>sums.has(c.key)).map(c=>({key:c.key,label:c.label,value:sums.get(c.key)!,denominator:null,unit:'lượt',asOf}))];
  const data:ReportData={reportType:ctx.input.reportType,title:titles[ctx.input.reportType]!,schoolName:String(ctx.school.name),yearName:String(ctx.year.name),scopeLabel:ctx.cls?String(ctx.cls.name):'Lớp',from:ctx.input.from,to:ctx.input.to,metrics,asOf,rows:result.rows,columns:result.columns,dataSource:ctx.input.dataSource as ReportData['dataSource'],publicationIds:[...new Set(result.pins)],notes:[ctx.input.reportType==='student'?'Thi đua chỉ gồm bản đã công bố; chuyên cần và hoạt động là dữ liệu nội bộ.':ctx.input.dataSource==='PUBLISHED_SNAPSHOT'?'Chỉ bản công bố hiện hành tại thời điểm đọc; các UUID bản công bố được ghim.':'Dữ liệu nội bộ tại thời điểm đọc; bản chốt thi đua bất biến, không coi bản đang mở là bảng chính thức.', 'Ngày kết thúc loại trừ. Không có thông tin liên hệ gia đình hoặc ghi chú nội bộ.']};
  if(Buffer.byteLength(JSON.stringify(data))>20*1024*1024)throw new Problem(422,'REPORT_SIZE_LIMIT_EXCEEDED');return data;
}
