import type { Transaction } from '../../database/database';
export type ImportContext=Record<string,Record<string,number>>;
const tables:Record<string,string[]>={
  STUDENTS:['academic_years','classes','students','enrollments'],
  CLASSES:['academic_years','classes','grade_levels','enrollments'],
  STAFF:['academic_years','classes','subjects','memberships','staff_invitations','roles','role_grants','teaching_assignments'],
  TIMETABLE:['academic_years','classes','subjects','rooms','memberships','teaching_assignments','timetable_versions','timetable_entries'],
};
export async function readImportContext(tx:Transaction,schoolId:string,kind:string):Promise<ImportContext>{
  const result:ImportContext={};for(const table of tables[kind]!){
    const rows=(await tx.query<{id:string;version:number}>(`SELECT id,version FROM app.${table} WHERE school_id=$1 ORDER BY id`,[schoolId])).rows;
    result[table]=Object.fromEntries(rows.map(row=>[row.id,row.version]));
  }return result;
}
