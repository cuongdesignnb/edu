import type {ID,School,SchoolStatus,PlatformSettings,SupportScope} from '../../model/types';
import type {Ctx,ListQuery} from '../core';
import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import {apiPage,apiList} from '../../api/lists';
import {refreshStaffContext,serverNowISO} from '../../api/session';
import {RepoError} from '../errors';
import {mapSchool} from './school';
import {formResult,requiredId,requiredValue,withStaffAccess,displayedVersion,commandReason} from './common';
import {supportActions,supportGrant,supportTicket,supportMessage,platformAudit} from './platform-mapping';

function row(value:ApiSchemas['School']){
  const school=mapSchool(value),onboarding=requiredValue(school.onboarding,'onboarding');
  const keys=['profileDone','adminAssigned','yearCreated','classesCreated','teachersInvited','studentsImported','homeroomAssigned','rulesPublished'] as const;
  const steps=keys.map(key=>requiredValue(onboarding[key],key));
  return {id:school.id,name:school.name,shortName:school.shortName,slug:school.slug,code:school.code,province:school.province,level:school.level,status:school.status,adminNames:requiredValue(value.adminNames,'adminNames'),classCount:requiredValue(value.classCount,'classCount'),staffCount:requiredValue(value.staffCount,'staffCount'),createdAt:school.createdAt,onboardingDone:steps.filter(Boolean).length,onboardingTotal:steps.length,version:school.version};
}
function settings(value:ApiSchemas['PlatformSettings']){
  return {brandName:value.brandName,supportEmail:value.supportEmail??'',supportPhone:value.publicSupportPhone??'',footerNote:requiredValue(value.footerNote,'footerNote'),version:value.version,dateFormat:'dd/MM/yyyy' as const,timezone:'Asia/Ho_Chi_Minh' as const};
}
const profileFields={expectedVersion:'version',publicAddress:'address',publicContactEmail:'publicEmail',publicContactPhone:'publicPhone','firstAdmin.email':'adminEmail','firstAdmin.workDisplayName':'adminName','firstAdmin.validUntil':'adminEmail',expiresInDays:'days'};

