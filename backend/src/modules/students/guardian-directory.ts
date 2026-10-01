import {one,type Transaction,type Row} from '../../database/database';
import {listResource,type Resource,type Predicate} from '../../database/resources';
import {Problem} from '../../common/problem';
import type {Grant} from '../../common/permissions';
import type {RequestContext} from '../../api.router';
import {schoolStudentCapability} from './student-directory';

const directory:Resource={table:`(SELECT g.*,
 regexp_replace(btrim(g.full_name),'^.*[[:space:]]','') AS given_name,
 (SELECT count(*)::int FROM app.guardian_relationships gr WHERE gr.school_id=g.school_id AND gr.guardian_id=g.id AND gr.status='VERIFIED' AND gr.revoked_at IS NULL) AS verified,
 (SELECT count(*)::int FROM app.guardian_relationships gr WHERE gr.school_id=g.school_id AND gr.guardian_id=g.id AND gr.status='UNVERIFIED' AND gr.revoked_at IS NULL) AS unverified,
 (SELECT count(*)::int FROM app.guardian_relationships gr WHERE gr.school_id=g.school_id AND gr.guardian_id=g.id AND gr.status='REVOKED') AS revoked,
 CASE WHEN $3::boolean THEN (SELECT count(*)::int FROM app.parent_access_links l JOIN app.guardian_relationships gr
   ON gr.school_id=l.school_id AND gr.id=l.relationship_id WHERE gr.school_id=g.school_id AND gr.guardian_id=g.id
   AND gr.status='VERIFIED' AND gr.can_receive_info AND gr.revoked_at IS NULL AND l.revoked_at IS NULL AND l.expires_at>now()) END AS active_links,
 (SELECT count(*)::int FROM app.guardian_relationships gr WHERE gr.school_id=g.school_id AND gr.guardian_id=g.id) AS relationship_count,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'version',s.version,'name',s.full_name,'code',s.student_code,'status',s.status,
   'relationshipId',gr.id,'relationshipVersion',gr.version,'relation',gr.relationship_label,'verification',gr.status,
   'canReceiveInfo',gr.can_receive_info,'isPrimaryContact',gr.is_primary,'classId',e.class_id,'className',e.class_name,'yearId',e.year_id)
   ORDER BY s.full_name COLLATE app.vi_names,s.id) FROM app.guardian_relationships gr JOIN app.students s
   ON s.school_id=gr.school_id AND s.id=gr.student_id LEFT JOIN LATERAL (
     SELECT en.class_id,en.year_id,cl.name AS class_name FROM app.enrollments en JOIN app.classes cl ON cl.school_id=en.school_id AND cl.id=en.class_id
     WHERE en.school_id=gr.school_id AND en.student_id=gr.student_id AND en.status<>'CANCELLED'
       AND en.starts_on<=$2::date AND (en.ends_on IS NULL OR en.ends_on>$2::date) ORDER BY en.starts_on DESC,en.id DESC LIMIT 1
   ) e ON true WHERE gr.school_id=g.school_id AND gr.guardian_id=g.id),'[]'::jsonb) AS students
 FROM app.guardians g WHERE g.school_id=$1)`,fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',fullName:'full_name',phone:'phone',email:'email',status:'status',verified:'verified',unverified:'unverified',revoked:'revoked',activeLinks:'active_links',students:'students',relationshipCount:'relationship_count'},
 writeFields:[],search:[],filters:{status:'status'},sortKeys:{fullName:[{column:'given_name',collation:'app.vi_names'},{column:'full_name',collation:'app.vi_names'}]}};

export async function guardianDirectory(tx:Transaction,c:RequestContext,access:{today:string;grants:Grant[]}){
  if(!schoolStudentCapability(access.grants,'guardian.read'))throw new Problem(403,'FORBIDDEN');
  const parts:string[]=[],values:unknown[]=[];
  if(c.query.verification)parts.push(`t.${({VERIFIED:'verified',UNVERIFIED:'unverified',REVOKED:'revoked'} as Record<string,string>)[c.query.verification]}>0`);
  if(c.query.q){const q=(await one<{q:string}>(tx,'SELECT app.fold_vi(btrim($1)) AS q',[c.query.q]))!.q;
    values.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');parts.push(`(app.fold_vi(t.full_name) LIKE $${values.length} OR EXISTS(
      SELECT 1 FROM app.guardian_relationships gr JOIN app.students s ON s.school_id=gr.school_id AND s.id=gr.student_id
      WHERE gr.school_id=t.school_id AND gr.guardian_id=t.id AND (app.fold_vi(s.full_name) LIKE $${values.length} OR app.fold_vi(s.student_code) LIKE $${values.length})))`);}
  const predicate:Predicate={sql:parts.join(' AND '),values},links=schoolStudentCapability(access.grants,'parent_access.manage')||schoolStudentCapability(access.grants,'parent_access.issue');
  const result=await listResource(tx,directory,c.params.schoolId!,{...c.query,sort:c.query.sort??'fullName'},predicate,c.principal!.userId,[access.today,links]);
  if(result.data.some(row=>Number(row.relationshipCount)>1000))throw new Problem(422,'GUARDIAN_RELATIONSHIP_LIMIT');return result;
}

export async function guardianDirectorySummary(tx:Transaction,c:RequestContext,access:{grants:Grant[]}){
  const {grants}=access,schoolId=c.params.schoolId!;
  if(!schoolStudentCapability(grants,'guardian.read'))throw new Problem(403,'FORBIDDEN');
  const counts=(await one<Row>(tx,`SELECT (SELECT count(*)::int FROM app.guardians WHERE school_id=$1) AS guardians,
    count(*) FILTER(WHERE status='VERIFIED' AND revoked_at IS NULL)::int AS verified,
    count(*) FILTER(WHERE status='UNVERIFIED' AND revoked_at IS NULL)::int AS unverified,
    count(*) FILTER(WHERE status='REVOKED')::int AS revoked FROM app.guardian_relationships WHERE school_id=$1`,[schoolId]))!;
  const canSeeLinks=schoolStudentCapability(grants,'parent_access.manage')||schoolStudentCapability(grants,'parent_access.issue');
  const activeLinks=canSeeLinks?(await one<{total:number}>(tx,`SELECT count(*)::int AS total FROM app.parent_access_links l JOIN app.guardian_relationships gr
    ON gr.school_id=l.school_id AND gr.id=l.relationship_id WHERE l.school_id=$1 AND l.revoked_at IS NULL AND l.expires_at>now()
    AND gr.status='VERIFIED' AND gr.can_receive_info AND gr.revoked_at IS NULL`,[schoolId]))!.total:null;
  return {...counts,activeLinks,canSeeLinks,canManage:schoolStudentCapability(grants,'guardian.manage'),canVerify:schoolStudentCapability(grants,'guardian.verify')};
}
