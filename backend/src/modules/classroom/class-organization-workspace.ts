import {Database,one,iso,type Row,type Transaction} from '../../database/database';
import {Permissions,grantAllows} from '../../common/permissions';
import {Problem,notFound,validation} from '../../common/problem';
import type {RequestContext} from '../../api.router';

type Context={schoolId:string;yearId:string;classId:string;today:string;referenceDate:string;classVersion:number;readOnly:boolean;canEdit:boolean;groupsVisible:boolean};
const enrolled="e.status<>'CANCELLED' AND e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date)";
const bounded=<T>(rows:T[],limit:number,code:string)=>{if(rows.length>limit)throw new Problem(422,code);return rows;};

/** Staff organization choices expose dated enrollment names, never pupil profiles or family contacts. */
export async function classOrganizationWorkspace(db:Database,policy:Permissions,c:RequestContext,section:'GROUPS'|'SEATING'){
 return db.transaction(async tx=>{
  if(Object.keys(c.query).some(k=>k!=='onDate'))throw new Problem(422,'INVALID_QUERY');
  const schoolId=c.params.schoolId!,yearId=c.params.yearId!,classId=c.params.classId!;
  const base=await policy.require(tx,c.principal!,'class.read',{schoolId,yearId,classId});
  const source=await one<Row>(tx,`SELECT cl.version,cl.status,y.status AS year_status,y.starts_on,y.ends_on,
   greatest(y.starts_on,least($4::date,y.ends_on-1))::text AS reference_date
   FROM app.classes cl JOIN app.academic_years y ON y.school_id=cl.school_id AND y.id=cl.year_id
   WHERE cl.school_id=$1 AND cl.id=$2 AND cl.year_id=$3`,[schoolId,classId,yearId,base.today]);
  if(!source)notFound();
  const referenceDate=c.query.onDate??String(source.reference_date);
  if(referenceDate<String(source.starts_on)||referenceDate>=String(source.ends_on))validation('onDate','Ngày ngoài năm học');
  const action=section==='GROUPS'?'group.manage':'seating.manage';
  const access=await policy.require(tx,c.principal!,action,{schoolId,yearId,classId,date:referenceDate});
  const readOnly=source.status==='ARCHIVED'||source.year_status==='ARCHIVED';
  const ctx:Context={schoolId,yearId,classId,today:base.today,referenceDate,classVersion:Number(source.version),readOnly,
   canEdit:!readOnly&&access.grants.some(g=>grantAllows(g,action,{schoolId,yearId,classId,date:base.today},base.today)),
   groupsVisible:access.grants.some(g=>grantAllows(g,'group.manage',{schoolId,yearId,classId,date:referenceDate},base.today))};
  const students=await roster(tx,ctx);
  if(section==='GROUPS')return {data:{...ctx,students,...await groups(tx,ctx)}};
  return {data:{...ctx,students,...await seating(tx,ctx,students)}};
 },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});
}

async function roster(tx:Transaction,ctx:Context){
 const groupSource=ctx.groupsVisible?`(SELECT gm.group_id FROM app.group_memberships gm WHERE gm.school_id=e.school_id AND gm.class_id=e.class_id
   AND gm.enrollment_id=e.id AND gm.cancelled_at IS NULL AND gm.starts_on<=$4::date AND gm.ends_on>$4::date)`:'NULL::uuid';
 const rows=bounded((await tx.query<Row>(`SELECT e.id AS enrollment_id,s.id,s.student_code,s.full_name,${groupSource} AS group_id
  FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id
  WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND ${enrolled}
  ORDER BY s.full_name COLLATE "C",s.id,e.id LIMIT 5001`,[ctx.schoolId,ctx.classId,ctx.yearId,ctx.referenceDate])).rows,5000,'CLASS_ORGANIZATION_ROSTER_LIMIT');
 return rows.map(r=>({id:r.id,enrollmentId:r.enrollment_id,studentCode:r.student_code,fullName:r.full_name,groupId:r.group_id??null}));
}

