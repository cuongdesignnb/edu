import {type Transaction,type Row} from '../../database/database';
import {dto,getResource,resource} from '../../database/resources';
import {Problem} from '../../common/problem';
import {addDateDays} from '../academics/year-setup';

/** The workflow's own projection: one year/school, one repeatable read snapshot. */
export async function rolloverPreview(tx:Transaction,schoolId:string,sourceYearId:string){
  const source=await getResource(tx,resource('year'),schoolId,sourceYearId),referenceDate=addDateDays(String(source.ends_on),-1);
  const classes=(await tx.query<Row>(`SELECT c.id,c.name,g.grade_level FROM app.classes c
    JOIN app.grade_levels g ON g.school_id=c.school_id AND g.id=c.grade_level_id
    WHERE c.school_id=$1 AND c.year_id=$2 ORDER BY c.name,c.id LIMIT 201`,[schoolId,sourceYearId])).rows;
  const students=(await tx.query<Row>(`SELECT e.class_id,s.id,s.student_code,s.full_name,s.status FROM app.enrollments e
    JOIN app.students s ON s.school_id=e.school_id AND s.id=e.student_id
    JOIN app.classes c ON c.school_id=e.school_id AND c.id=e.class_id AND c.year_id=e.year_id
    WHERE e.school_id=$1 AND e.year_id=$2 AND e.status<>'CANCELLED' AND e.starts_on<$3 AND e.ends_on=$3
    ORDER BY c.name,c.id,s.full_name,s.id LIMIT 10001`,[schoolId,sourceYearId,source.ends_on])).rows;
  const targets=(await tx.query<Row>(`SELECT * FROM app.academic_years WHERE school_id=$1 AND id<>$2
    AND starts_on>=$3 AND status<>'ARCHIVED' ORDER BY starts_on,id LIMIT 101`,[schoolId,sourceYearId,source.ends_on])).rows;
  const targetClasses=(await tx.query<Row>(`SELECT c.id,c.name,c.grade_level_id,c.year_id,
    (SELECT count(*)::int FROM app.enrollments e WHERE e.school_id=c.school_id AND e.class_id=c.id AND e.year_id=c.year_id
      AND e.status<>'CANCELLED' AND e.starts_on<=y.starts_on AND (e.ends_on IS NULL OR e.ends_on>y.starts_on)) AS student_count
    FROM app.classes c JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id
    WHERE c.school_id=$1 AND y.id<>$2 AND y.starts_on>=$3 AND y.status<>'ARCHIVED' AND c.status<>'ARCHIVED'
    ORDER BY y.starts_on,y.id,c.name,c.id LIMIT 20001`,[schoolId,sourceYearId,source.ends_on])).rows;
  const grades=(await tx.query<Row>('SELECT * FROM app.grade_levels WHERE school_id=$1 ORDER BY grade_level NULLS LAST,code,id LIMIT 101',[schoolId])).rows;
  if(classes.length>200||students.length>10000||targets.length>100||grades.length>100||targetClasses.length>20000)throw new Problem(422,'PREVIEW_TOO_LARGE');
  const byClass=new Map<string,Record<string,unknown>[]>(),byYear=new Map<string,Record<string,unknown>[]>();
  for(const s of students){const id=String(s.class_id),rows=byClass.get(id)??[];rows.push({id:s.id,studentCode:s.student_code,fullName:s.full_name,status:s.status});byClass.set(id,rows);if(rows.length>2000)throw new Problem(422,'PREVIEW_TOO_LARGE');}
  for(const c of targetClasses){const id=String(c.year_id),rows=byYear.get(id)??[];rows.push({id:c.id,name:c.name,gradeLevelId:c.grade_level_id,studentCount:c.student_count});byYear.set(id,rows);if(rows.length>200)throw new Problem(422,'PREVIEW_TOO_LARGE');}
  return {source:dto(resource('year'),source),referenceDate,sourceClasses:classes.map(c=>({id:c.id,name:c.name,gradeLevel:c.grade_level,students:byClass.get(String(c.id))??[]})),targets:targets.map(y=>({year:dto(resource('year'),y),classes:byYear.get(String(y.id))??[]})),grades:grades.map(g=>dto(resource('grade'),g))};
}
