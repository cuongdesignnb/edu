import {Database,one,type Row} from '../../database/database';
import {Permissions,grantAllows} from '../../common/permissions';
import {Problem,notFound} from '../../common/problem';
import type {RequestContext} from '../../api.router';

/** One pupil's saved morning sources. Subject-only lesson rights cannot become a daily class summary. */
export async function classStudentAttendance(db:Database,policy:Permissions,c:RequestContext){
 return db.transaction(async tx=>{
  if(Object.keys(c.query).length)throw new Problem(422,'INVALID_QUERY');
  const schoolId=c.params.schoolId!,yearId=c.params.yearId!,classId=c.params.classId!,studentId=c.params.studentId!;
  const access=await policy.require(tx,c.principal!,'class.read',{schoolId,yearId,classId,allowSubject:true});
  const cls=await one<Row>(tx,`SELECT cl.name,greatest(y.starts_on,least($4::date,y.ends_on-1))::text AS reference_date
   FROM app.classes cl JOIN app.academic_years y ON y.school_id=cl.school_id AND y.id=cl.year_id
   WHERE cl.school_id=$1 AND cl.id=$2 AND cl.year_id=$3`,[schoolId,classId,yearId,access.today]);if(!cls)notFound();
  const referenceDate=String(cls.reference_date);
  await policy.require(tx,c.principal!,'student.read',{schoolId,yearId,classId,date:referenceDate,allowSubject:true});
  await policy.require(tx,c.principal!,'attendance.read',{schoolId,yearId,classId,date:referenceDate});
  const enrolled=await one(tx,`SELECT id FROM app.enrollments WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND student_id=$4
   AND status<>'CANCELLED' AND starts_on<=$5::date LIMIT 1`,[schoolId,classId,yearId,studentId,referenceDate]);if(!enrolled)notFound();
  const bounds=['class.read','student.read','attendance.read'].flatMap(action=>access.grants.filter(g=>grantAllows(g,action,{schoolId,yearId,classId,allowSubject:action!=='attendance.read'},access.today)).map(g=>({action,starts_on:g.starts_on,ends_on:g.ends_on})));
  const rows=(await tx.query<Row>(`SELECT s.id,s.session_date,coalesce(r.status,'UNMARKED') AS status,r.public_note,
   EXISTS(SELECT 1 FROM app.publication_revisions p WHERE p.school_id=s.school_id AND p.year_id=s.year_id AND p.class_id=s.class_id
    AND p.attendance_session_id=s.id AND p.status='PUBLISHED' AND p.source_version=s.data_version) AS published
   FROM app.attendance_sessions s JOIN app.enrollments e ON e.school_id=s.school_id AND e.class_id=s.class_id AND e.year_id=s.year_id
    AND e.student_id=$4 AND e.status<>'CANCELLED' AND e.starts_on<=s.session_date AND (e.ends_on IS NULL OR e.ends_on>s.session_date)
   LEFT JOIN app.attendance_records r ON r.school_id=s.school_id AND r.session_id=s.id AND r.enrollment_id=e.id
   WHERE s.school_id=$1 AND s.class_id=$2 AND s.year_id=$3 AND s.session_date<=$5::date AND s.granularity='DAILY' AND s.slot_key IN ('morning','daily')
    AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['class.read','student.read','attendance.read']) required(action) WHERE NOT EXISTS(
      SELECT 1 FROM jsonb_to_recordset($6::jsonb) AS scope(action text,starts_on date,ends_on date) WHERE scope.action=required.action
      AND (scope.starts_on IS NULL OR scope.starts_on<=s.session_date) AND (scope.ends_on IS NULL OR scope.ends_on>s.session_date)))
   ORDER BY s.session_date DESC,s.id LIMIT 5001`,[schoolId,classId,yearId,studentId,referenceDate,JSON.stringify(bounds)])).rows;
  if(rows.length>5000)throw new Problem(422,'CLASS_ATTENDANCE_HISTORY_LIMIT');
  if(new Set(rows.map(r=>r.session_date)).size!==rows.length)throw new Problem(409,'ATTENDANCE_SOURCE_AMBIGUOUS');
  const tally={PRESENT:0,LATE:0,EXCUSED:0,UNEXCUSED:0,UNMARKED:0};
  for(const r of rows){if(!Object.hasOwn(tally,String(r.status)))throw new Problem(500,'ATTENDANCE_SOURCE_INVALID');const key=String(r.status) as keyof typeof tally;tally[key]++;}
  return {data:{schoolId,yearId,classId,studentId,today:access.today,referenceDate,className:String(cls.name),sessions:rows.length,published:rows.filter(r=>r.published).length,tally,
   notable:rows.filter(r=>r.status!=='PRESENT').slice(0,8).map(r=>({date:r.session_date,status:r.status,note:r.public_note??null,published:r.published}))}};
 },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});
}
