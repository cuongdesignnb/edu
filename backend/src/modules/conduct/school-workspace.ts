import crypto from 'node:crypto';
import {one,iso,type Row,type Transaction} from '../../database/database';
import {Permissions,grantAllows} from '../../common/permissions';
import {audit} from '../../common/commands';
import {Problem} from '../../common/problem';
import {context,selected,checks} from './conduct-workspace';
import type {ConductService} from './conduct.service';
import {publicationPolicy,conductCloseDeadline} from './school-policy';
import {ruleWorkspaceView} from './rule-workspace';
import type {RequestContext,Result} from '../../api.router';

export const schoolConductOperations=['getPublicationPolicyWorkspace','savePublicationPolicyWorkspace','getClassRuleWorkspace','getPublicationCenterWorkspace'];
const add=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const bounded=(rows:Row[])=>{if(rows.length>5000)throw new Problem(422,'WORKSPACE_LIMIT');return rows;};
export async function schoolConductAuthorize(tx:Transaction,p:Permissions,c:RequestContext){
 return p.require(tx,c.principal!,c.operation.permission,{schoolId:c.params.schoolId!,yearId:c.params.yearId,classId:c.params.classId,allowSubject:c.operation.id==='getClassRuleWorkspace'});
}
export async function schoolConductWorkspace(tx:Transaction,p:Permissions,c:RequestContext,service?:ConductService):Promise<Result>{
 const s=c.params.schoolId!,access=await schoolConductAuthorize(tx,p,c),school=(await one<Row>(tx,`SELECT * FROM platform.schools WHERE id=$1${c.operation.method==='GET'?'':' FOR UPDATE'}`,[s]))!;
 const can=(action:string)=>access.grants.some(g=>grantAllows(g,action,{schoolId:s},access.today));
 if(c.operation.id==='getPublicationPolicyWorkspace')return {data:{policy:publicationPolicy(s,school),canEdit:can('school.settings')}};
 if(c.operation.id==='savePublicationPolicyWorkspace'){
  if(c.body.version!==school.version)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(school.version));
  const settings={...school.settings as Row,conductLockBy:c.body.lockBy,conductPublishBy:c.body.publishBy,conductRequireLeaderApproval:c.body.requireLeaderApproval,conductWeekCloseDay:c.body.weekCloseDay,parentSectionsDefault:['overview',...c.body.defaultParentModules as string[]],homeroomMayPublish:c.body.publishBy==='homeroom',attendanceAutoPublish:c.body.attendanceAutoPublish};
  const updated=(await one<Row>(tx,'UPDATE platform.schools SET settings=$2 WHERE id=$1 RETURNING *',[s,settings]))!;
  await audit(tx,c,'publication-policy',s,{status:'UPDATED'});return {data:publicationPolicy(s,updated)};
 }
 if(c.operation.id==='getClassRuleWorkspace'){
  const cls=await one<Row>(tx,'SELECT c.id,c.version,c.status,y.status AS year_status,y.starts_on,y.ends_on FROM app.classes c JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id WHERE c.school_id=$1 AND c.id=$2 AND c.year_id=$3',[s,c.params.classId,c.params.yearId]);if(!cls)throw new Problem(404,'RESOURCE_NOT_FOUND');
  const day=access.today>=String(cls.ends_on)?add(String(cls.ends_on),-1):access.today<String(cls.starts_on)?String(cls.starts_on):access.today;
  const periods=bounded((await tx.query<Row>(`SELECT r.*,cp.starts_on AS applied_from,cp.ends_on AS applied_to FROM app.class_rule_periods cp JOIN app.rule_sets r ON r.school_id=cp.school_id AND r.id=cp.rule_set_id WHERE cp.school_id=$1 AND cp.class_id=$2 AND r.status='ISSUED' AND r.discarded_at IS NULL AND (cp.ends_on IS NULL OR cp.ends_on>$3) ORDER BY cp.starts_on,cp.id LIMIT 5001`,[s,cls.id,day])).rows);
  const ctx={schoolId:s,today:day,ids:null,classIds:[String(cls.id)],can:()=>false},hash=crypto.createHash('sha256').update(JSON.stringify(periods.map(r=>[r.id,r.version,r.applied_from,r.applied_to]))).digest('hex');
  const view=async(row:Row|undefined)=>row?{...await ruleWorkspaceView(tx,ctx,row,hash),effectiveFrom:row.applied_from,effectiveTo:row.applied_to?add(String(row.applied_to),-1):null}:null;
  const canApply=cls.status!=='ARCHIVED'&&cls.year_status!=='ARCHIVED'&&access.grants.some(g=>grantAllows(g,'rules.apply',{schoolId:s,classId:String(cls.id)},access.today));
  const availableSets=canApply?(await tx.query<{id:string;name:string}>("SELECT id,name FROM app.rule_sets WHERE school_id=$1 AND status='ISSUED' AND discarded_at IS NULL ORDER BY revision DESC LIMIT 201",[s])).rows:[];
  if(availableSets.length>200)throw new Problem(422,'WORKSPACE_LIMIT');
  const futureWeeks=canApply?(await tx.query<{id:string;startsOn:string;endsOn:string}>(`SELECT id,starts_on AS "startsOn",ends_on AS "endsOn" FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 AND starts_on>$3 ORDER BY starts_on LIMIT 111`,[s,c.params.yearId,access.today])).rows:[];
  return {data:{schoolId:s,yearId:c.params.yearId,classId:cls.id,canApply,classVersion:cls.version,availableSets,futureWeeks,current:await view(periods.find(r=>String(r.applied_from)<=day)),next:await view(periods.find(r=>String(r.applied_from)>day)),policy:publicationPolicy(s,school)}};
 }
 const year=await one<Row>(tx,"SELECT id FROM app.academic_years WHERE school_id=$1 AND status='ACTIVE' ORDER BY starts_on DESC LIMIT 1",[s]);
 if(!year)return {data:{weeks:[],week:null,rows:[],adjustments:[],announcements:[]}};
 const weeks=(await tx.query<Row>('SELECT * FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 AND starts_on<=$3 ORDER BY week_number DESC LIMIT 111',[s,year.id,access.today])).rows;
 if(weeks.length>110)throw new Problem(422,'WORKSPACE_LIMIT');
 const w=c.query.weekId?weeks.find(w=>w.id===c.query.weekId):weeks.find(w=>String(w.ends_on)>access.today)??weeks[0];if(c.query.weekId&&!w)throw new Problem(404,'RESOURCE_NOT_FOUND');
 const weekView=(r:Row)=>({id:r.id,index:r.week_number,startDate:r.starts_on,endDate:add(String(r.ends_on),-1),closeDeadline:conductCloseDeadline(s,school,r)});
 if(!w)return {data:{weeks:weeks.map(weekView),week:null,rows:[],adjustments:[],announcements:[]}};
 const classes=bounded((await tx.query<Row>(`SELECT c.id,c.year_id,c.name,hm.name AS homeroom,p.id AS period_id,p.status,p.input_deadline,pub.revision,pub.published_at,pub.status AS publication_status,
 (SELECT count(*)::int FROM app.conduct_records r WHERE r.school_id=c.school_id AND r.period_id=p.id AND r.status='DRAFT') AS pending,
 (SELECT count(*)::int FROM app.attendance_sessions a WHERE a.school_id=c.school_id AND a.class_id=c.id AND a.granularity='DAILY' AND a.session_date>=$3 AND a.session_date<$4) AS saved,
 (SELECT count(*)::int FROM app.attendance_sessions a WHERE a.school_id=c.school_id AND a.class_id=c.id AND a.granularity='DAILY' AND a.session_date>=$3 AND a.session_date<$4 AND EXISTS(SELECT 1 FROM app.publication_revisions pr WHERE pr.school_id=a.school_id AND pr.attendance_session_id=a.id AND pr.status='PUBLISHED')) AS published,
 (SELECT count(*)::int FROM app.adjustment_requests ar JOIN app.conduct_periods cp ON cp.school_id=ar.school_id AND cp.id=ar.period_id WHERE cp.school_id=c.school_id AND cp.class_id=c.id AND ar.status IN ('SUBMITTED','APPROVED')) AS adjustments,
 EXISTS(SELECT 1 FROM app.class_rule_periods rp WHERE rp.school_id=c.school_id AND rp.class_id=c.id AND rp.starts_on<=$3 AND (rp.ends_on IS NULL OR rp.ends_on>=$4)) AS has_rules
 FROM app.classes c LEFT JOIN app.conduct_periods p ON p.school_id=c.school_id AND p.class_id=c.id AND p.week_id=$5
 LEFT JOIN LATERAL(SELECT pr.* FROM app.publication_revisions pr WHERE pr.school_id=c.school_id AND pr.conduct_period_id=p.id AND pr.status IN ('READY','PUBLISHED') ORDER BY CASE WHEN pr.status='PUBLISHED' THEN 0 ELSE 1 END,pr.revision DESC LIMIT 1) pub ON true
 LEFT JOIN LATERAL(SELECT m.work_display_name AS name FROM app.teaching_assignments a JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id WHERE a.school_id=c.school_id AND a.class_id=c.id AND a.kind='HOMEROOM' AND a.revoked_at IS NULL AND a.starts_on<=$6 AND (a.ends_on IS NULL OR a.ends_on>$6) ORDER BY a.starts_on DESC LIMIT 1) hm ON true
 WHERE c.school_id=$1 AND c.year_id=$2 AND c.status='ACTIVE' ORDER BY c.name,c.id LIMIT 5001`,[s,year.id,w.starts_on,w.ends_on,w.id,access.today])).rows);
 const rows=classes.map(r=>({classId:r.id,yearId:r.year_id,className:r.name,homeroom:r.homeroom??null,status:r.status==='LOCKED'?(r.publication_status==='PUBLISHED'?'published':'locked'):'open',pending:r.pending,blocking:[...(r.pending?[`${r.pending} ghi nhận chưa rà soát`]:[]),...(!r.has_rules?['Chưa áp dụng nội quy cho tuần']:[])],warnings:[] as string[],overdue:r.status!=='LOCKED'&&weekView(w).closeDeadline<access.today,snapshotVersion:r.revision??null,publishedAt:r.published_at?iso(r.published_at as Date):null,attendanceSaved:r.saved,attendancePublished:r.published,adjustments:r.adjustments}));
 if(!service)throw new Problem(503,'DEPENDENCY_UNAVAILABLE');
 for(const row of rows){const x=await context(tx,p,{...c,params:{...c.params,yearId:String(row.yearId),classId:String(row.classId)}}),d=await selected(tx,x,w),review=await checks(tx,x,d,service);row.pending=review.pending;row.blocking=[...review.blocking,...(!d.set?['Chưa áp dụng nội quy cho tuần']:[])];row.warnings=review.warnings;}
 const adjustments=bounded((await tx.query<Row>(`SELECT ar.id,ar.status,ar.reason,cp.class_id,c.year_id,c.name AS class_name,m.work_display_name AS requester FROM app.adjustment_requests ar JOIN app.conduct_periods cp ON cp.school_id=ar.school_id AND cp.id=ar.period_id JOIN app.classes c ON c.school_id=cp.school_id AND c.id=cp.class_id LEFT JOIN app.memberships m ON m.school_id=ar.school_id AND m.user_id=ar.requested_by WHERE ar.school_id=$1 AND c.year_id=$2 AND ar.status IN ('SUBMITTED','APPROVED') ORDER BY ar.created_at,ar.id LIMIT 5001`,[s,year.id])).rows).map(r=>({id:r.id,yearId:r.year_id,classId:r.class_id,className:r.class_name,studentName:null,requestedByName:r.requester??null,reason:r.reason,status:r.status==='SUBMITTED'?'pending':'approved',beforeTotal:null,afterTotal:null}));
 const announcements=can('announcement.manage')?bounded((await tx.query<Row>(`SELECT a.*,c.name AS class_name FROM app.announcements a LEFT JOIN app.classes c ON c.school_id=a.school_id AND c.id=a.class_id WHERE a.school_id=$1 AND a.year_id=$2 AND a.status IN ('DRAFT','SCHEDULED') ORDER BY a.created_at,a.id LIMIT 5001`,[s,year.id])).rows).map(r=>({id:r.id,title:r.title,status:String(r.status).toLowerCase(),origin:r.class_id?'class':'school',className:r.class_name??null,classId:r.class_id??null,yearId:r.year_id,scheduledAt:r.scheduled_at?iso(r.scheduled_at as Date):null})):[];
 return {data:{weeks:weeks.map(weekView),week:weekView(w),rows,adjustments,announcements}};
}