async function groups(tx:Transaction,ctx:Context){
 const params=[ctx.schoolId,ctx.classId,ctx.yearId,ctx.referenceDate];
 const definitions=bounded((await tx.query<Row>('SELECT id,version,name,sort_order FROM app.class_groups WHERE school_id=$1 AND class_id=$2 ORDER BY sort_order,id LIMIT 101',params.slice(0,2))).rows,100,'CLASS_ORGANIZATION_GROUP_LIMIT');
 const positions=bounded((await tx.query<Row>('SELECT id,version,code,name,single_holder,group_id FROM app.class_positions WHERE school_id=$1 AND class_id=$2 ORDER BY code,id LIMIT 501',params.slice(0,2))).rows,500,'CLASS_ORGANIZATION_POSITION_LIMIT');
 const holders=bounded((await tx.query<Row>(`SELECT a.id,a.version,a.position_id,a.enrollment_id,a.starts_on,a.ends_on
  FROM app.position_assignments a JOIN app.enrollments e ON e.school_id=a.school_id AND e.id=a.enrollment_id
  WHERE a.school_id=$1 AND a.class_id=$2 AND a.cancelled_at IS NULL AND a.starts_on<=$4::date AND a.ends_on>$4::date
  AND e.class_id=$2 AND e.year_id=$3 AND ${enrolled} ORDER BY a.position_id,a.id LIMIT 5001`,params)).rows,5000,'CLASS_ORGANIZATION_HOLDER_LIMIT');
 return {groups:definitions.map(g=>({id:g.id,version:g.version,name:g.name,sortOrder:g.sort_order})),
  positionDefinitions:positions.map(p=>({id:p.id,version:p.version,code:p.code,name:p.name,singleHolder:p.single_holder,groupId:p.group_id??null})),
  holders:holders.map(a=>({id:a.id,version:a.version,positionId:a.position_id,enrollmentId:a.enrollment_id,startsOn:a.starts_on,endsOn:a.ends_on}))};
}

async function seating(tx:Transaction,ctx:Context,students:Awaited<ReturnType<typeof roster>>){
 const history=bounded((await tx.query<Row>(`SELECT p.id,p.version,p.revision,p.effective_on,p.ends_on,p.status,p.created_at,
  m.work_display_name AS created_by_name FROM app.seating_plans p LEFT JOIN app.memberships m
  ON m.school_id=p.school_id AND m.user_id=p.created_by AND m.status='ACTIVE'
  WHERE p.school_id=$1 AND p.class_id=$2 ORDER BY p.revision DESC,p.id LIMIT 501`,[ctx.schoolId,ctx.classId])).rows,500,'CLASS_ORGANIZATION_SEATING_HISTORY_LIMIT');
 const active=(await tx.query<Row>(`SELECT id,version,revision,effective_on,ends_on,layout FROM app.seating_plans
  WHERE school_id=$1 AND class_id=$2 AND status='ACTIVE' AND effective_on<=$3::date AND (ends_on IS NULL OR ends_on>$3::date)
  ORDER BY effective_on DESC,revision DESC LIMIT 2`,[ctx.schoolId,ctx.classId,ctx.referenceDate])).rows;
 if(active.length>1)throw new Problem(409,'SEATING_SOURCE_AMBIGUOUS');
 let plan=null;
 if(active[0]){
  const p=active[0],layout=p.layout as {seats:Array<{key:string;row:number;column:number;enrollmentId:string|null}>;note?:string};
  const rows=layout.seats.length?Math.max(...layout.seats.map(s=>s.row))+1:null,cols=layout.seats.length?Math.max(...layout.seats.map(s=>s.column))+1:null;
  const present=new Set(students.map(s=>s.enrollmentId));
  plan={id:p.id,version:p.version,revision:p.revision,effectiveOn:p.effective_on,endsOn:p.ends_on,rows,cols,note:layout.note??null,
   seats:layout.seats.map(s=>({...s,enrollmentId:s.enrollmentId&&present.has(s.enrollmentId)?s.enrollmentId:null}))};
 }
 const groupNames=ctx.groupsVisible?bounded((await tx.query<Row>('SELECT id,name FROM app.class_groups WHERE school_id=$1 AND class_id=$2 ORDER BY sort_order,id LIMIT 101',[ctx.schoolId,ctx.classId])).rows,100,'CLASS_ORGANIZATION_GROUP_LIMIT').map(g=>({id:g.id,name:g.name})):null;
 return {plan,groupNames,latestRevision:Number(history[0]?.revision??0),history:history.map(p=>({id:p.id,version:p.version,revision:p.revision,effectiveOn:p.effective_on,endsOn:p.ends_on,status:p.status,createdAt:iso(p.created_at as Date),createdByName:p.created_by_name??null}))};
}