export const connectedPlatformRepo=withStaffAccess({
  async overview(_ctx:Ctx){
    const context=await refreshStaffContext(),dashboard=(await http('getPlatformOverview')).data,metric=(key:string)=>{const value=dashboard.metrics.find(m=>m.key===key);if(!value||typeof value.value!=='number')throw new RepoError('READ_ERROR',`Tổng quan thiếu chỉ số ${key}.`);return value.value;};
    const recent=context.platformActions.includes('platform.audit')?(await http('listPlatformAudit',{query:{limit:6,sort:'createdAt',dir:'desc'}})).data.map(platformAudit):null;
    return {totalSchools:metric('total'),activeSchools:metric('active'),suspendedSchools:metric('suspended'),draftSchools:metric('draft'),activeStaff:metric('staff'),linkOpens30d:metric('opens'),openTickets:metric('tickets'),recent,asOf:dashboard.asOf};
  },
  async listSchools(_ctx:Ctx,q:ListQuery){
    const [page,options]=await Promise.all([apiPage('listPlatformSchools',{query:{q:q.q,status:q.filters?.status?.toUpperCase(),province:q.filters?.province,sort:q.sort??'name',dir:q.dir}},q,row),http('getPlatformSchoolOptions')]);return {...page,provinces:options.data.provinces};
  },
  async createSchool(_ctx:Ctx,input:{name:string;shortName:string;code:string;slug:string;level:School['level'];province:string;address:string;publicEmail:string;publicPhone:string;adminName:string;adminEmail:string;asDraft:boolean}){
    if(!input.asDraft&&!input.adminEmail.trim())throw new RepoError('VALIDATION',undefined,{fieldErrors:{adminEmail:'Cần email quản trị đầu tiên để hoàn tất. Hoặc chọn “Lưu nháp”.'}});
    if(input.adminEmail&&!input.adminName.trim())throw new RepoError('VALIDATION',undefined,{fieldErrors:{adminName:'Nhập họ tên quản trị đầu tiên.'}});
    if(input.adminName&&!input.adminEmail.trim())throw new RepoError('VALIDATION',undefined,{fieldErrors:{adminEmail:'Nhập email để tạo lời mời.'}});
    const firstAdmin=input.adminEmail.trim()?{email:input.adminEmail.trim(),workDisplayName:input.adminName.trim(),roleId:null}:undefined;
    const result=await formResult(http('createSchool',{body:{name:input.name.trim(),shortName:input.shortName.trim()||input.name.trim(),code:input.code,slug:input.slug,level:input.level,province:input.province,publicAddress:input.address||null,publicContactEmail:input.publicEmail||null,publicContactPhone:input.publicPhone||null,...(firstAdmin?{firstAdmin}:{})}}),profileFields);
    return mapSchool(result.data);
  },
  async school(_ctx:Ctx,schoolId:ID){
    const context=await refreshStaffContext(),actions=new Set(context.platformActions);
    const [profile,admins,invitations,history,support]=await Promise.all([http('getPlatformSchool',{params:{schoolId}}),actions.has('platform.admins.manage')?apiList('listSchoolAdmins',{params:{schoolId}},1000):null,actions.has('platform.admins.manage')?apiList('listSchoolAdminInvitations',{params:{schoolId}},1000):null,actions.has('platform.audit')?apiList('listPlatformAudit',{query:{schoolId,sort:'createdAt',dir:'desc'}},2000):null,actions.has('platform.support')?http('getPlatformSupportOptions',{query:{schoolId}}):null]);
    const now=serverNowISO();return {school:mapSchool(profile.data),row:row(profile.data),admins:admins?.map(member=>{const grants=requiredValue(member.grants,'grants'),active=member.status==='ACTIVE'&&grants.some(g=>g.scopeType==='SCHOOL'&&g.roleCode==='SCHOOL_ADMIN');return {membershipId:requiredId(member.id),userId:requiredId(member.userId),version:member.version,name:member.workDisplayName,email:requiredValue(member.loginEmail,'loginEmail'),status:active?'active' as const:member.status==='SUSPENDED'?'suspended' as const:'revoked' as const,since:grants.map(g=>g.validFrom).sort()[0]};})??null,invitations:invitations?.map(invitation=>({id:requiredId(invitation.id),schoolId,email:invitation.email,fullName:requiredValue(invitation.workDisplayName,'workDisplayName'),version:invitation.version,createdAt:invitation.createdAt,updatedAt:invitation.updatedAt,expiresAt:invitation.expiresAt,status:invitation.status==='PENDING'&&invitation.expiresAt<=now?'expired' as const:invitation.status.toLowerCase() as 'pending'|'accepted'|'declined'|'revoked'}))??null,history:history?.map(platformAudit)??null,tickets:support?.data.queue.total??null,activeGrants:support?.data.grants.active??null};
  },
  async updateSchoolOps(_ctx:Ctx,schoolId:ID,patch:Partial<Pick<School,'name'|'shortName'|'province'|'address'|'publicEmail'|'publicPhone'>>&{version:number}){
    const result=await formResult(http('updatePlatformSchool',{params:{schoolId},body:{expectedVersion:displayedVersion(patch.version),...(patch.name!==undefined?{name:patch.name}:{}),...(patch.shortName!==undefined?{shortName:patch.shortName}:{}),...(patch.province!==undefined?{province:patch.province}:{}),...(patch.address!==undefined?{publicAddress:patch.address||null}:{}),...(patch.publicEmail!==undefined?{publicContactEmail:patch.publicEmail||null}:{}),...(patch.publicPhone!==undefined?{publicContactPhone:patch.publicPhone||null}:{})}}),profileFields);return mapSchool(result.data);
  },
  async changeSchoolStatus(_ctx:Ctx,schoolId:ID,status:SchoolStatus,reason:string,expectedVersion?:number){
    if(status==='draft')throw new RepoError('VALIDATION','Chỉ tạo trường ở trạng thái nháp. Không có lệnh đưa trường đã hoạt động về nháp.');
    return mapSchool((await http('setSchoolStatus',{params:{schoolId},body:{expectedVersion:displayedVersion(expectedVersion),status:status==='active'?'ACTIVE':status==='suspended'?'SUSPENDED':'ARCHIVED',reason:commandReason(reason)}})).data);
  },
  async inviteSchoolAdmin(_ctx:Ctx,schoolId:ID,input:{fullName:string;email:string;days:number}){
    return (await formResult(http('inviteSchoolAdmin',{params:{schoolId},body:{email:input.email.trim(),workDisplayName:input.fullName.trim(),roleId:null,expiresInDays:input.days}}),{workDisplayName:'fullName',expiresInDays:'days'})).data;
  },
  async revokeSchoolAdmin(_ctx:Ctx,schoolId:ID,membershipId:ID,reason:string,expectedVersion?:number){
    return (await http('revokeSchoolAdmin',{params:{schoolId,memberId:membershipId},body:{expectedVersion:displayedVersion(expectedVersion),reason:commandReason(reason)}})).data;
  },
  async revokeInvitation(_ctx:Ctx,inviteId:ID,schoolId:ID,expectedVersion?:number,reason?:string){
    return (await http('revokePlatformAdminInvitation',{params:{schoolId,invitationId:inviteId},body:{expectedVersion:displayedVersion(expectedVersion),reason:commandReason(reason)}})).data;
  },
  async tickets(_ctx:Ctx,q:ListQuery){return apiPage('listPlatformTickets',{query:{q:q.q,status:q.filters?.status?.toUpperCase(),priority:q.filters?.priority?.toUpperCase(),schoolId:q.filters?.schoolId,sort:q.sort??'createdAt',dir:q.dir??'desc'}},q,supportTicket);},
  async ticket(_ctx:Ctx,ticketId:ID){
    const [value,messages,grants]=await Promise.all([http('getPlatformTicket',{params:{ticketId}}),apiList('listPlatformTicketMessages',{params:{ticketId},query:{sort:'createdAt',dir:'asc'}},2000),apiList('listPlatformSupportAccess',{query:{ticketId}},1000)]);
    const ticket=supportTicket(value.data),updates=messages.map(supportMessage),people:Record<string,string>={[ticket.createdBy]:ticket.createdByName};if(ticket.assigneeUserId&&ticket.assigneeName)people[ticket.assigneeUserId]=ticket.assigneeName;for(const update of updates)if(update.by)people[update.by]=update.byName;
    return {ticket:{...ticket,updates},school:{id:ticket.schoolId,name:ticket.schoolName,status:ticket.schoolStatus},grants:grants.map(supportGrant),people,operators:requiredValue(value.data.operatorChoices,'operatorChoices')};
  },
  async updateTicket(_ctx:Ctx,ticketId:ID,input:{text?:string;status?:'open'|'in_progress'|'waiting_school'|'resolved'|'closed';assigneeUserId?:ID;version?:number}){
    const status=input.status?.toUpperCase() as ApiSchemas['SupportTicketPatch']['status'];
    const value=await formResult(http('updatePlatformTicket',{params:{ticketId},body:{expectedVersion:displayedVersion(input.version),...(status?{status}:{}),...(input.text!==undefined?{message:input.text.trim()}:{}),...(input.assigneeUserId!==undefined?{assigneeId:input.assigneeUserId}:{})}}),{expectedVersion:'version',message:'text',assigneeId:'assigneeUserId'});return supportTicket(value.data);
  },
  async supportGrants(_ctx:Ctx,q:ListQuery={}){return apiPage('listPlatformSupportAccess',{query:{q:q.q,schoolId:q.filters?.schoolId,viewStatus:q.filters?.status,sort:q.sort??'createdAt',dir:q.dir??'desc'}},q,supportGrant);},
  async requestSupportGrant(_ctx:Ctx,input:{schoolId:ID;ticketId?:ID;scopes:SupportScope[];reason:string;days:number}){
    if(!input.ticketId)throw new RepoError('VALIDATION',undefined,{fieldErrors:{ticketId:'Chọn yêu cầu hỗ trợ của đúng trường.'}});
    return supportGrant((await formResult(http('requestPlatformSupportAccess',{params:{schoolId:input.schoolId},body:{ticketId:input.ticketId,allowedActions:supportActions(input.scopes),reason:input.reason.trim(),durationDays:input.days}}),{allowedActions:'scopes',durationDays:'days'})).data);
  },
  async audit(_ctx:Ctx,q:ListQuery){
    const [page,options]=await Promise.all([apiPage('listPlatformAudit',{query:{q:q.q,actorId:q.filters?.actor,from:q.filters?.from,to:q.filters?.to,sort:q.sort??'createdAt',dir:q.dir??'desc'}},q,platformAudit),http('getPlatformAuditOptions')]);return {...page,actors:options.data.actors};
  },
  async settings(_ctx:Ctx){return settings((await http('getPlatformSettings')).data);},
  async saveSettings(_ctx:Ctx,patch:Omit<PlatformSettings,'version'|'dateFormat'|'timezone'>&{version:number}){
    return settings((await formResult(http('updatePlatformSettings',{body:{expectedVersion:displayedVersion(patch.version),brandName:patch.brandName.trim(),supportEmail:patch.supportEmail.trim()||null,publicSupportPhone:patch.supportPhone.trim()||null,footerNote:patch.footerNote.trim()}}),{expectedVersion:'version',publicSupportPhone:'supportPhone'})).data);
  },
});

