import {one,type Transaction,type Row} from '../../database/database';
import {listResource,type Resource,type Predicate} from '../../database/resources';
import {Problem,notFound} from '../../common/problem';
import type {Grant} from '../../common/permissions';
import type {RequestContext} from '../../api.router';

export function schoolStudentCapability(grants:Grant[],action:string){return grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes(action));}
export type StudentYear={id:string;version:number;name:string;status:string;startsOn:string;endsOn:string};
export async function studentYear(tx:Transaction,schoolId:string,today:string,yearId?:string){
  const row=await one<Row>(tx,`SELECT id,version,name,status,starts_on,ends_on FROM app.academic_years WHERE school_id=$1
    AND ${yearId?'id=$2':"status='ACTIVE'"} ORDER BY starts_on DESC,id LIMIT 1`,yearId?[schoolId,yearId]:[schoolId]);
  if(yearId&&!row)notFound();
  const year:StudentYear|null=row?{id:String(row.id),version:Number(row.version),name:String(row.name),status:String(row.status),startsOn:String(row.starts_on),endsOn:String(row.ends_on)}:null;
  // The last included day is a display reference, never an authorization date.
  const referenceDate=year?(await one<{day:string}>(tx,'SELECT greatest($1::date,least($2::date,$3::date-1))::text AS day',[year.startsOn,today,year.endsOn]))!.day:null;
  return {year,referenceDate};
}

const directory:Resource={table:`(WITH rows AS (
 SELECT s.*,e.id AS enrollment_id,e.version AS enrollment_version,e.class_id,c.name AS class_name,e.year_id,y.name AS year_name,
 e.starts_on<= $3::date AND (e.ends_on IS NULL OR e.ends_on>$3::date) AS enrollment_in_effect,
 CASE WHEN $4::boolean THEN (SELECT count(*)::int FROM app.guardian_relationships gr JOIN app.guardians g
   ON g.school_id=gr.school_id AND g.id=gr.guardian_id WHERE gr.school_id=s.school_id AND gr.student_id=s.id
   AND gr.status<>'REVOKED' AND gr.revoked_at IS NULL AND g.status='ACTIVE') END AS guardian_count,
 CASE WHEN $4::boolean THEN (SELECT count(*)::int FROM app.guardian_relationships gr JOIN app.guardians g
   ON g.school_id=gr.school_id AND g.id=gr.guardian_id WHERE gr.school_id=s.school_id AND gr.student_id=s.id
   AND gr.status='VERIFIED' AND gr.revoked_at IS NULL AND g.status='ACTIVE') END AS verified_guardians,
 CASE WHEN $5::boolean THEN (SELECT count(*)::int FROM app.parent_access_links l JOIN app.guardian_relationships gr
   ON gr.school_id=l.school_id AND gr.id=l.relationship_id WHERE l.school_id=s.school_id AND l.student_id=s.id AND l.year_id=$2::uuid
   AND l.revoked_at IS NULL AND l.expires_at>now() AND gr.status='VERIFIED' AND gr.can_receive_info AND gr.revoked_at IS NULL) END AS active_links,
 regexp_replace(btrim(s.full_name),'^.*[[:space:]]','') AS given_name
 FROM app.students s JOIN LATERAL (SELECT e.* FROM app.enrollments e WHERE e.school_id=s.school_id AND e.student_id=s.id
   AND e.year_id=$2::uuid AND e.status<>'CANCELLED' AND e.starts_on<=$3::date ORDER BY e.starts_on DESC,e.id DESC LIMIT 1) e ON true
 JOIN app.classes c ON c.school_id=e.school_id AND c.id=e.class_id JOIN app.academic_years y ON y.school_id=e.school_id AND y.id=e.year_id
 WHERE s.school_id=$1
) SELECT * FROM rows)`,fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',studentCode:'student_code',fullName:'full_name',dateOfBirth:'date_of_birth',gender:'gender',status:'status',
 enrollmentId:'enrollment_id',enrollmentVersion:'enrollment_version',classId:'class_id',className:'class_name',yearId:'year_id',yearName:'year_name',enrollmentInEffect:'enrollment_in_effect',guardianCount:'guardian_count',verifiedGuardians:'verified_guardians',activeLinks:'active_links'},
 writeFields:[],search:[],filters:{classId:'class_id',status:'status'},sortKeys:{fullName:[{column:'given_name',collation:'app.vi_names'},{column:'full_name',collation:'app.vi_names'}],className:[{column:'class_name',collation:'app.vi_names'},{column:'given_name',collation:'app.vi_names'},{column:'full_name',collation:'app.vi_names'}]}};

