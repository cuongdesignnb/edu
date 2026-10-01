import type {ApiSchemas} from '../../api/generated';
import {http,captureStaffAccess} from '../../api/client';
import {apiList,apiPage} from '../../api/lists';
import {serverNowISO} from '../../api/session';
import {inclusiveDate} from '../../api/dates';
import {year} from './organization-mapping';
import type {ID,Membership} from '../../model/types';
import type {Ctx,ListQuery} from '../core';
import {RepoError} from '../errors';
import {commandReason,displayedVersion,formResult,requiredId,requiredValue,withStaffAccess} from './common';
import {assignment,assignmentBody,type StaffAssignmentInput} from './assignment-mapping';
import {staffRole,staffRoleDetails,rolePermissions} from './role-mapping';
import {readHandoverPreview,readHandoverReceipt,applyHandover,type HandoverInput,type HandoverPreviewInput} from './handover';

const confirmed=(row:{id:string|null;version:number},id:string,version:number)=>row.id===id&&Number.isSafeInteger(row.version)&&row.version>version;
const permissionsKey=(rows:ApiSchemas['Role']['permissions'])=>JSON.stringify(rows.map(p=>({action:p.action,scopes:[...p.scopes].sort()})).sort((a,b)=>a.action.localeCompare(b.action)));
export const staffOperationLabel=(op:string)=>({inviteSchoolStaff:'Mời nhân sự',replaceMemberSchoolRoles:'Đổi mẫu quyền',suspendMember:'Tạm khóa thành viên',reactivateMember:'Mở khóa thành viên',endMember:'Thu hồi thành viên',createAssignment:'Giao phân công',revokeAssignment:'Thu hồi phân công',approveHandover:'Bàn giao chủ nhiệm',updateRole:'Sửa mẫu quyền',revokeInvitation:'Thu hồi lời mời'}[op]??op);

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
function directoryRow(row:ApiSchemas['StaffDirectoryRow']){
  const status=requiredValue(row.status,'status'),statuses={ACTIVE:'active',SUSPENDED:'suspended',ENDED:'revoked',INVITED:'invited_member'} as const;
  const base={id:requiredId(row.id),version:displayedVersion(row.version),
    fullName:requiredValue(row.fullName,'fullName'),displayName:row.fullName,email:requiredValue(row.email,'email'),department:requiredValue(row.department,'department'),staffCode:requiredValue(row.staffCode,'staffCode'),
    roleLabels:requiredValue(row.roleLabels,'roleLabels'),dutyLabels:requiredValue(row.dutyLabels,'dutyLabels'),accessActive:requiredValue(row.accessActive,'accessActive'),
    expiresAt:requiredValue(row.expiresAt,'expiresAt'),avatarTone:row.kind==='INVITATION'?'amber':'blue'};
  if(row.kind==='INVITATION')return {...base,kind:'invitation' as const,membershipId:null,userId:null,status:null,invitationStatus:'pending' as const};
  if(status===null)throw new RepoError('READ_ERROR','Thiếu trạng thái thành viên.');
  return {...base,kind:'member' as const,membershipId:requiredId(row.memberId),userId:requiredId(row.userId),status:statuses[status],invitationStatus:undefined};
}
export const connectedStaffRepo=withStaffAccess({
  async invitationOptions(_ctx:Ctx,schoolId:ID){return (await http('getStaffInvitationOptions',{params:{schoolId}})).data;},
  async assignmentClasses(_ctx:Ctx,schoolId:ID,yearId:ID){
    if(!yearId)throw new RepoError('VALIDATION','Chọn năm học trước khi phân công.');
    return (await apiList('listClasss',{params:{schoolId},query:{yearId,purpose:'assignment-picker',sort:'name'}},200)).map(row=>({id:requiredId(row.id),name:row.name,status:row.status.toLowerCase()}));
  },
  async staffActivity(_ctx:Ctx,schoolId:ID,input:{limit:number;handover?:boolean}){
    const result=await http('listStaffActivity',{params:{schoolId},query:{limit:input.limit,sort:'createdAt',dir:'desc',...(input.handover?{action:'approveHandover'}:{})}});
    return {items:result.data.map(e=>({...e,id:requiredId(e.id),at:e.createdAt,action:staffOperationLabel(e.action),actorName:e.actorLabel,detail:e.changes.map(c=>`${c.field}: ${c.before??'—'} → ${c.after??'—'}`).join(' · ')})),total:result.page?.total??null,canViewAudit:true};
  },
  async handoverPreview(_ctx:Ctx,schoolId:ID,classId:ID,input:HandoverPreviewInput={}){return readHandoverPreview(schoolId,classId,input);},
  async handoverReceipt(_ctx:Ctx,schoolId:ID,clientRequestId:string){return readHandoverReceipt(schoolId,clientRequestId);},
  async handover(_ctx:Ctx,schoolId:ID,input:HandoverInput){return applyHandover(schoolId,input);},
  async roles(_ctx:Ctx,schoolId:ID){return (await apiList('listRoles',{params:{schoolId},query:{sort:'label',dir:'asc'}},1000)).map(r=>staffRole(r,schoolId));},
  async role(_ctx:Ctx,schoolId:ID,roleId:ID){return staffRoleDetails((await http('getRoleDetails',{params:{schoolId,roleId}})).data,schoolId);},
  async saveRole(_ctx:Ctx,schoolId:ID,roleId:ID,permissions:ApiSchemas['Role']['permissions'],version:number,reason:string){
    const selected=rolePermissions(permissions);
    const data=(await http('updateRole',{params:{schoolId,roleId},body:{expectedVersion:displayedVersion(version),reason:commandReason(reason),permissions:selected},validateData:row=>confirmed(row,roleId,version)&&Array.isArray(row.permissions)&&permissionsKey(row.permissions)===permissionsKey(selected)})).data;
    return staffRole(data,schoolId);
  },
  async assignmentMatrix(_ctx:Ctx,schoolId:ID,yearId?:ID){
    const view=(await http('getStaffAssignmentMatrix',{params:{schoolId},query:{yearId}})).data;
    const statuses={ACTIVE:'active',SUSPENDED:'suspended',ENDED:'revoked',INVITED:'invited'} as const;
    const cell=(row:ApiSchemas['StaffAssignmentCell']|null)=>row===null?null:{...row,membershipId:requiredId(row.memberId),membershipStatus:row.memberStatus,memberStatus:statuses[row.memberStatus],
      validFrom:row.startsOn,validTo:row.endsOn===null?null:inclusiveDate(row.endsOn),version:displayedVersion(row.version)};
    return {year:view.year===null?null:year(requiredValue(view.year,'year'),schoolId),referenceDate:requiredValue(view.referenceDate,'referenceDate'),
      subjects:requiredValue(view.subjects,'subjects').map(s=>({id:requiredId(s.id),schoolId,name:s.name,code:s.code,color:requiredValue(s.color,'color'),version:s.version,status:s.status.toLowerCase()})),
      rows:requiredValue(view.rows,'rows').map(r=>({...r,status:r.status.toLowerCase(),homeroom:cell(requiredValue(r.homeroom,'homeroom')),
        bySubject:Object.fromEntries(Object.entries(requiredValue(r.bySubject,'bySubject')).map(([id,a])=>[id,cell(a)])),conflicts:requiredValue(r.conflicts,'conflicts')})),
      canAssign:requiredValue(view.canAssign,'canAssign'),canViewMembers:requiredValue(view.canViewMembers,'canViewMembers')};
  },
  async previewAssignment(_ctx:Ctx,schoolId:ID,input:StaffAssignmentInput){
    const view=(await formResult(http('previewStaffAssignment',{params:{schoolId},body:assignmentBody(input)}),{memberId:'membershipId',startsOn:'validFrom',endsOn:'validTo',expectedMemberVersion:'memberVersion',expectedClassVersion:'classVersion'})).data;
    return {...view,memberVersion:displayedVersion(view.memberVersion),classVersion:displayedVersion(view.classVersion),scope:requiredValue(view.scopeName,'scopeName'),
      added:requiredValue(view.added,'added'),kept:requiredValue(view.kept,'kept'),notIncluded:requiredValue(view.notIncluded,'notIncluded'),warnings:requiredValue(view.warnings,'warnings'),
      validFrom:requiredValue(view.startsOn,'startsOn'),validTo:inclusiveDate(requiredValue(view.endsOn,'endsOn'))};
  },
  async assign(_ctx:Ctx,schoolId:ID,input:StaffAssignmentInput){
    const body=assignmentBody(input,true);
    const result=await formResult(http('createAssignment',{params:{schoolId},body,validateData:row=>!!row.id&&Number.isSafeInteger(row.version)&&row.version>0&&row.memberId===body.memberId&&row.classId===body.classId&&row.kind===body.kind&&row.subjectId===(body.subjectId??null)&&row.startsOn===body.startsOn&&(!body.endsOn||row.endsOn===body.endsOn)&&row.revokedAt===null}),{memberId:'membershipId',startsOn:'validFrom',endsOn:'validTo',expectedMemberVersion:'memberVersion',expectedClassVersion:'classVersion'});
    return assignment(result.data,schoolId);
  },
  async revokeAssignment(_ctx:Ctx,schoolId:ID,assignmentId:ID,reason:string,version?:number){
    const expected=displayedVersion(version);
    return assignment((await http('revokeAssignment',{params:{schoolId,assignmentId},body:{expectedVersion:expected,reason:commandReason(reason)},validateData:row=>confirmed(row,assignmentId,expected)&&!!row.revokedAt})).data,schoolId);
  },
  async member(_ctx:Ctx,schoolId:ID,membershipId:ID){
    const access=captureStaffAccess(),view=(await http('getMemberDetails',{params:{schoolId,memberId:membershipId}})).data;access.assertCurrent();
    const row=requiredValue(view.member,'member'),membership=staffMembership(row,schoolId),canViewHistory=requiredValue(view.canViewHistory,'canViewHistory');
    const assignments=requiredValue(view.assignments,'assignments'),choices=requiredValue(view.roleChoices,'roleChoices');
    const history=canViewHistory?(await apiList('listMemberHistory',{params:{schoolId,memberId:membershipId},query:{sort:'createdAt',dir:'desc'}},2000)).map(event=>({
      id:requiredId(event.id),schoolId,actorId:requiredValue(event.actorId,'actorId'),actorName:requiredValue(event.actorLabel,'actorLabel'),
      action:requiredValue(event.action,'action'),actionLabel:staffOperationLabel(event.action),entityType:event.targetType,entityId:requiredId(event.targetId),at:event.createdAt,reason:event.reason??null,changes:requiredValue(event.changes,'changes')})):null;
    access.assertCurrent();return {membership,user:{id:membership.userId,fullName:row.workDisplayName,displayName:row.workDisplayName,
      email:requiredValue(row.workEmail,'workEmail'),workPhone:requiredValue(row.workPhone,'workPhone'),avatarTone:'blue'},
      roles:membership.schoolRoleGrants,assignments:assignments===null?null:assignments.map(a=>({...a,schoolId,membershipId:a.memberId,
        type:a.kind==='HOMEROOM'?'homeroom' as const:'subject' as const,validFrom:a.startsOn,validUntil:a.endsOn,validTo:a.endsOn===null?null:inclusiveDate(a.endsOn),
        status:a.revokedAt||a.grantRevokedAt?'revoked' as const:a.endsOn!==null&&a.endsOn<=view.referenceDate?'ended' as const:'active' as const,
        label:a.kind==='HOMEROOM'?`Chủ nhiệm ${a.className}`:`${a.subjectName??''} · ${a.className}`})),
      otherSchools:requiredValue(view.otherSchools,'otherSchools'),schoolActionCodes:[...new Set(membership.grants.filter(g=>g.scopeType==='SCHOOL').flatMap(g=>g.actions))],effectiveGrants:membership.grants,
      history,roleTemplates:choices,referenceDate:requiredValue(view.referenceDate,'referenceDate'),joinedOn:requiredValue(view.joinedOn,'joinedOn'),accessActive:requiredValue(view.accessActive,'accessActive'),
      canAssign:requiredValue(view.canAssign,'canAssign'),canSuspend:requiredValue(view.canSuspend,'canSuspend'),canRole:requiredValue(view.canRole,'canRole'),canViewHistory,isSelf:requiredValue(view.isSelf,'isSelf')};
  },
  async teachers(_ctx:Ctx,schoolId:ID,q:ListQuery){
    const access=captureStaffAccess(),summary=(await http('getStaffDirectorySummary',{params:{schoolId}})).data;access.assertCurrent();
    const status=q.filters?.status,statuses:Record<string,string>={active:'ACTIVE',suspended:'SUSPENDED',revoked:'ENDED',invited:'PENDING_INVITATION',invited_member:'INVITED'};
    if(status&&!statuses[status])throw new RepoError('VALIDATION','Bộ lọc trạng thái nhân sự không hợp lệ.');
    const options={params:{schoolId},query:{q:q.q,status:status?statuses[status]:undefined,department:q.filters?.department,role:q.filters?.role,
      sort:q.sort==='name'?'fullName':q.sort??'fullName',dir:q.dir??'asc'}};
    let page;
    if(q.pageSize===100000){
      const items=(await apiList('listStaffDirectory',{...options,query:{...options.query,purpose:'export'}},10000)).map(directoryRow);access.assertCurrent();
      page={items,total:items.length,page:1,pageSize:q.pageSize!,pageCount:1,allIds:items.map(r=>r.id)};
    }else page=await apiPage('listStaffDirectory',options,q,directoryRow);
    access.assertCurrent();return {...page,kpi:requiredValue(summary.kpi,'kpi'),departments:requiredValue(summary.departments,'departments'),roleOptions:requiredValue(summary.roleLabels,'roleLabels'),
      canInvite:requiredValue(summary.canInvite,'canInvite'),canSuspend:requiredValue(summary.canSuspend,'canSuspend'),canAssign:requiredValue(summary.canAssign,'canAssign'),canExport:requiredValue(summary.canExport,'canExport'),canViewInvitations:requiredValue(summary.canViewInvitations,'canViewInvitations')};
  },
  async setMemberRoles(_ctx:Ctx,schoolId:ID,membershipId:ID,roleTemplateIds:ID[],reason:string,version?:number,validUntil?:string|null){
    const expected=displayedVersion(version);
    const row=await formResult(http('replaceMemberSchoolRoles',{params:{schoolId,memberId:membershipId},body:{
      expectedVersion:expected,roleIds:roleTemplateIds,reason:commandReason(reason),...(validUntil!==undefined?{validUntil}:{})},validateData:row=>confirmed(row,membershipId,expected)&&JSON.stringify([...new Set(requiredValue(row.schoolRoleGrants,'schoolRoleGrants').map(g=>g.roleId))].sort())===JSON.stringify([...roleTemplateIds].sort())}),{roleIds:'roleTemplateIds',roleId:'roleTemplateIds'});
    return {id:requiredId(row.data.id),schoolId,version:displayedVersion(row.data.version),status:row.data.status,
      roleTemplateIds:[...new Set(requiredValue(row.data.schoolRoleGrants,'schoolRoleGrants').map(g=>requiredId(g.roleId)))],schoolRoleGrants:row.data.schoolRoleGrants};
  },
  async setMembershipStatus(_ctx:Ctx,schoolId:ID,membershipId:ID,status:Membership['status'],reason:string,version?:number){
    const expected=displayedVersion(version),target=status==='active'?'ACTIVE':status==='suspended'?'SUSPENDED':'ENDED';
    const options={params:{schoolId,memberId:membershipId},body:{expectedVersion:expected,reason:commandReason(reason)},validateData:(row:ApiSchemas['Member'])=>confirmed(row,membershipId,expected)&&row.status===target};
    const op=status==='active'?'reactivateMember':status==='suspended'?'suspendMember':status==='revoked'?'endMember':null;
    if(!op)throw new RepoError('VALIDATION','Trạng thái thành viên không hợp lệ.');
    return staffMembership((await http(op,options)).data,schoolId);
  },
  async invite(_ctx:Ctx,schoolId:ID,input:{fullName:string;email:string;proposedDuty:string;roleTemplateIds:ID[];days:number;validUntil?:string|null}){
    const row=await formResult(http('inviteSchoolStaff',{params:{schoolId},body:{email:input.email.trim(),workDisplayName:input.fullName.trim(),
      proposedDuty:input.proposedDuty.trim(),roleIds:input.roleTemplateIds,expiresInDays:input.days,...(input.validUntil!==undefined?{validUntil:input.validUntil}:{})},validateData:row=>!!row.id&&row.version>0&&row.email.toLowerCase()===input.email.trim().toLowerCase()&&row.workDisplayName===input.fullName.trim()&&row.proposedDuty===input.proposedDuty.trim()&&row.status==='PENDING'&&Array.isArray(row.roleIds)&&JSON.stringify([...row.roleIds].sort())===JSON.stringify([...input.roleTemplateIds].sort())}),
    {workDisplayName:'fullName',roleIds:'roleTemplateIds',roleId:'roleTemplateIds',expiresInDays:'days'});
    return staffInvitation(row.data,schoolId);
  },
  async invitations(_ctx:Ctx,schoolId:ID){
    return (await apiList('listInvitations',{params:{schoolId},query:{sort:'createdAt',dir:'desc'}},2000)).map(row=>staffInvitation(row,schoolId));
  },
  async revokeInvitation(_ctx:Ctx,schoolId:ID,inviteId:ID,version?:number,reason?:string){
    const expected=displayedVersion(version);
    return staffInvitation((await http('revokeInvitation',{params:{schoolId,invitationId:inviteId},body:{expectedVersion:expected,reason:commandReason(reason)},validateData:row=>confirmed(row,inviteId,expected)&&row.status==='REVOKED'})).data,schoolId);
  },
});
