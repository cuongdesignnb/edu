import crypto from 'node:crypto';
import {Injectable} from '@nestjs/common';
import {Database,one,type Row,type Transaction} from '../../database/database';
import {Permissions} from '../../common/permissions';
import {Commands,audit} from '../../common/commands';
import {notFound,Problem} from '../../common/problem';
import type {Handler,RequestContext} from '../../api.router';
const flags=['publicStudentConductEnabled','publicStudentAttendanceEnabled','publicStudentActivitiesEnabled','publicRankingEnabled','publicSeatingEnabled'] as const;
const defaults=Object.fromEntries(flags.map(k=>[k,false]));
const dto=(r:Row|undefined)=>({version:Number(r?.version??0),slug:r?.slug??null,publicPortalEnabled:r?.enabled===true,...defaults,...r?.settings as Row});
const clean=(value:unknown,max=1000)=>typeof value==='string'?value.slice(0,max):'';
@Injectable()
export class PublicClassService{
 constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands){}
 handlers():Record<string,Handler>{return {
  getClassPublicPortalSettings:c=>this.manage(c),saveClassPublicPortalSettings:c=>this.manage(c),getPublicClassPortal:c=>this.publicRead(c),getPublicClassStudent:c=>this.publicRead(c),
 };}
 private async manage(c:RequestContext){
  const schoolId=c.params.schoolId!,classId=c.params.classId!,authorize=(tx:Transaction)=>this.policy.require(tx,c.principal!,'parent_access.manage',{schoolId,classId});
  const work=async(tx:Transaction)=>{
   const cls=await one(tx,'SELECT id FROM app.classes WHERE school_id=$1 AND id=$2',[schoolId,classId]);if(!cls)notFound();
   const current=await one<Row>(tx,'SELECT * FROM platform.public_class_portals WHERE school_id=$1 AND class_id=$2'+(c.operation.method==='POST'?' FOR UPDATE':''),[schoolId,classId]);
   if(c.operation.method==='GET')return {data:dto(current)};
   if(Number(current?.version??0)!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT');
   const settings=Object.fromEntries(flags.map(k=>[k,c.body[k]===true])),slug=!current||c.body.rotateSlug?crypto.randomBytes(12).toString('hex'):current.slug;
   const r=await one<Row>(tx,`INSERT INTO platform.public_class_portals(school_id,class_id,slug,enabled,settings,updated_by)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school_id,class_id) DO UPDATE SET slug=excluded.slug,enabled=excluded.enabled,settings=excluded.settings,version=public_class_portals.version+1,updated_at=now(),updated_by=excluded.updated_by RETURNING *`,[schoolId,classId,slug,c.body.publicPortalEnabled,settings,c.principal!.userId]);
   await audit(tx,c,'class',classId,{publicPortalEnabled:c.body.publicPortalEnabled,...settings,slugRotated:c.body.rotateSlug===true});return {data:dto(r)};
  };
  if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId,userId:c.principal!.userId,readOnly:true});
  return this.commands.execute(c,authorize,work);
 }
 private async publicRead(c:RequestContext){
  if(Object.keys(c.query).length)throw new Problem(422,'INVALID_QUERY');
  const portal=await one<Row>(this.db.app as unknown as Transaction,`SELECT p.* FROM platform.public_class_portals p JOIN platform.schools s ON s.id=p.school_id AND s.status='ACTIVE' WHERE p.slug=$1 AND p.enabled`,[c.params.publicClassSlug]);if(!portal)notFound();
  return this.db.transaction(async tx=>{
   // Recheck enabled/slug in the same snapshot as published content.
   if(!await one(tx,'SELECT class_id FROM platform.public_class_portals WHERE school_id=$1 AND class_id=$2 AND slug=$3 AND version=$4 AND enabled',[portal.school_id,portal.class_id,c.params.publicClassSlug,portal.version]))notFound();
   const info=await one<Row>(tx,`SELECT c.name AS class_name,y.name AS year_name,s.name AS school_name,s.slug AS school_slug,s.timezone,
    (SELECT m.work_display_name FROM app.teaching_assignments a JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id
    WHERE a.school_id=c.school_id AND a.class_id=c.id AND a.kind='HOMEROOM' AND a.revoked_at IS NULL AND a.starts_on<=(now() AT TIME ZONE s.timezone)::date AND (a.ends_on IS NULL OR a.ends_on>(now() AT TIME ZONE s.timezone)::date) ORDER BY a.starts_on DESC LIMIT 1) AS homeroom
    FROM app.classes c JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id JOIN platform.schools s ON s.id=c.school_id WHERE c.school_id=$1 AND c.id=$2`,[portal.school_id,portal.class_id]);if(!info)notFound();
   await tx.query("SELECT set_config('TimeZone',$1,true)",[info.timezone]);
   const students=(await tx.query<Row>(`SELECT st.id,e.id AS enrollment_id,st.full_name,g.name AS group_name,
    ARRAY(SELECT pos.name FROM app.position_assignments pa JOIN app.class_positions pos ON pos.school_id=pa.school_id AND pos.id=pa.position_id
     WHERE pa.school_id=e.school_id AND pa.enrollment_id=e.id AND pa.starts_on<=CURRENT_DATE AND (pa.ends_on IS NULL OR pa.ends_on>CURRENT_DATE)) AS positions
    FROM app.enrollments e JOIN app.students st ON st.school_id=e.school_id AND st.id=e.student_id LEFT JOIN app.group_memberships gm ON gm.school_id=e.school_id AND gm.enrollment_id=e.id AND gm.starts_on<=CURRENT_DATE AND (gm.ends_on IS NULL OR gm.ends_on>CURRENT_DATE) LEFT JOIN app.class_groups g ON g.school_id=gm.school_id AND g.id=gm.group_id
    WHERE e.school_id=$1 AND e.class_id=$2 AND e.status<>'CANCELLED' AND e.starts_on<=(now() AT TIME ZONE $3)::date AND (e.ends_on IS NULL OR e.ends_on>(now() AT TIME ZONE $3)::date)
    ORDER BY st.full_name,st.id LIMIT 2001`,[portal.school_id,portal.class_id,info.timezone])).rows;
   if(students.length>2000)throw new Problem(422,'PORTAL_SIZE_LIMIT');
   const settings={...defaults,...portal.settings as Row};
   const published=(await tx.query<Row>(`SELECT p.id,p.kind,p.announcement_root_id,p.staff_snapshot,p.public_payload,p.published_at,i.student_id,i.payload
    FROM app.publication_revisions p LEFT JOIN app.parent_publication_items i ON i.school_id=p.school_id AND i.publication_id=p.id
    WHERE p.school_id=$1 AND (p.class_id=$2 OR p.class_id IS NULL AND p.kind='ANNOUNCEMENT' AND p.public_payload IS NOT NULL) AND p.status='PUBLISHED' ORDER BY p.published_at DESC,p.id LIMIT 5001`,[portal.school_id,portal.class_id])).rows;
   if(published.length>5000)throw new Problem(422,'PORTAL_SIZE_LIMIT');
   const studentList=students.map(s=>({id:s.id,fullName:s.full_name,groupName:s.group_name??null,roles:s.positions??[]}));
   if(c.operation.id==='getPublicClassStudent'){
    const student=studentList.find(s=>s.id===c.params.studentId);if(!student)notFound();
    const histories=published.filter(p=>p.student_id===student.id);
    const conduct=settings.publicStudentConductEnabled?histories.filter(p=>p.kind==='CONDUCT').map(p=>({publicationId:p.id,...this.child(p.payload as Row,'conduct')})):[];
    return {data:{student,conduct,attendance:settings.publicStudentAttendanceEnabled?histories.filter(p=>p.kind==='ATTENDANCE').map(p=>this.child(p.payload as Row,'attendance')):[],activities:settings.publicStudentActivitiesEnabled?histories.filter(p=>p.kind==='ACTIVITY').map(p=>this.child(p.payload as Row,'activities')):[]}};
   }
   const timetable=published.find(p=>p.kind==='TIMETABLE'),duty=published.find(p=>p.kind==='DUTY');
   const announcements=published.filter(p=>p.kind==='ANNOUNCEMENT'&&p.public_payload).filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i).map(p=>({id:p.id,title:clean((p.public_payload as Row).title,200),href:`/schools/${info.school_slug}/announcements/${p.announcement_root_id}`,publishedAt:(p.published_at as Date).toISOString()}));
   const rules=(await tx.query<Row>(`SELECT r.label,r.default_delta FROM app.class_rule_periods cr JOIN app.rule_sets rs ON rs.school_id=cr.school_id AND rs.id=cr.rule_set_id AND rs.status='ISSUED' JOIN app.conduct_rules r ON r.school_id=rs.school_id AND r.rule_set_id=rs.id AND r.share_with_parent WHERE cr.school_id=$1 AND cr.class_id=$2 AND cr.starts_on<=CURRENT_DATE AND (cr.ends_on IS NULL OR cr.ends_on>CURRENT_DATE) ORDER BY r.code LIMIT 1000`,[portal.school_id,portal.class_id])).rows.map(r=>({label:r.label,points:String(r.default_delta)}));
   const plan=settings.publicSeatingEnabled?await one<Row>(tx,`SELECT layout FROM app.seating_plans WHERE school_id=$1 AND class_id=$2 AND status='ACTIVE' AND effective_on<=CURRENT_DATE AND (ends_on IS NULL OR ends_on>CURRENT_DATE) ORDER BY effective_on DESC,revision DESC LIMIT 1`,[portal.school_id,portal.class_id]):undefined;
   const seats=Array.isArray((plan?.layout as Row)?.seats)?(plan!.layout as Row).seats as Row[]:[];
   const seating=seats.map(s=>({row:Number(s.row),column:Number(s.column),studentName:students.find(st=>st.enrollment_id===s.enrollmentId)?.full_name??null}));
   const latest=new Map<string,Row>();for(const p of published)if(p.kind==='CONDUCT'&&p.student_id&&!latest.has(String(p.student_id)))latest.set(String(p.student_id),p.payload as Row);
   const ranking=settings.publicRankingEnabled&&settings.publicStudentConductEnabled?studentList.flatMap(s=>{const score=latest.get(String(s.id));return score?[{studentId:s.id,fullName:s.fullName,finalPoints:String(score.finalPoints),periodLabel:String(score.periodLabel)}]:[];}).sort((a,b)=>Number(b.finalPoints)-Number(a.finalPoints)):[];
   return {data:{schoolName:info.school_name,className:info.class_name,yearName:info.year_name,homeroomName:info.homeroom??null,settings,students:studentList,
    timetable:this.lessons(timetable?.payload as Row|undefined),duties:this.duties(duty?.staff_snapshot as Row|undefined),announcements,rules,seating,ranking}};
  },{schoolId:String(portal.school_id),readOnly:true});
 }
 private child(p:Row,kind:string){
  const keys=kind==='conduct'?['periodLabel','finalPoints','classification','publishedAt']:kind==='attendance'?['date','slotLabel','status','publishedAt']:['title','studentStatus','publishedAt'];
  return Object.fromEntries(keys.map(k=>[k,p[k]===null?null:clean(String(p[k]??''),200)]));
 }
 private lessons(snapshot?:Row){const list=Array.isArray(snapshot?.items)?snapshot.items as Row[]:[];return list.filter(l=>l.status!=='CANCELLED').slice(0,5000).map(l=>({subjectName:clean(String(l.subjectName??''),200),teacherName:clean(String(l.teacherName??''),200),startsAt:clean(String(l.startsAt??''),100),endsAt:clean(String(l.endsAt??''),100)}));}
 private duties(snapshot?:Row){const list=Array.isArray((snapshot?.duty as Row)?.assignments)?(snapshot!.duty as Row).assignments as Row[]:[];return list.slice(0,5000).map(l=>({date:clean(String(l.dutyDate??l.duty_date??''),100),task:clean(String(l.task??''),500)}));}
}
