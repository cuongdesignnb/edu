import {one,type Transaction,type Row} from '../../database/database';
import {dto} from '../../database/resources';
import {organizationRead} from '../academics/organization-read';
import {taskResource} from './dashboard-data';
import type {ViewContext} from './dashboards.service';

interface Stats {total:number;active:number;draft:number;live:number;noHomeroom:number;noStudents:number;noTimetable:number}
/** Full-scope SQL totals; only six class DTOs leave PostgreSQL for the overview table. */
export async function schoolClassOverview(tx:Transaction,ctx:ViewContext){
  const projection=organizationRead('class',ctx.schoolId,ctx.grants,ctx.today,true),parameters=[ctx.schoolId,...projection.bindings,ctx.year?.id??null];
  const data=`SELECT t.* FROM ${projection.resource.table} t WHERE t.school_id=$1 AND t.year_id=$4`;
  const stats=(await one<Stats>(tx,`WITH data AS (${data}) SELECT count(*)::int AS total,
    count(*) FILTER(WHERE status='ACTIVE')::int AS active,count(*) FILTER(WHERE status='DRAFT')::int AS draft,
    count(*) FILTER(WHERE status<>'ARCHIVED')::int AS live,
    count(*) FILTER(WHERE status<>'ARCHIVED' AND homeroom_name IS NULL)::int AS "noHomeroom",
    count(*) FILTER(WHERE status='ACTIVE' AND student_count=0)::int AS "noStudents",
    count(*) FILTER(WHERE status='ACTIVE' AND NOT has_timetable)::int AS "noTimetable" FROM data`,parameters))!;
  // Bind the existing permission-aware task projection after the class parameters.
  // $1 remains the tenant; $2..$8 become $5..$11. All values stay parameterized.
  const tasks=taskResource.table.replace(/\$(\d+)\b/g,(_match,n:string)=>'$'+(n==='1'?'1':Number(n)+3));
  const structural="c.status='DRAFT' OR c.homeroom_name IS NULL OR c.student_count=0 OR NOT c.has_timetable OR c.inactive_assignment_count>0";
  const rows=(await tx.query<Row>(`WITH data AS (${data}),tasks AS MATERIALIZED(SELECT t.id,t.class_id,t.title FROM ${tasks} t WHERE t.school_id=$1),
    needs AS (SELECT c.*,(${structural}) IS TRUE AS blocked FROM data c WHERE c.status<>'ARCHIVED'
      AND ((${structural}) IS TRUE OR EXISTS(SELECT 1 FROM tasks t WHERE t.class_id=c.id)))
    SELECT n.*,count(*) OVER() AS needs_total,coalesce((SELECT array_agg(t.title ORDER BY t.id) FROM tasks t WHERE t.class_id=n.id),'{}'::text[]) AS pending_tasks
    FROM needs n ORDER BY blocked DESC,name,id LIMIT 6`,[...parameters,...ctx.bindings])).rows;
  const preview=rows.map(row=>{const value=dto(projection.resource,row),issues:string[]=[];
    if(value.status==='DRAFT')issues.push('Chờ kích hoạt lớp');if(!value.homeroomName)issues.push('Chưa có giáo viên chủ nhiệm');if(value.studentCount===0)issues.push('Chưa có học sinh');if(!value.hasTimetable)issues.push('Chưa có thời khóa biểu');if(value.inactiveAssignmentCount)issues.push(`${value.inactiveAssignmentCount} phân công của thành viên đang bị khóa`);
    return {...value,tasks:[...issues,...row.pending_tasks as string[]],severity:row.blocked?'blocked':'attention'};
  });
  return {stats,preview,total:rows.length?Number(rows[0]!.needs_total):0};
}
