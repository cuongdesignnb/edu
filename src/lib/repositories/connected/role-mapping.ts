import type {ApiSchemas} from '../../api/generated';
import type {ID} from '../../model/types';
import {nativeActionLabel} from '../../api/action-labels';
import {RepoError} from '../errors';
import {requiredId,requiredValue,displayedVersion} from './common';

export function staffRole(row:ApiSchemas['Role'],schoolId:ID){
  const scopes=requiredValue(row.scopes,'scopes');
  return {...row,id:requiredId(row.id),schoolId,name:row.label,key:row.code,description:null,
    version:displayedVersion(row.version),status:requiredValue(row.status,'status'),scopes,
    memberCount:requiredValue(row.memberCount,'memberCount'),assignmentCount:requiredValue(row.assignmentCount,'assignmentCount'),
    level:scopes.length===1&&scopes[0]==='SCHOOL'?'school' as const:scopes.length&&scopes.every(s=>s!=='SCHOOL')?'class' as const:'mixed' as const,
    actions:row.permissions.map(p=>p.action),permissions:row.permissions.map(p=>({...p,scopes:[...p.scopes]}))};
}
export function rolePermissions(value:ApiSchemas['Role']['permissions']){
  if(!Array.isArray(value)||value.some(p=>!p||typeof p.action!=='string'||!p.action||!Array.isArray(p.scopes)||!p.scopes.length||new Set(p.scopes).size!==p.scopes.length||p.scopes.some(s=>!['SCHOOL','CLASS','SUBJECT'].includes(s)))||new Set(value.map(p=>p.action)).size!==value.length)
    throw new RepoError('VALIDATION','Giữ rõ mã hành động và phạm vi của từng quyền.',{fieldErrors:{permissions:'Chọn hành động và phạm vi không trùng.'}});
  return value.map(p=>({action:p.action,scopes:[...p.scopes]}));
}
export function staffRoleDetails(row:ApiSchemas['RoleDetails'],schoolId:ID){
  return {role:staffRole(row.role,schoolId),canEdit:row.canEdit,ownRole:row.ownRole,systemRole:row.systemRole,canViewMembers:row.canViewMembers,canViewHistory:row.canViewHistory,
    all:row.actions.map(a=>({...a,key:a.action,...nativeActionLabel(a.action)})),myActions:row.actions.filter(a=>a.canGrant).map(a=>a.action),
    members:requiredValue(row.members,'members'),history:requiredValue(row.history,'history')?.map(e=>({id:requiredId(e.id),at:e.createdAt,action:e.action==='updateRole'?'Sửa mẫu quyền':e.action==='createRole'?'Tạo mẫu quyền':e.action,operationId:e.action,actorName:e.actorLabel,reason:e.reason,changes:e.changes}))??null};
}
