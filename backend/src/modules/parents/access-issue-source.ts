import type { Row,Transaction } from '../../database/database';
import { one } from '../../database/database';
import type { RequestContext } from '../../api.router';
import { Problem,validation } from '../../common/problem';
import type { Grant } from '../../common/permissions';
import { listResource,type Resource } from '../../database/resources';
import { schoolSettings } from '../settings/school-settings';

export interface IssueScope {all:boolean;classIds:string[];grants:Grant[];today:string}
export async function parentIssueContext(tx:Transaction,c:RequestContext,scope:IssueScope){
  const row=await one<Row>(tx,`SELECT s.id,s.version,s.name,s.slug,s.timezone,s.settings,y.id AS year_id,y.version AS year_version,y.name AS year_name,
    y.starts_on::text,y.ends_on::text,(y.ends_on-1)::text AS last_day,
    least((now() AT TIME ZONE s.timezone)::date+coalesce((s.settings->>'parentLinkTtlDays')::int,90),y.ends_on-1)::text AS suggested_day
    FROM platform.schools s LEFT JOIN LATERAL(SELECT * FROM app.academic_years WHERE school_id=s.id AND status='ACTIVE'
      AND ($2::uuid IS NULL OR id=$2) ORDER BY starts_on DESC,id LIMIT 1)y ON true WHERE s.id=$1`,[c.params.schoolId,c.query.yearId??c.body.yearId??null]);
  if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');
  if((c.query.yearId||c.body.yearId)&&!row.year_id)throw new Problem(422,'YEAR_NOT_ACTIVE');
  const settings=schoolSettings(row);
  return {schoolId:String(row.id),schoolVersion:Number(row.version),schoolName:String(row.name),schoolSlug:String(row.slug),timezone:String(row.timezone),today:scope.today,
    ttlDays:settings.parentLinkTtlDays,defaultSections:settings.parentSectionsDefault,
    year:row.year_id?{id:String(row.year_id),version:Number(row.year_version),name:String(row.year_name),startsOn:String(row.starts_on),endsOn:String(row.ends_on),lastDay:String(row.last_day),suggestedExpiryOn:String(row.suggested_day)}:null};
}

const enrollmentJoin=`JOIN LATERAL(SELECT e.id,e.version,e.class_id,e.starts_on,e.ends_on FROM app.enrollments e
  WHERE e.school_id=s.school_id AND e.student_id=s.id AND e.year_id=$2 AND e.status<>'CANCELLED'
    AND ($3::uuid[] IS NULL OR (e.class_id=ANY($3) AND e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date)))
  ORDER BY (e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date)) DESC,e.starts_on DESC,e.id LIMIT 1)e ON true
  JOIN app.classes cl ON cl.school_id=s.school_id AND cl.id=e.class_id`;
const choices:Resource={table:`(SELECT s.school_id,s.id,s.version,s.full_name,s.student_code,cl.id AS class_id,cl.name AS class_name
  FROM app.students s ${enrollmentJoin})`,fields:{id:'id',version:'version',fullName:'full_name',studentCode:'student_code',classId:'class_id',className:'class_name'},
  writeFields:[],search:[],filters:{},sortKeys:{fullName:[{column:'full_name',collation:'app.vi_names'},{column:'student_code'}]}};
export async function parentIssueStudents(tx:Transaction,c:RequestContext,scope:IssueScope){
  const context=await parentIssueContext(tx,c,scope);
  if(!context.year)return {data:[],page:{limit:Number(c.query.limit??25),total:0,hasMore:false,nextCursor:null}};
  const q=c.query.q?.trim(),predicate=q?{sql:'(app.fold_vi(t.full_name) LIKE app.fold_vi($1) OR app.fold_vi(t.student_code) LIKE app.fold_vi($1))',values:['%'+q.replace(/[\\%_]/g,'\\$&')+'%']}:{sql:'',values:[]};
  return listResource(tx,choices,c.params.schoolId!,{...c.query,sort:c.query.sort??'fullName'},predicate,c.principal!.userId,[context.year.id,scope.all?null:scope.classIds,scope.today]);
}

