import { Injectable } from '@nestjs/common';
import { Database,one,iso,type Row,type Transaction } from '../../database/database';
import { getResource,resource,listResource,type Resource } from '../../database/resources';
import { Permissions,grantAllows,type Grant } from '../../common/permissions';
import { notFound } from '../../common/problem';
import { allows,baseClasses,requestContext,taskResource } from './dashboard-data';
import type { Handler,RequestContext,Result } from '../../api.router';

interface ViewContext {schoolId:string;today:string;referenceDate:string;year:Row|undefined;asOf:string;memberId:string;grants:Grant[];bindings:unknown[]}
interface Metric {key:string;label:string;value:number;denominator:number|null;unit:string;asOf:string}
const ownClasses:Resource={...resource('class'),table:`(WITH ${requestContext} SELECT c.*,
  CASE WHEN ${allows('student.read','c.id','*')} THEN (SELECT count(*)::int FROM app.enrollments e WHERE e.school_id=c.school_id AND e.class_id=c.id AND e.status<>'CANCELLED' AND e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date)) END AS student_count,
  coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',a.id,'kind',a.kind,'subjectId',a.subject_id,'startsOn',a.starts_on,'endsOn',a.ends_on)) ORDER BY a.kind,a.id)
   FROM app.teaching_assignments a JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
   JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
   WHERE a.school_id=c.school_id AND a.class_id=c.id AND a.member_id=$6::uuid AND a.revoked_at IS NULL AND a.starts_on<=$4::date AND (a.ends_on IS NULL OR a.ends_on>$4::date)),'[]'::jsonb) AS my_assignments
  FROM (${baseClasses}) c)`,fields:{...resource('class').fields,studentCount:'student_count',myAssignments:'my_assignments'}};
