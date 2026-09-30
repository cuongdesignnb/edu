import type {ID,School,SchoolStatus,PlatformSettings} from '../../model/types';
import type {Ctx,ListQuery} from '../core';
import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import {apiPage} from '../../api/lists';
import {RepoError} from '../errors';
import {mapSchool} from './school';
import {formResult,requiredValue,withStaffAccess,displayedVersion,commandReason} from './common';

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
  async settings(_ctx:Ctx){return settings((await http('getPlatformSettings')).data);},
  async saveSettings(_ctx:Ctx,patch:Omit<PlatformSettings,'version'|'dateFormat'|'timezone'>&{version:number}){
    return settings((await formResult(http('updatePlatformSettings',{body:{expectedVersion:displayedVersion(patch.version),brandName:patch.brandName.trim(),supportEmail:patch.supportEmail.trim()||null,publicSupportPhone:patch.supportPhone.trim()||null,footerNote:patch.footerNote.trim()}}),{expectedVersion:'version',publicSupportPhone:'supportPhone'})).data);
  },
});

export const connectedPlatformExtraRepo=withStaffAccess({
  async checkSchoolIdentity(_ctx:Ctx,code:string,slug:string){return (await http('checkPlatformSchoolIdentity',{query:{code,slug}})).data;},
});
