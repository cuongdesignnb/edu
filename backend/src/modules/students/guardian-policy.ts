import {one,type Transaction} from '../../database/database';
import {grantAllows,type Grant} from '../../common/permissions';
import {schoolStudentCapability} from './student-directory';

/** Editing a shared contact changes every linked pupil's contact record. */
export async function canEditGuardianContact(tx:Transaction,schoolId:string,guardianId:string,grants:Grant[],today:string){
  if(schoolStudentCapability(grants,'guardian.manage'))return true;
  const classes=[...new Set(grants.filter(g=>g.class_id&&grantAllows(g,'guardian.manage',{schoolId,classId:g.class_id},today)).map(g=>g.class_id!))];
  if(!classes.length)return false;
  return (await one<{allowed:boolean}>(tx,`SELECT EXISTS(SELECT 1 FROM app.guardian_relationships WHERE school_id=$1 AND guardian_id=$2)
    AND NOT EXISTS(SELECT 1 FROM app.guardian_relationships gr WHERE gr.school_id=$1 AND gr.guardian_id=$2 AND NOT EXISTS(
      SELECT 1 FROM app.enrollments e WHERE e.school_id=gr.school_id AND e.student_id=gr.student_id AND e.status<>'CANCELLED'
      AND e.starts_on<=$3::date AND (e.ends_on IS NULL OR e.ends_on>$3::date) AND e.class_id=ANY($4::uuid[]))) AS allowed`,[schoolId,guardianId,today,classes]))!.allowed;
}
