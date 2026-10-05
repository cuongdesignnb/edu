import {one,iso,type Row,type Transaction} from '../../database/database';
import {allowed,contextSql,type ReportContext} from './report-data';
import type {ReportRow} from './report-render';
import {Problem} from '../../common/problem';
/** Only immutable, currently published child projections. No live rule evaluation. */
export async function parentConductReport(tx:Transaction,ctx:ReportContext){
 if(ctx.input.periodId)return periodicConductReport(tx,ctx);
 const rows=(await tx.query<Row>(`WITH ${contextSql}
 SELECT c.id AS class_id,c.name AS class_name,i.student_id,s.full_name,p.id AS publication_id,i.payload,w.week_number,
 p.staff_snapshot->'conductDisplay' AS display
 FROM base c JOIN app.publication_revisions p ON p.school_id=c.school_id AND p.class_id=c.id AND p.kind='CONDUCT' AND p.status='PUBLISHED'
 JOIN app.conduct_periods cp ON cp.school_id=p.school_id AND cp.id=p.conduct_period_id
 JOIN app.school_weeks w ON w.school_id=cp.school_id AND w.id=cp.week_id
 JOIN app.parent_publication_items i ON i.school_id=p.school_id AND i.publication_id=p.id AND i.section='conduct'
 JOIN app.students s ON s.school_id=i.school_id AND s.id=i.student_id
 WHERE w.starts_on>=$6::date AND w.starts_on<$7::date AND ($8::uuid IS NULL OR i.student_id=$8::uuid)
 AND ($10::uuid IS NULL OR w.id=$10::uuid) AND ${allowed('w.starts_on','c.id')} AND ${allowed('(w.ends_on-1)','c.id')}
 ORDER BY s.full_name,i.student_id,w.week_number,p.id LIMIT 5001`,ctx.bindings)).rows;
 if(rows.length>5000)throw new Problem(422,'REPORT_ROW_LIMIT_EXCEEDED');
 const homeroom=await one<{name:string}>(tx,`SELECT m.work_display_name AS name FROM app.teaching_assignments a JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id
 WHERE a.school_id=$1 AND a.class_id=$2 AND a.kind='HOMEROOM' AND a.revoked_at IS NULL AND a.starts_on<$4::date AND (a.ends_on IS NULL OR a.ends_on>$3::date)
 ORDER BY a.starts_on DESC,a.id LIMIT 1`,[ctx.schoolId,ctx.cls!.id,ctx.input.from,ctx.input.to]);
 const grouped=new Map<string,ReportRow>();
 for(const r of rows){const id=String(r.student_id),p=r.payload as Row;let student=grouped.get(id);
  if(!student){student={studentId:id,classId:String(r.class_id),label:String(r.full_name),values:{className:r.class_name,homeroomName:homeroom?.name??'',reportHeader:(ctx.school.settings as Row)?.reportHeader??'',weeks:[],totalPoints:null,classification:null}};grouped.set(id,student);}
  (student.values.weeks as unknown[]).push({weekNumber:r.week_number,periodLabel:p.periodLabel,basePoints:p.basePoints,bonusPoints:p.bonusPoints,penaltyPoints:p.penaltyPoints,finalPoints:p.finalPoints,classification:p.classification,
   lines:Array.isArray(p.lines)?p.lines.map((l:Row)=>({label:l.label,delta:l.delta,reason:l.reason,occurredAt:l.occurredAt})):[],publicationId:r.publication_id});
  student.values.classification=p.classification??null;
 }
 for(const student of grouped.values()){const weeks=student.values.weeks as Row[];student.values.totalPoints=weeks.reduce((sum,w)=>sum+Number(w.finalPoints??0),0);}
 return {rows:[...grouped.values()],columns:[{key:'totalPoints',label:'Tổng điểm các tuần đã công bố'},{key:'classification',label:'Xếp loại tuần cuối đã công bố'}],pins:[...new Set(rows.map(r=>String(r.publication_id)))]};
}
async function periodicConductReport(tx:Transaction,ctx:ReportContext){
 const period=await one<Row>(tx,`SELECT pc.*,p.id AS publication_id,p.staff_snapshot FROM app.periodic_conduct pc JOIN app.publication_revisions p ON p.school_id=pc.school_id AND p.periodic_conduct_id=pc.id AND p.status='PUBLISHED' WHERE pc.school_id=$1 AND pc.class_id=$2 AND pc.id=$3 AND pc.status='PUBLISHED'`,[ctx.schoolId,ctx.cls!.id,ctx.input.periodId]);if(!period)throw new Problem(404,'RESOURCE_NOT_FOUND');
 const saved=(period.staff_snapshot as Row).periodic as Row,results=saved.results as Row[];
 const homeroom=await one<Row>(tx,`SELECT m.work_display_name AS name FROM app.teaching_assignments a JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id WHERE a.school_id=$1 AND a.class_id=$2 AND a.kind='HOMEROOM' AND a.revoked_at IS NULL AND a.starts_on<$4::date AND (a.ends_on IS NULL OR a.ends_on>$3::date) ORDER BY a.starts_on DESC,a.id LIMIT 1`,[ctx.schoolId,ctx.cls!.id,period.starts_on,period.ends_on]);
 const weekly=(await tx.query<Row>(`SELECT i.student_id,i.payload,p.id AS publication_id,p.staff_snapshot#>>'{conductDisplay,weekNumber}' AS week_number FROM app.parent_publication_items i JOIN app.publication_revisions p ON p.school_id=i.school_id AND p.id=i.publication_id WHERE i.school_id=$1 AND p.id=ANY($2::uuid[]) AND i.section='conduct' ORDER BY p.staff_snapshot#>>'{conductDisplay,startsOn}',p.id`,[ctx.schoolId,period.source_publication_ids])).rows;
 const rows:ReportRow[]=results.filter(r=>!ctx.input.studentId||r.studentId===ctx.input.studentId).map(r=>({studentId:String(r.studentId),classId:String(ctx.cls!.id),label:String(r.fullName),values:{studentCode:r.studentCode,className:ctx.cls!.name,homeroomName:homeroom?.name??'',reportHeader:(ctx.school.settings as Row)?.reportHeader??'',totalPoints:r.score,classification:r.finalClassification,suggestedClassification:r.suggestedClassification,overrideReason:r.overrideReason,finalizedAt:iso(period.finalized_at as Date),periodLabel:period.period_label,classificationLabel:'XẾP LOẠI '+String(period.period_label).toLocaleUpperCase('vi'),scoreLabel:'ĐIỂM '+String((period.policy_snapshot as Row).aggregation==='SUM'?'TỔNG':'TRUNG BÌNH')+' KỲ',weeks:weekly.filter(w=>w.student_id===r.studentId).map(w=>({...w.payload as Row,weekNumber:Number(w.week_number),publicationId:w.publication_id}))}}));
 const columns=[['studentCode','Mã học sinh'],['className','Lớp'],['totalPoints','Điểm kỳ'],['suggestedClassification','Gợi ý theo chính sách'],['classification','Xếp loại cuối'],['overrideReason','Lý do điều chỉnh'],['finalizedAt','Ngày chốt']].map(([key,label])=>({key:key!,label:label!}));
 return {rows,columns,pins:[String(period.publication_id),...period.source_publication_ids as string[]]};
}