@Injectable()
export class DashboardsService {
  constructor(private readonly db:Database,private readonly policy:Permissions){}
  handlers():Record<string,Handler>{return Object.fromEntries(['getSchoolOverview','getTeacherOverview','getClassOverview','listMyClasses','listMyTasks'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  private async context(tx:Transaction,c:RequestContext):Promise<ViewContext>{
    const schoolId=c.params.schoolId!,school=c.operation.id==='getSchoolOverview',classId=c.params.classId;
    const access=school||classId?await this.policy.require(tx,c.principal!,c.operation.permission,{schoolId,...(classId?{classId}:{}),allowSubject:!!classId}):await this.policy.collection(tx,c.principal!,'teacher.self',schoolId,true);
    const cls=classId?await getResource(tx,resource('class'),schoolId,classId):undefined;
    if(cls&&c.query.yearId&&cls.year_id!==c.query.yearId)notFound();
    const yearId=String(c.query.yearId??cls?.year_id??'');
    const year=yearId?await getResource(tx,resource('year'),schoolId,yearId):await one<Row>(tx,"SELECT * FROM app.academic_years WHERE school_id=$1 AND status='ACTIVE' AND starts_on<=$2::date AND ends_on>$2::date ORDER BY starts_on DESC,id LIMIT 1",[schoolId,access.today]);
    const date=year?(await one<{date:string}>(tx,'SELECT greatest($1::date,least($2::date,$3::date-1))::text AS date',[year.starts_on,access.today,year.ends_on]))!.date:access.today;
    const membership=(await one<{id:string}>(tx,"SELECT id FROM app.memberships WHERE school_id=$1 AND user_id=$2 AND status='ACTIVE' AND ended_at IS NULL",[schoolId,c.principal!.userId]))!;
    let classes:string[]|null=school?null:classId?[classId]:[...new Set(access.grants.filter(g=>g.class_id&&grantAllows(g,'teacher.self',{schoolId,classId:g.class_id,allowSubject:true},access.today)).map(g=>g.class_id!))];
    if(!school&&!classId&&access.grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes('teacher.self')))classes=(await tx.query<{class_id:string}>(`SELECT DISTINCT a.class_id FROM app.teaching_assignments a JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()) JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE' WHERE a.school_id=$1 AND a.member_id=$2 AND a.revoked_at IS NULL AND a.starts_on<=$3 AND (a.ends_on IS NULL OR a.ends_on>$3)`,[schoolId,membership.id,access.today])).rows.map(a=>a.class_id);
    const current=access.grants.map(g=>({scope_type:g.scope_type,class_id:g.class_id,subject_id:g.subject_id,actions:g.actions.filter(action=>grantAllows(g,action,{schoolId,...(g.class_id?{classId:g.class_id}:{}),allowSubject:true,allowScopedContext:true},access.today))}));
    const asOf=iso((await one<{at:Date}>(tx,'SELECT now() AS at'))!.at) as string;
    return {schoolId,today:access.today,referenceDate:date,year,asOf,memberId:membership.id,grants:access.grants,bindings:[JSON.stringify(current),year?.id??null,date,c.principal!.userId,membership.id,classes,!!year&&year.status==='ACTIVE'&&String(year.starts_on)<=access.today&&String(year.ends_on)>access.today]};
  }
  private has(ctx:ViewContext,action:string,allowSubject=false){
    const classes=ctx.bindings[5] as string[]|null;
    return ctx.grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes(action)||(g.class_id&&(!classes||classes.includes(g.class_id))&&grantAllows(g,action,{schoolId:ctx.schoolId,classId:g.class_id,allowSubject},ctx.today)));
  }
  private async metrics(tx:Transaction,ctx:ViewContext){
    const metrics:Metric[]=[],values=[ctx.schoolId,...ctx.bindings],enrollment="e.status<>'CANCELLED' AND e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date)";
    const count=async(key:string,label:string,sql:string,unit='đối tượng')=>{const row=(await one<{n:string}>(tx,`WITH ${requestContext},base AS (${baseClasses}) ${sql}`,values))!;metrics.push({key,label,value:Number(row.n),denominator:null,unit,asOf:ctx.asOf});};
    await count('classes','Lớp trong phạm vi','SELECT count(*) AS n FROM base','lớp');
    if(this.has(ctx,'student.read',true))await count('students','Học sinh tại ngày tham chiếu',`SELECT count(DISTINCT e.student_id) AS n FROM base c JOIN app.enrollments e ON e.school_id=c.school_id AND e.class_id=c.id WHERE ${enrollment} AND ${allows('student.read','c.id','*')}`,'học sinh');
    if(ctx.grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes('member.read')))await count('staff','Nhân sự đang hoạt động',"SELECT count(*) AS n FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE' WHERE m.school_id=$1 AND m.status='ACTIVE' AND m.ended_at IS NULL",'nhân sự');
    if(this.has(ctx,'conduct.read'))await count('pendingConduct','Ghi nhận thi đua chờ rà soát',`SELECT count(*) AS n FROM base c JOIN app.conduct_records r ON r.school_id=c.school_id AND r.class_id=c.id WHERE r.status='DRAFT' AND ${allows('conduct.read','c.id')}`,'ghi nhận');
    if(this.has(ctx,'evidence.read'))await count('pendingEvidence','Minh chứng chờ duyệt',`SELECT count(*) AS n FROM base c JOIN app.activities a ON a.school_id=c.school_id AND a.class_id=c.id JOIN app.activity_participants p ON p.school_id=a.school_id AND p.activity_id=a.id AND p.cancelled_at IS NULL JOIN app.evidence e ON e.school_id=p.school_id AND e.participant_id=p.id WHERE a.status<>'ARCHIVED' AND e.status='SUBMITTED' AND ${allows('evidence.read','c.id')}`,'minh chứng');
    if(this.has(ctx,'activity.read',true))await count('activities','Hoạt động đang giao',`SELECT count(*) AS n FROM base c JOIN app.activities a ON a.school_id=c.school_id AND a.class_id=c.id WHERE a.status='ASSIGNED' AND ${allows('activity.read','c.id','*')}`,'hoạt động');
    if(this.has(ctx,'attendance.read')){
      const predicate=`FROM base c JOIN app.enrollments e ON e.school_id=c.school_id AND e.class_id=c.id LEFT JOIN app.attendance_sessions s ON s.school_id=e.school_id AND s.class_id=e.class_id AND s.session_date=$4::date AND s.granularity='DAILY' AND s.slot_key IN ('morning','daily') LEFT JOIN app.attendance_records r ON r.school_id=s.school_id AND r.session_id=s.id AND r.enrollment_id=e.id WHERE ${enrollment} AND ${allows('attendance.read','c.id')}`;
      await count('attendancePresent','Có mặt buổi sáng',`SELECT count(*) AS n ${predicate} AND r.status IN ('PRESENT','LATE')`,'học sinh');
      await count('attendanceAbsent','Vắng buổi sáng',`SELECT count(*) AS n ${predicate} AND r.status IN ('EXCUSED','UNEXCUSED')`,'học sinh');
      await count('attendanceUnmarked','Chưa ghi trạng thái buổi sáng',`SELECT count(*) AS n ${predicate} AND (r.id IS NULL OR r.status='UNMARKED')`,'học sinh');
    }
    if(this.has(ctx,'schedule.read',true))await count('ownLessonsToday','Tiết giảng dạy hôm nay',`SELECT count(*) AS n FROM base c JOIN app.lesson_occurrences l ON l.school_id=c.school_id AND l.class_id=c.id JOIN platform.schools s ON s.id=c.school_id WHERE l.member_id=$6::uuid AND l.status='SCHEDULED' AND (l.starts_at AT TIME ZONE s.timezone)::date=$4::date AND ${allows('schedule.read','c.id','l.subject_id')}`,'tiết');
    if(this.has(ctx,'parent_access.manage'))await count('parentLinks','Link phụ huynh còn hiệu lực',`SELECT count(DISTINCT l.id) AS n FROM base c JOIN app.enrollments e ON e.school_id=c.school_id AND e.class_id=c.id JOIN app.parent_access_links l ON l.school_id=e.school_id AND l.student_id=e.student_id AND l.year_id=e.year_id JOIN app.guardian_relationships gr ON gr.school_id=l.school_id AND gr.id=l.relationship_id AND gr.student_id=l.student_id WHERE ${enrollment} AND l.revoked_at IS NULL AND l.expires_at>now() AND gr.status='VERIFIED' AND gr.can_receive_info AND gr.revoked_at IS NULL AND ${allows('parent_access.manage','c.id')}`,'link');
    await count('unreadNotifications','Thông báo chưa đọc',"SELECT count(*) AS n FROM app.notifications WHERE school_id=$1 AND member_id=$6::uuid AND read_at IS NULL",'thông báo');return metrics;
  }
  private async tasks(tx:Transaction,c:RequestContext,ctx:ViewContext,preview=false){
    const query:Record<string,string>=preview?{limit:'6',sort:'id'}:{...c.query};delete query.yearId;
    return listResource(tx,taskResource,ctx.schoolId,query,undefined,c.principal!.userId,ctx.bindings);
  }
  private async handle(c:RequestContext):Promise<Result>{
    return this.db.transaction(async tx=>{
      const ctx=await this.context(tx,c);
      if(c.operation.id==='listMyClasses'){const query={...c.query};delete query.yearId;return listResource(tx,ownClasses,ctx.schoolId,query,undefined,c.principal!.userId,ctx.bindings);}
      if(c.operation.id==='listMyTasks')return this.tasks(tx,c,ctx);
      return {data:{metrics:await this.metrics(tx,ctx),tasks:(await this.tasks(tx,c,ctx,true)).data,asOf:ctx.asOf,referenceDate:ctx.referenceDate,...(ctx.year?{yearId:ctx.year.id}:{})}};
    },{schoolId:c.params.schoolId,readOnly:true});
  }
}
