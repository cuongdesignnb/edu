import type {Transaction,Row} from '../../database/database';
import {grantAllows,type Grant} from '../../common/permissions';
import {Problem,validation} from '../../common/problem';
import type {RequestContext} from '../../api.router';

/** Write-purpose choices expose no roster, capacity, contacts or borrowed catalogs. */
export async function studentCreateOptions(tx:Transaction,c:RequestContext,access:{all:boolean;classIds:string[];grants:Grant[];today:string}){
  for(const key of Object.keys(c.query))if(key!=='yearId')validation(key,'Bộ chọn lớp thêm học sinh không nhận bộ lọc này');
  const schoolId=c.params.schoolId!,rows=(await tx.query<Row>(`SELECT cl.id,cl.version,cl.name,cl.status,cl.year_id,y.name AS year_name,
    y.starts_on::text AS year_starts_on,y.ends_on::text AS year_ends_on
    FROM app.classes cl JOIN app.academic_years y ON y.school_id=cl.school_id AND y.id=cl.year_id
    WHERE cl.school_id=$1 AND ($2::uuid[] IS NULL OR cl.id=ANY($2)) AND cl.status<>'ARCHIVED' AND y.status<>'ARCHIVED'
      AND ($3::uuid IS NULL OR y.id=$3)
    ORDER BY y.starts_on DESC,cl.name,cl.id LIMIT 1001`,[schoolId,access.all?null:access.classIds,c.query.yearId??null])).rows;
  if(rows.length>1000)throw new Problem(422,'STUDENT_CREATE_CHOICE_LIMIT');
  return {today:access.today,classes:rows.map(row=>({id:String(row.id),version:Number(row.version),name:String(row.name),status:String(row.status),
    yearId:String(row.year_id),yearName:String(row.year_name),yearStartsOn:String(row.year_starts_on),yearEndsOn:String(row.year_ends_on),
    canAddGuardian:access.grants.some(g=>grantAllows(g,'guardian.manage',{schoolId,classId:String(row.id)},access.today))}))};
}
