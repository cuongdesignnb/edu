import type {SupportScope} from '../../model/types';
import type {ApiSchemas} from '../../api/generated';
import {RepoError} from '../errors';
import {requiredId,requiredValue} from './common';

export const supportScopeActions:Record<SupportScope,readonly string[]>={school_config:['school.read','year.read','dictionary.read','role.read','school.settings'],class_structure:['class.read','assignment.read'],staff_directory:['member.read'],import_logs:['import.read']};
export function supportActions(scopes:SupportScope[]){
  if(!scopes.length||scopes.some(scope=>!Object.hasOwn(supportScopeActions,scope)))throw new RepoError('VALIDATION',undefined,{fieldErrors:{scopes:'Chọn phạm vi hỗ trợ hợp lệ.'}});
  return [...new Set(scopes.flatMap(scope=>supportScopeActions[scope]))];
}
export function supportGrant(row:ApiSchemas['SupportAccess']){
  const known=new Set(Object.values(supportScopeActions).flat());if(row.allowedActions.some(action=>!known.has(action)))throw new RepoError('READ_ERROR','Phạm vi hỗ trợ API không đúng hợp đồng.');
  return {id:requiredId(row.id),schoolId:requiredId(row.schoolId),ticketId:requiredId(row.ticketId),operatorId:requiredId(row.operatorId),classId:row.classId??undefined,version:row.version,scopes:(Object.keys(supportScopeActions) as SupportScope[]).filter(scope=>supportScopeActions[scope].some(action=>row.allowedActions.includes(action))),allowedActions:row.allowedActions,reason:row.reason,requestedBy:row.requestedById,requestedByName:row.requesterName??undefined,approvedBy:row.approvedById,approvedByName:row.approverName??undefined,operatorName:requiredValue(row.operatorName,'operatorName'),schoolName:requiredValue(row.schoolName,'schoolName'),validFrom:row.validFrom,validTo:row.validUntil,status:requiredValue(row.viewStatus,'viewStatus'),canonicalStatus:row.status,effective:requiredValue(row.effective,'effective'),revokedAt:row.revokedAt??undefined};
}
export function supportTicket(row:ApiSchemas['SupportTicket']){
  return {id:requiredId(row.id),schoolId:requiredId(row.schoolId),title:row.subject,body:row.description,status:row.status.toLowerCase() as 'open'|'in_progress'|'waiting_school'|'resolved'|'closed',priority:row.priority.toLowerCase() as 'low'|'normal'|'high',createdBy:requiredValue(row.requesterId,'requesterId'),createdByName:requiredValue(row.requesterName,'requesterName'),createdAt:row.createdAt,updatedAt:row.updatedAt,version:row.version,assigneeUserId:row.assigneeId??undefined,assigneeName:row.assigneeName??undefined,schoolName:requiredValue(row.schoolName,'schoolName'),schoolStatus:requiredValue(row.schoolStatus,'schoolStatus').toLowerCase() as 'draft'|'active'|'suspended'|'archived',messageCount:requiredValue(row.messageCount,'messageCount')};
}
export function supportMessage(row:ApiSchemas['SupportMessage']){
  return {id:requiredId(row.id),at:row.createdAt,by:row.authorId??undefined,byName:row.authorLabel,text:row.body,side:requiredValue(row.side,'side').toLowerCase() as 'school'|'platform'|'unknown'};
}
const actions:Record<string,string>={createTicket:'Tạo yêu cầu hỗ trợ',postSchoolMessage:'Gửi cập nhật hỗ trợ',approveSupportAccess:'Cho phép hỗ trợ tạm thời',revokeSupportAccess:'Từ chối hoặc thu hồi hỗ trợ',createSchool:'Tạo trường',updatePlatformSchool:'Cập nhật thông tin vận hành trường',setSchoolStatus:'Cập nhật trạng thái trường',inviteSchoolAdmin:'Mời quản trị trường',revokeSchoolAdmin:'Thu hồi quyền quản trị trường',revokePlatformAdminInvitation:'Thu hồi lời mời quản trị',updatePlatformSettings:'Cập nhật cấu hình nền tảng',updatePlatformTicket:'Cập nhật yêu cầu hỗ trợ',postPlatformTicketMessage:'Gửi cập nhật hỗ trợ',requestPlatformSupportAccess:'Đề nghị quyền hỗ trợ',relinquishPlatformSupportAccess:'Trả lại quyền hỗ trợ'};
export function platformAudit(row:ApiSchemas['AuditEvent']){
  const before=row.changes.filter(change=>change.before!==null),after=row.changes;
  return {id:requiredId(row.id),level:'platform' as const,actorId:row.actorId??undefined,actorName:row.actorLabel,action:actions[row.action]??row.action,operationId:row.action,entityType:row.targetType,entityId:row.targetId??undefined,entityLabel:row.targetId?`${row.targetType} · ${row.targetId}`:row.targetType,at:row.createdAt,reason:row.reason,before:before.length?Object.fromEntries(before.map(change=>[change.field,change.before])):undefined,after:after.length?Object.fromEntries(after.map(change=>[change.field,change.after])):undefined};
}
