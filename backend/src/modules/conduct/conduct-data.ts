import { one,iso,type Transaction,type Row } from '../../database/database';
import { dto,type Resource } from '../../database/resources';
import { Problem,validation } from '../../common/problem';
import { score } from './scoring';
import { loadRules } from './rules.service';
import {positionBonus} from './position-bonus';
export const periodResource:Resource={table:'app.conduct_periods',fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',classId:'class_id',weekId:'week_id',ruleSetId:'rule_set_id',status:'status',dataVersion:'data_version',inputDeadline:'input_deadline'},writeFields:[],search:[],filters:{classId:'class_id',status:'status',weekId:'week_id'}};
export const recordResource:Resource={table:'app.conduct_records',fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',classId:'class_id',periodId:'period_id',enrollmentId:'enrollment_id',ruleId:'rule_id',deltaSnapshot:'delta_snapshot',ruleLabelSnapshot:'rule_label_snapshot',publicReason:'public_reason',internalNote:'internal_note',occurredAt:'occurred_at',status:'status',sourceKind:'source_kind',sourceKey:'source_key',sourceId:'source_id',subjectId:'subject_id',lessonId:'lesson_id',recordedBy:'recorded_by',exclusionReason:'exclusion_reason'},writeFields:[],search:['public_reason'],filters:{classId:'class_id',periodId:'period_id',enrollmentId:'enrollment_id',status:'status'}};
export function conductDto(row:Row,subjectOnly=false){const value=Object.fromEntries(Object.entries(dto(recordResource,row)).filter(([,value])=>value!==null));if(subjectOnly)delete value.internalNote;return value;}
export async function conductPeriod(tx:Transaction,schoolId:string,classId:string,id:string,lock=false){
  const row=await one<Row>(tx,`SELECT p.*,w.starts_on,w.ends_on,w.week_number FROM app.conduct_periods p JOIN app.school_weeks w ON w.school_id=p.school_id AND w.id=p.week_id
    WHERE p.school_id=$1 AND p.class_id=$2 AND p.id=$3${lock?' FOR UPDATE OF p':''}`,[schoolId,classId,id]);if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');return row;
}
export async function conductSummary(tx:Transaction,p:Row){
  const set=await one<Row>(tx,'SELECT * FROM app.rule_sets WHERE school_id=$1 AND id=$2',[p.school_id,p.rule_set_id]);if(!set)throw new Problem(409,'RULE_SET_UNAVAILABLE');
  const config=await loadRules(tx,String(p.school_id),String(p.rule_set_id));
  const enrollments=(await tx.query<Row>(`SELECT e.id,e.student_id,e.starts_on,s.full_name FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id
    WHERE e.school_id=$1 AND e.class_id=$2 AND e.status<>'CANCELLED' AND daterange(e.starts_on,e.ends_on,'[)')&&daterange($3,$4,'[)') ORDER BY e.starts_on,e.id`,[p.school_id,p.class_id,p.starts_on,p.ends_on])).rows;
  const records=(await tx.query<Row>('SELECT * FROM app.conduct_records WHERE school_id=$1 AND period_id=$2 ORDER BY occurred_at,id',[p.school_id,p.id])).rows;
  const bonuses=await positionBonus(tx,p);
  const students:Record<string,unknown>[]=[],groups=new Map<string,Row[]>();
  for(const e of enrollments){const list=groups.get(String(e.student_id))??[];list.push(e);groups.set(String(e.student_id),list);}
  for(const [studentId,list] of groups){const recs=records.filter(r=>list.some(e=>e.id===r.enrollment_id));
    students.push({studentId,enrollmentId:list[0]!.id,fullName:list[0]!.full_name,...score(set,[...recs.filter(r=>r.status==='APPROVED').map(r=>String(r.delta_snapshot)),...bonuses.filter(b=>list.some(e=>e.id===b.enrollment_id)).map(b=>String(b.points))],config.thresholds),unreviewedCount:recs.filter(r=>r.status==='DRAFT').length});}
  const summary={period:dto(periodResource,p),students,pendingCount:records.filter(r=>r.status==='DRAFT').length};return {summary,records,enrollments,bonuses};
}
export function periodWritable(p:Row){if(p.status!=='OPEN')throw new Problem(409,'PERIOD_LOCKED');
  if(p.input_deadline&&new Date(p.input_deadline as Date).getTime()<Date.now())throw new Problem(409,'INPUT_DEADLINE_PASSED');}
export function version(row:Row,expected:unknown){if(row.version!==expected)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row.version));}
export function reason(value:unknown,min=5){if(typeof value!=='string'||value.trim().length<min)validation('reason',`Lý do cần ít nhất ${min} ký tự`);return value.trim();}
export async function publicConductItems(tx:Transaction,p:Row,revision:number,adjusted=false){
  const data=await conductSummary(tx,p),at=(await one<{at:Date}>(tx,'SELECT now() AS at'))!.at;
  const display=await one<Row>(tx,`SELECT r.name,r.revision,r.minimum_points,r.maximum_points,c.name AS class_label,sc.timezone
    FROM app.rule_sets r JOIN app.classes c ON c.school_id=r.school_id AND c.id=$3 JOIN platform.schools sc ON sc.id=r.school_id
    WHERE r.school_id=$1 AND r.id=$2`,[p.school_id,p.rule_set_id,p.class_id]);
  if(!display)throw new Problem(409,'RULE_SET_UNAVAILABLE');
  const conductDisplay={weekNumber:p.week_number,startsOn:p.starts_on,endsOn:p.ends_on,classLabel:display.class_label,
    ruleSetName:display.name,ruleSetRevision:display.revision,minimumPoints:display.minimum_points,maximumPoints:display.maximum_points,timezone:display.timezone};
  return {snapshot:{conduct:data.summary,conductDisplay},items:data.summary.students.map(student=>{
    const ids=data.enrollments.filter(e=>e.student_id===student.studentId).map(e=>e.id);
    return {studentId:String(student.studentId),section:'conduct',schema:'ParentConduct',payload:{periodId:p.id,periodLabel:`Tuần ${p.week_number}`,revision,
      basePoints:student.basePoints,bonusPoints:student.bonusPoints,penaltyPoints:student.penaltyPoints,finalPoints:student.finalPoints,classification:student.classification,
      lines:[...data.records.filter(r=>ids.includes(r.enrollment_id)&&r.status==='APPROVED'&&r.share_with_parent_snapshot!==false).map(r=>({label:r.rule_label_snapshot,delta:r.delta_snapshot,occurredAt:iso(r.occurred_at as Date),reason:r.public_reason})),...data.bonuses.filter(b=>ids.includes(b.enrollment_id)).map(b=>({label:'Chức vụ: '+b.label,delta:b.points,occurredAt:iso(at),reason:'Điểm cộng chức vụ theo tuần'}))],publishedAt:iso(at),adjusted}};
  })};
}
