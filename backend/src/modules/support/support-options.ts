import {one,type Transaction} from '../../database/database';
import {Problem,notFound} from '../../common/problem';
import {operatorSql,supportResource} from './support-data';

/** Metadata only. Caller verifies current platform.support before this read-only SQL projection. */
export async function platformSupportOptions(tx:Transaction,schoolId?:string){
  if(schoolId&&!await one(tx,'SELECT id FROM platform.schools WHERE id=$1',[schoolId]))notFound();
  const operators=(await tx.query<{id:string;display_name:string}>(`${operatorSql} ORDER BY u.display_name,u.id LIMIT 101`)).rows;
  const schools=(await tx.query<{id:string;name:string;status:string}>("SELECT id,coalesce(short_name,name) AS name,status FROM platform.schools WHERE status<>'ARCHIVED' AND ($1::uuid IS NULL OR id=$1) ORDER BY name,id LIMIT 1001",[schoolId??null])).rows;
  const tickets=(await tx.query<{id:string;schoolId:string;title:string}>("SELECT t.id,t.school_id AS \"schoolId\",t.subject AS title FROM platform.support_tickets t JOIN platform.schools s ON s.id=t.school_id AND s.status<>'ARCHIVED' WHERE t.status NOT IN ('RESOLVED','CLOSED') AND ($1::uuid IS NULL OR t.school_id=$1) ORDER BY t.created_at,t.id LIMIT 2001",[schoolId??null])).rows;
  if(operators.length>100||schools.length>1000||tickets.length>2000)throw new Problem(422,'SUPPORT_CHOICE_LIMIT');
  const queue=await one(tx,`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='OPEN')::int AS open,count(*) FILTER(WHERE status='IN_PROGRESS')::int AS "inProgress",count(*) FILTER(WHERE status='WAITING_SCHOOL')::int AS "waitingSchool",count(*) FILTER(WHERE status IN ('RESOLVED','CLOSED'))::int AS resolved,count(*) FILTER(WHERE priority='HIGH' AND status NOT IN ('RESOLVED','CLOSED'))::int AS high FROM platform.support_tickets WHERE $1::uuid IS NULL OR school_id=$1`,[schoolId??null]);
  const grants=await one(tx,`SELECT count(*)::int AS total,${['requested','active','expired','revoked','declined','inactive'].map(status=>`count(*) FILTER(WHERE t.view_status='${status}')::int AS ${status}`).join(',')} FROM ${supportResource.table} t WHERE $1::uuid IS NULL OR t.school_id=$1`,[schoolId??null]);
  return {operators:operators.map(u=>({id:u.id,name:u.display_name})),schools,tickets,queue,grants};
}
