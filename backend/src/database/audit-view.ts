import type {Resource} from './resources';

export const auditResource:Resource={table:`(SELECT e.*,coalesce((SELECT m.work_display_name FROM app.memberships m WHERE m.school_id=e.school_id AND m.user_id=e.actor_user_id),(SELECT u.display_name FROM identity.users u WHERE u.id=e.actor_user_id),e.actor_kind) AS actor_label FROM app.audit_events e)`,fields:{id:'id',actorId:'actor_user_id',actorLabel:'actor_label',action:'action',targetType:'target_type',targetId:'target_id',createdAt:'created_at',reason:'reason',before:'redacted_before',after:'redacted_after'},writeFields:[],search:['action','target_type','actor_label','reason'],filters:{targetId:'target_id',targetType:'target_type',actorId:'actor_user_id',action:'action'}};
const safeAuditFields=new Set(['status','sourceVersion','publicationId','baselinePublicationId','studentCount','expectedCount','allowDownload','sections','shareWithGuardian','discarded','rootId','count','total','applied','rejected','removed','groupId','enrollmentId','classId','yearId','ruleSetId','revision','effectiveOn','fromAssignmentId','toAssignmentId']);
const display=(value:unknown)=>value===undefined||value===null?null:typeof value==='string'||typeof value==='number'||typeof value==='boolean'?String(value):Array.isArray(value)&&value.every(v=>typeof v==='string')?value.join(', '):null;
/** The same whitelist applies to school-wide and member-specific audit views. */
export function auditView(row:Record<string,unknown>){
  const before=row.before as Record<string,unknown>,after=row.after as Record<string,unknown>,changes=[];
  for(const field of new Set([...Object.keys(before),...Object.keys(after)])){
    if(!safeAuditFields.has(field)||before[field]===after[field])continue;
    const old=display(before[field]),next=display(after[field]);if(old===null&&next===null)continue;
    changes.push({field,before:old,after:next});
  }
  const view={...row};delete view.before;delete view.after;if(view.reason===null)delete view.reason;return {...view,changes};
}
