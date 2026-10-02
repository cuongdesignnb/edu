import {Permissions,grantAllows} from '../../common/permissions';
import {type Row,type Transaction} from '../../database/database';
import {Problem} from '../../common/problem';
import type {RequestContext} from '../../api.router';

export async function transferSources(tx:Transaction,p:Permissions,c:RequestContext){
 const schoolId=c.params.schoolId!,access=await p.collection(tx,c.principal!,'student.transfer.request',schoolId);
 if(Object.keys(c.query).some(k=>k!=='studentId'))throw new Problem(422,'INVALID_QUERY');
 const rows=(await tx.query<Row>(`SELECT s.id,s.full_name,s.student_code,e.id AS enrollment_id,e.version,e.class_id,e.year_id,cl.name AS class_name,e.starts_on,e.ends_on,
  EXISTS(SELECT 1 FROM app.transfer_requests tr WHERE tr.school_id=e.school_id AND tr.student_id=e.student_id AND tr.status='SUBMITTED') AS pending_transfer
  FROM app.enrollments e JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id JOIN app.classes cl ON cl.school_id=e.school_id AND cl.id=e.class_id
  JOIN app.academic_years y ON y.school_id=e.school_id AND y.id=e.year_id
  WHERE e.school_id=$1 AND ($2::uuid IS NULL OR s.id=$2) AND s.status='ACTIVE' AND e.status<>'CANCELLED' AND y.status='ACTIVE' AND cl.status='ACTIVE'
  AND e.starts_on<=$3 AND (e.ends_on IS NULL OR e.ends_on>$3) AND ($4::boolean OR e.class_id=ANY($5::uuid[]))
  ORDER BY s.full_name COLLATE app.vi_names,e.id LIMIT 5001`,[schoolId,c.query.studentId??null,access.today,access.all,access.classIds])).rows;
 if(rows.length>5000)throw new Problem(422,'WORKSPACE_LIMIT');
 return {schoolId,today:access.today,canDecide:access.grants.some(g=>grantAllows(g,'student.transfer',{schoolId},access.today)),students:rows.map(s=>({id:s.id,fullName:s.full_name,code:s.student_code,classId:s.class_id,className:s.class_name,yearId:s.year_id,enrollmentId:s.enrollment_id,enrollmentVersion:s.version,startsOn:s.starts_on,endsOn:s.ends_on??null,pendingTransfer:s.pending_transfer}))};
}
