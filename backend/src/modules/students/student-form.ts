import {one,type Transaction} from '../../database/database';
import {validation} from '../../common/problem';

export function studentForm(body:Record<string,unknown>,today:string){
  const result={...body};
  if(typeof body.fullName==='string'){
    result.fullName=body.fullName.trim().replace(/\s+/g,' ');
    if(!result.fullName)validation('fullName','Nhập họ và tên học sinh');
  }
  if(typeof body.dateOfBirth==='string'&&(body.dateOfBirth<'1900-01-01'||body.dateOfBirth>today))validation('dateOfBirth','Ngày sinh ngoài phạm vi');
  if(typeof body.studentCode==='string'){
    result.studentCode=body.studentCode.trim();if(!result.studentCode)validation('studentCode','Mã học sinh không được để trống');
  }
  return result;
}

/** Commands/imports serialize the school before deriving this next actual code. */
export async function nextStudentCode(tx:Transaction,schoolId:string,today:string){
  const prefix='HS'+today.slice(2,4),row=(await one<{next:string}>(tx,`SELECT (coalesce(max(substring(student_code from length($2)+1)::bigint),0)+1)::text AS next
    FROM app.students WHERE school_id=$1 AND student_code~$3`,[schoolId,prefix,'^'+prefix+'[0-9]{1,12}$']))!;
  if(BigInt(row.next)>999999999999n)validation('studentCode','Hãy nhập mã học sinh riêng');
  return prefix+row.next.padStart(3,'0');
}
