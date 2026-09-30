import { permissions } from '../../common/contract';
import type { Transaction } from '../../database/database';
export interface NotificationInput {
  schoolId:string;memberId:string;kind:'task'|'announcement'|'system'|'permission';title:string;body?:string;
  targetType:string;targetId?:string;classId?:string;subjectId?:string;requiredAction:string;sourceKey:string;
}
export async function notify(tx:Transaction,n:NotificationInput){
  return notifyMany(tx,[n]);
}
export async function notifyMany(tx:Transaction,notifications:NotificationInput[]){
  for(const n of notifications)if(!permissions.includes(n.requiredAction))throw new Error('Unknown notification permission');
  for(let offset=0;offset<notifications.length;offset+=500){
    const values=notifications.slice(offset,offset+500).map(n=>({school_id:n.schoolId,member_id:n.memberId,kind:n.kind,title:n.title.slice(0,200),body:n.body??'',target_kind:n.targetType,target_id:n.targetId??null,class_id:n.classId??null,subject_id:n.subjectId??null,required_action:n.requiredAction,source_key:n.sourceKey}));
    await tx.query(`INSERT INTO app.notifications(school_id,member_id,kind,title,body,target_kind,target_id,class_id,subject_id,required_action,source_key)
      SELECT school_id,member_id,kind,title,body,target_kind,target_id,class_id,subject_id,required_action,source_key FROM jsonb_to_recordset($1::jsonb)
      AS n(school_id uuid,member_id uuid,kind text,title text,body text,target_kind text,target_id uuid,class_id uuid,subject_id uuid,required_action text,source_key text)
      ON CONFLICT(school_id,member_id,source_key) WHERE source_key IS NOT NULL DO NOTHING`,[JSON.stringify(values)]);
  }
}
