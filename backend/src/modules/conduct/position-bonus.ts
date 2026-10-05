import {one,type Row,type Transaction} from '../../database/database';
/** Capture the effective holders at the week end once; later policy edits cannot rewrite a locked week. */
export async function capturePositionBonus(tx:Transaction,p:Row){
 await tx.query(`INSERT INTO app.position_bonus_snapshots(school_id,class_id,period_id,enrollment_id,position_id,assignment_id,label,points)
 SELECT a.school_id,a.class_id,$3,a.enrollment_id,pos.id,a.id,pos.name,pos.weekly_bonus
 FROM app.position_assignments a JOIN app.class_positions pos ON pos.school_id=a.school_id AND pos.id=a.position_id
 JOIN app.enrollments e ON e.school_id=a.school_id AND e.id=a.enrollment_id
 WHERE a.school_id=$1 AND a.class_id=$2 AND a.cancelled_at IS NULL AND a.starts_on<($4::date) AND a.ends_on>($4::date-1)
 AND e.status<>'CANCELLED' AND e.starts_on<$4::date AND (e.ends_on IS NULL OR e.ends_on>$4::date-1) AND pos.weekly_bonus>0
 ON CONFLICT(school_id,period_id,enrollment_id,position_id) DO NOTHING`,[p.school_id,p.class_id,p.id,p.ends_on]);
}
export async function positionBonus(tx:Transaction,p:Row){
 if(p.status==='LOCKED')return (await tx.query<Row>('SELECT enrollment_id,label,points FROM app.position_bonus_snapshots WHERE school_id=$1 AND period_id=$2 ORDER BY position_id',[p.school_id,p.id])).rows;
 return (await tx.query<Row>(`SELECT a.enrollment_id,pos.name AS label,pos.weekly_bonus AS points FROM app.position_assignments a JOIN app.class_positions pos ON pos.school_id=a.school_id AND pos.id=a.position_id JOIN app.enrollments e ON e.school_id=a.school_id AND e.id=a.enrollment_id WHERE a.school_id=$1 AND a.class_id=$2 AND a.cancelled_at IS NULL AND a.starts_on<$3::date AND a.ends_on>$3::date-1 AND e.status<>'CANCELLED' AND e.starts_on<$3::date AND (e.ends_on IS NULL OR e.ends_on>$3::date-1) AND pos.weekly_bonus>0 ORDER BY pos.id`,[p.school_id,p.class_id,p.ends_on])).rows;
}
