import {one,type Transaction} from '../../database/database';
import {supportResource} from './support-data';

/** Exact school SQL totals; support.manage never borrows consent authority. */
export async function schoolSupportSummary(tx:Transaction,schoolId:string,canApprove:boolean){
  const queue=(await one(tx,`SELECT count(*)::int AS total,
    count(*) FILTER(WHERE status='OPEN')::int AS open,
    count(*) FILTER(WHERE status='IN_PROGRESS')::int AS "inProgress",
    count(*) FILTER(WHERE status='WAITING_SCHOOL')::int AS "waitingSchool",
    count(*) FILTER(WHERE status IN ('RESOLVED','CLOSED'))::int AS resolved,
    count(*) FILTER(WHERE priority='HIGH' AND status NOT IN ('RESOLVED','CLOSED'))::int AS high
    FROM platform.support_tickets WHERE school_id=$1`,[schoolId]))!;
  const grants=canApprove?(await one(tx,`SELECT count(*)::int AS total,
    ${['requested','active','expired','revoked','declined','inactive'].map(s=>`count(*) FILTER(WHERE t.view_status='${s}')::int AS "${s}"`).join(',')}
    FROM ${supportResource.table} t WHERE t.school_id=$1`,[schoolId]))!:null;
  return {queue,grants,canApprove};
}
