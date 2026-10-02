import {Database,one,type Row} from '../../database/database';
import {Permissions,grantAllows} from '../../common/permissions';
import {Problem} from '../../common/problem';
import type {RequestContext} from '../../api.router';
export async function searchWorkspace(db:Database,policy:Permissions,c:RequestContext){
 const schoolId=c.query.schoolId,q=c.query.q?.trim();if(!q||q.length<2||q.length>200||Object.keys(c.query).some(k=>!['q','schoolId'].includes(k)))throw new Problem(422,'INVALID_QUERY');
 const needle='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
 return db.transaction(async tx=>{
  if(!schoolId){await policy.platform(c.principal!,'platform.schools.read',tx);const rows=(await tx.query<Row>('SELECT id,name,code,province FROM platform.schools WHERE name ILIKE $1 OR code ILIKE $1 OR province ILIKE $1 ORDER BY name,id LIMIT 8',[needle])).rows;return {data:{schoolId:null,items:rows.map(s=>({kind:'school',id:s.id,schoolId:s.id,yearId:null,classId:null,title:s.name,sub:[s.code,s.province].filter(Boolean).join(' · '),schoolWorkspace:true}))}};}
  const access=await policy.require(tx,c.principal!,'school.read',{schoolId,allowScopedContext:true,allowSubject:true}),bindings=access.grants.map(g=>({scope:g.scope_type,classId:g.class_id,actions:g.actions.filter(a=>['class.read','student.read','member.read'].includes(a)&&grantAllows(g,a,{schoolId,...(g.class_id?{classId:g.class_id}:{}),allowSubject:a!=='member.read'},access.today))}));
  const scope=(action:string,cls:string)=>`EXISTS(SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS g(scope text,"classId" uuid,actions text[]) WHERE '${action}'=ANY(g.actions) AND (g.scope='SCHOOL' OR g."classId"=${cls}))`;
  const schoolWorkspace=access.grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes('student.read'));
  const year=await one<Row>(tx,"SELECT id FROM app.academic_years WHERE school_id=$1 AND status='ACTIVE' ORDER BY starts_on DESC,id LIMIT 1",[schoolId]);
  const items:Record<string,unknown>[]=[];
  if(year){
   const classes=(await tx.query<Row>(`SELECT c.id,c.name,c.year_id,y.name AS year_name FROM app.classes c JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id WHERE c.school_id=$1 AND c.year_id=$4 AND ${scope('class.read','c.id')} AND (c.name ILIKE $3 OR c.code ILIKE $3) ORDER BY c.name,c.id LIMIT 6`,[schoolId,JSON.stringify(bindings),needle,year.id])).rows;
   items.push(...classes.map(r=>({kind:'class',id:r.id,schoolId,yearId:r.year_id,classId:r.id,title:'Lớp '+String(r.name),sub:String(r.year_name),schoolWorkspace})));
   const students=(await tx.query<Row>(`SELECT DISTINCT ON(s.id) s.id,s.full_name,s.student_code,c.id AS class_id,c.name AS class_name,c.year_id FROM app.students s JOIN app.enrollments e ON e.school_id=s.school_id AND e.student_id=s.id JOIN app.classes c ON c.school_id=e.school_id AND c.id=e.class_id WHERE s.school_id=$1 AND e.year_id=$4 AND e.status<>'CANCELLED' AND e.starts_on<=$5::date AND (e.ends_on IS NULL OR e.ends_on>$5::date) AND ${scope('student.read','c.id')} AND (s.full_name ILIKE $3 OR s.student_code ILIKE $3) ORDER BY s.id,c.id LIMIT 8`,[schoolId,JSON.stringify(bindings),needle,year.id,access.today])).rows;
   items.push(...students.map(r=>({kind:'student',id:r.id,schoolId,yearId:r.year_id,classId:r.class_id,title:r.full_name,sub:String(r.student_code)+' · Lớp '+String(r.class_name),schoolWorkspace})));
  }
  if(access.grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes('member.read'))){const rows=(await tx.query<Row>("SELECT id,work_display_name,department FROM app.memberships WHERE school_id=$1 AND (work_display_name ILIKE $2 OR staff_code ILIKE $2) ORDER BY work_display_name,id LIMIT 6",[schoolId,needle])).rows;items.push(...rows.map(r=>({kind:'teacher',id:r.id,schoolId,yearId:null,classId:null,title:r.work_display_name,sub:r.department??'',schoolWorkspace:true})));}
  return {data:{schoolId,items}};
 },{schoolId,userId:c.principal!.userId,readOnly:true});
}