export const connectedPlatformExtraRepo=withStaffAccess({
  async operations(_ctx:Ctx){
    const value=(await http('getPlatformOperationsOverview')).data,c=value.checklist;
    const names:Record<string,{name:string;description:string}>={api:{name:'Ứng dụng web / API',description:'API đã xác thực cho lần kiểm tra hiện tại'},database:{name:'PostgreSQL',description:'Schema, checksum và quyền runtime'},parent:{name:'Cổng phụ huynh qua link',description:'Kết nối cơ sở dữ liệu bằng role riêng'},storage:{name:'Lưu trữ tệp',description:'Kho tệp riêng trên máy chủ'},worker:{name:'Xử lý nền',description:'Vòng xử lý thực tế và kết nối cơ sở dữ liệu'},mail:{name:'Gửi email',description:'Kết quả gửi thư và cấu hình hiện tại'}};
    return {simulated:false as const,checkedAt:value.checkedAt,services:value.services.map(service=>({...service,...names[service.key]})),backups:value.backups.map(backup=>({id:requiredId(backup.id),kind:backup.kind,state:backup.status.toLowerCase() as 'queued'|'running'|'succeeded'|'failed',at:requiredValue(backup.createdAt,'createdAt'),startedAt:backup.startedAt,finishedAt:backup.finishedAt,summary:backup.summary})),backupTotal:value.backupTotal,store:value.store,storageFreeBytes:value.storageFreeBytes,mail:value.mail,checklist:[
      {key:'no-admin',label:'Trường đang hoạt động chưa có quản trị',count:c.noAdmin,tone:c.noAdmin?'attention' as const:'ok' as const,href:'/platform/schools',hint:'Tính từ quản trị mặc định còn hiệu lực, nhân sự và tài khoản đang hoạt động.'},
      {key:'drafts',label:'Trường chờ kích hoạt',count:c.drafts,tone:c.drafts?'attention' as const:'ok' as const,href:'/platform/schools',hint:'Số trường đang ở trạng thái nháp.'},
      {key:'inv',label:'Lời mời quản trị sắp hết hạn (3 ngày)',count:c.expiringAdminInvitations,tone:c.expiringAdminInvitations?'attention' as const:'ok' as const,href:'/platform/schools',hint:`${c.pendingAdminInvitations} lời mời quản trị đang chờ và còn hạn.`},
      {key:'tickets-high',label:'Yêu cầu hỗ trợ ưu tiên cao chưa xong',count:c.highTickets,tone:c.highTickets?'attention' as const:'ok' as const,href:'/platform/support',hint:'Không gồm yêu cầu đã xử lý hoặc đã đóng.'},
      {key:'tickets-unassigned',label:'Yêu cầu chưa phân công',count:c.unassignedTickets,tone:c.unassignedTickets?'attention' as const:'ok' as const,href:'/platform/support',hint:'Phân công người xử lý trong mục Yêu cầu hỗ trợ.'},
      {key:'grants',label:'Quyền hỗ trợ đang hiệu lực',count:c.activeGrants,tone:'ok' as const,href:'/platform/support-access',hint:`${c.requestedGrants} đề nghị còn hạn đang chờ nhà trường cho phép.`},
    ]};
  },
  async checkSchoolIdentity(_ctx:Ctx,code:string,slug:string){return (await http('checkPlatformSchoolIdentity',{query:{code,slug}})).data;},
  async operators(_ctx:Ctx){return (await http('getPlatformSupportOptions')).data.operators;},
  async ticketStats(_ctx:Ctx){return (await http('getPlatformSupportOptions')).data.queue;},
  async supportTargets(_ctx:Ctx,schoolId?:ID){const value=(await http('getPlatformSupportOptions',{query:{schoolId}})).data;return {schools:value.schools,tickets:value.tickets};},
  async assignTicket(_ctx:Ctx,ticketId:ID,assigneeUserId:ID,expectedVersion?:number){return supportTicket((await http('updatePlatformTicket',{params:{ticketId},body:{expectedVersion:displayedVersion(expectedVersion),assigneeId:assigneeUserId}})).data);},
  async relinquishGrant(_ctx:Ctx,grantId:ID,reason:string,expectedVersion?:number){return supportGrant((await http('relinquishPlatformSupportAccess',{params:{supportAccessId:grantId},body:{expectedVersion:displayedVersion(expectedVersion),reason:commandReason(reason)}})).data);},
});
