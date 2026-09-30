import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import {apiList} from '../../api/lists';
import {serverNowISO} from '../../api/session';
import type {ID,Membership} from '../../model/types';
import type {Ctx} from '../core';
import {RepoError} from '../errors';
import {commandReason,displayedVersion,formResult,requiredId,requiredValue,withStaffAccess} from './common';

/** Native lifecycle replies retain nullable metadata and exact grant time windows. */
export function staffMembership(row:ApiSchemas['Member'],schoolId:ID){
  const statuses={ACTIVE:'active',SUSPENDED:'suspended',ENDED:'revoked',INVITED:'invited'} as const;
  const grants=requiredValue(row.schoolRoleGrants,'schoolRoleGrants');
  return {id:requiredId(row.id),schoolId,userId:requiredId(row.userId),version:displayedVersion(row.version),
    staffCode:row.staffCode??null,department:row.department??null,status:statuses[row.status],
    joinedAt:requiredValue(row.joinedAt,'joinedAt'),endedAt:requiredValue(row.endedAt,'endedAt'),statusReason:requiredValue(row.statusReason,'statusReason'),
    roleTemplateIds:[...new Set(grants.map(g=>requiredId(g.roleId)))],schoolRoleGrants:grants,
    grants:requiredValue(row.grants,'grants'),workDisplayName:row.workDisplayName};
}
function staffInvitation(row:ApiSchemas['Invitation'],schoolId:ID){
  return {id:requiredId(row.id),schoolId,version:displayedVersion(row.version),email:row.email,
    fullName:requiredValue(row.workDisplayName,'workDisplayName'),proposedDuty:requiredValue(row.proposedDuty,'proposedDuty'),
    roleTemplateIds:requiredValue(row.roleIds,'roleIds'),createdAt:row.createdAt,expiresAt:row.expiresAt,
    status:row.status==='PENDING'&&Date.parse(row.expiresAt)<=Date.parse(serverNowISO())?'expired':row.status.toLowerCase(),
    inviterName:row.inviterName,deliveryState:row.deliveryState};
}
export const connectedStaffRepo=withStaffAccess({
  async setMemberRoles(_ctx:Ctx,schoolId:ID,membershipId:ID,roleTemplateIds:ID[],reason:string,version?:number,validUntil?:string|null){
    const row=await formResult(http('replaceMemberSchoolRoles',{params:{schoolId,memberId:membershipId},body:{
      expectedVersion:displayedVersion(version),roleIds:roleTemplateIds,reason:commandReason(reason),...(validUntil!==undefined?{validUntil}:{})}}),{roleIds:'roleTemplateIds',roleId:'roleTemplateIds'});
    return {id:requiredId(row.data.id),schoolId,version:displayedVersion(row.data.version),status:row.data.status,
      roleTemplateIds:[...new Set(requiredValue(row.data.schoolRoleGrants,'schoolRoleGrants').map(g=>requiredId(g.roleId)))],schoolRoleGrants:row.data.schoolRoleGrants};
  },
  async setMembershipStatus(_ctx:Ctx,schoolId:ID,membershipId:ID,status:Membership['status'],reason:string,version?:number){
    const options={params:{schoolId,memberId:membershipId},body:{expectedVersion:displayedVersion(version),reason:commandReason(reason)}};
    const op=status==='active'?'reactivateMember':status==='suspended'?'suspendMember':status==='revoked'?'endMember':null;
    if(!op)throw new RepoError('VALIDATION','Trạng thái thành viên không hợp lệ.');
    return staffMembership((await http(op,options)).data,schoolId);
  },
  async invite(_ctx:Ctx,schoolId:ID,input:{fullName:string;email:string;proposedDuty:string;roleTemplateIds:ID[];days:number;validUntil?:string|null}){
    const row=await formResult(http('inviteSchoolStaff',{params:{schoolId},body:{email:input.email.trim(),workDisplayName:input.fullName.trim(),
      proposedDuty:input.proposedDuty.trim(),roleIds:input.roleTemplateIds,expiresInDays:input.days,...(input.validUntil!==undefined?{validUntil:input.validUntil}:{})}}),
    {workDisplayName:'fullName',roleIds:'roleTemplateIds',roleId:'roleTemplateIds',expiresInDays:'days'});
    return staffInvitation(row.data,schoolId);
  },
  async invitations(_ctx:Ctx,schoolId:ID){
    return (await apiList('listInvitations',{params:{schoolId},query:{sort:'createdAt',dir:'desc'}},2000)).map(row=>staffInvitation(row,schoolId));
  },
  async revokeInvitation(_ctx:Ctx,schoolId:ID,inviteId:ID,version?:number,reason?:string){
    return staffInvitation((await http('revokeInvitation',{params:{schoolId,invitationId:inviteId},body:{expectedVersion:displayedVersion(version),reason:commandReason(reason)}})).data,schoolId);
  },
});