async function filters(tx:Transaction,c:RequestContext,canSeeGuardians:boolean):Promise<Predicate>{
  const parts:string[]=[],values:unknown[]=[];
  if(c.query.guardian){if(!canSeeGuardians)throw new Problem(403,'FORBIDDEN');parts.push('t.verified_guardians=0');}
  if(c.query.q){const q=(await one<{q:string}>(tx,'SELECT app.fold_vi(btrim($1)) AS q',[c.query.q]))!.q;
    values.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');parts.push(`(app.fold_vi(t.full_name) LIKE $${values.length} OR app.fold_vi(t.student_code) LIKE $${values.length})`);}
  return {sql:parts.join(' AND '),values};
}
export async function studentDirectory(tx:Transaction,c:RequestContext,access:{today:string;grants:Grant[]},idsOnly=false){
  if(!schoolStudentCapability(access.grants,'student.read'))throw new Problem(403,'FORBIDDEN');
  const schoolId=c.params.schoolId!,{year,referenceDate}=await studentYear(tx,schoolId,access.today,c.query.yearId);
  if(c.query.classId){const cls=await one<Row>(tx,'SELECT id,year_id FROM app.classes WHERE school_id=$1 AND id=$2',[schoolId,c.query.classId]);if(!cls||!year||cls.year_id!==year.id)notFound();}
  const family=schoolStudentCapability(access.grants,'guardian.read'),links=schoolStudentCapability(access.grants,'parent_access.manage')||schoolStudentCapability(access.grants,'parent_access.issue');
  const predicate=await filters(tx,c,family),r=idsOnly?{...directory,fields:{id:'id',fullName:'full_name',studentCode:'student_code',className:'class_name'}}:directory;
  const result=await listResource(tx,r,schoolId,{...c.query,sort:c.query.sort??'fullName'},predicate,c.principal!.userId,[year?.id??null,referenceDate,family,links]);
  if(idsOnly)result.data=result.data.map(row=>({id:row.id}));return result;
}
export async function studentDirectorySummary(tx:Transaction,c:RequestContext,access:{today:string;grants:Grant[]}){
  const {grants,today}=access,schoolId=c.params.schoolId!;
  if(!schoolStudentCapability(grants,'student.read'))throw new Problem(403,'FORBIDDEN');
  const {year,referenceDate}=await studentYear(tx,schoolId,today,c.query.yearId);
  const years=(await tx.query<Row>('SELECT id,version,name,status,starts_on,ends_on FROM app.academic_years WHERE school_id=$1 ORDER BY starts_on DESC,id LIMIT 1001',[schoolId])).rows;
  const classes=(await tx.query<Row>('SELECT id,version,year_id,name,status FROM app.classes WHERE school_id=$1 AND year_id=$2 ORDER BY name COLLATE app.vi_names,id LIMIT 1001',[schoolId,year?.id??null])).rows;
  if(years.length>1000||classes.length>1000)throw new Problem(422,'STUDENT_DIRECTORY_CHOICE_LIMIT');
  const family=schoolStudentCapability(grants,'guardian.read'),links=schoolStudentCapability(grants,'parent_access.manage')||schoolStudentCapability(grants,'parent_access.issue');
  const kpi=(await one<Row>(tx,`SELECT count(*)::int AS students,count(*) FILTER(WHERE t.status='ACTIVE')::int AS studying,
    CASE WHEN $4::boolean THEN count(*) FILTER(WHERE t.verified_guardians=0)::int END AS unverified,
    CASE WHEN $5::boolean THEN coalesce(sum(t.active_links),0)::int END AS active_links FROM ${directory.table} t`,[schoolId,year?.id??null,referenceDate,family,links]))!;
  return {year,referenceDate,today,years:years.map(row=>({id:row.id,version:row.version,name:row.name,status:row.status,startsOn:row.starts_on,endsOn:row.ends_on})),
    classes:classes.map(row=>({id:row.id,version:row.version,yearId:row.year_id,name:row.name,status:row.status})),
    kpi:{students:kpi.students,studying:kpi.studying,unverified:kpi.unverified,activeLinks:kpi.active_links},canSeeGuardians:family,canSeeLinks:links,
    canCreate:schoolStudentCapability(grants,'student.manage'),canTransfer:schoolStudentCapability(grants,'student.transfer'),canExport:schoolStudentCapability(grants,'report.export')};
}