export async function parentIssueSource(tx:Transaction,c:RequestContext,scope:IssueScope){
  const context=await parentIssueContext(tx,c,scope);if(!context.year)throw new Problem(422,'YEAR_NOT_ACTIVE');
  const studentId=c.params.studentId??c.body.studentId;
  const row=await one<Row>(tx,`SELECT s.id,s.version,s.full_name,s.student_code,s.status,e.id AS enrollment_id,e.version AS enrollment_version,
    cl.id AS class_id,cl.version AS class_version,cl.name AS class_name,(e.starts_on<=$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date)) AS in_effect
    FROM app.students s ${enrollmentJoin} WHERE s.school_id=$1 AND s.id=$5`,[c.params.schoolId,context.year.id,scope.all?null:scope.classIds,scope.today,studentId]);
  if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');
  const relationships=(await tx.query<Row>(`SELECT r.id,r.version,r.guardian_id,g.version AS guardian_version,g.full_name,r.relationship_label,r.status,r.is_primary,r.can_receive_info,r.revoked_at,
    ARRAY(SELECT l.id FROM app.parent_access_links l WHERE l.school_id=r.school_id AND l.student_id=r.student_id AND l.relationship_id=r.id AND l.year_id=$3 AND l.revoked_at IS NULL AND l.expires_at>now() ORDER BY l.created_at,l.id) AS active_link_ids
    FROM app.guardian_relationships r JOIN app.guardians g ON g.school_id=r.school_id AND g.id=r.guardian_id
    WHERE r.school_id=$1 AND r.student_id=$2 ORDER BY r.is_primary DESC,g.full_name,r.id LIMIT 1001`,[c.params.schoolId,studentId,context.year.id])).rows;
  if(relationships.length>1000)throw new Problem(422,'PARENT_ISSUE_RELATIONSHIP_LIMIT');
  return {context,student:{id:String(row.id),version:Number(row.version),fullName:String(row.full_name),studentCode:String(row.student_code),status:String(row.status)},
    enrollment:{id:String(row.enrollment_id),version:Number(row.enrollment_version),inEffect:!!row.in_effect},class:{id:String(row.class_id),version:Number(row.class_version),name:String(row.class_name)},
    relationships:relationships.map(r=>({id:String(r.id),version:Number(r.version),guardianId:String(r.guardian_id),guardianVersion:Number(r.guardian_version),guardianName:String(r.full_name),relationshipLabel:String(r.relationship_label),
      status:String(r.status),isPrimary:!!r.is_primary,canReceiveInfo:!!r.can_receive_info,canIssue:r.status==='VERIFIED'&&!!r.can_receive_info&&!r.revoked_at,
      activeLinkIds:r.status==='VERIFIED'&&r.can_receive_info&&!r.revoked_at?r.active_link_ids as string[]:[]}))};
}

export async function reviewParentIssue(tx:Transaction,c:RequestContext,scope:IssueScope){
  const source=await parentIssueSource(tx,c,scope),review=c.body.reviewedSource as Record<string,unknown>,relationship=source.relationships.find(r=>r.id===c.body.relationshipId);
  if(!relationship)throw new Problem(404,'RESOURCE_NOT_FOUND');
  const actual={schoolVersion:source.context.schoolVersion,yearVersion:source.context.year!.version,studentVersion:source.student.version,
    enrollmentId:source.enrollment.id,enrollmentVersion:source.enrollment.version,classVersion:source.class.version,relationshipVersion:relationship.version,guardianVersion:relationship.guardianVersion};
  if(Object.entries(actual).some(([key,value])=>review[key]!==value))throw new Problem(409,'PARENT_ISSUE_SOURCE_CHANGED');
  if(!relationship.canIssue)validation('relationshipId','Quan hệ cần được xác minh và cho phép nhận thông tin');
  const expiresOn=String(c.body.expiresOn);
  if(expiresOn<source.context.today||expiresOn>source.context.year!.lastDay)validation('expiresOn','Ngày hết hạn phải thuộc thời gian còn lại của năm học');
  const expiry=await one<{at:Date}>(tx,'SELECT ($1::date+1)::timestamp AT TIME ZONE $2 AS at',[expiresOn,source.context.timezone]);
  return {source,expiresAt:expiry!.at.toISOString()};
}
