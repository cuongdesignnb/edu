import {http} from '../../api/client';
import type {ApiSchemas} from '../../api/generated';
import type {Ctx} from '../core';
import type {PublicationPolicy} from '../../model/types';
import {withStaffAccess,displayedVersion} from './common';
import {ruleItem} from './conduct';
import {RepoError} from '../errors';

export function publicationPolicyView(v:ApiSchemas['PublicationPolicyWorkspace'],s:string):PublicationPolicy{
 if(v.schoolId!==s||!Number.isInteger(v.version)||v.version<1||!['homeroom','school_leader'].includes(v.lockBy)||!['homeroom','school_leader'].includes(v.publishBy)||!['sunday','monday'].includes(v.weekCloseDay)||typeof v.requireLeaderApproval!=='boolean'||typeof v.attendanceAutoPublish!=='boolean'||!Array.isArray(v.defaultParentModules)||!v.defaultParentModules.length||new Set(v.defaultParentModules).size!==v.defaultParentModules.length)throw new RepoError('READ_ERROR','Quy trình công bố không hợp lệ.');
 return v;
}
export const connectedConductSchoolRepo=withStaffAccess({
 async policy(_ctx:Ctx,s:string){const v=(await http('getPublicationPolicyWorkspace',{params:{schoolId:s}})).data;return {policy:publicationPolicyView(v.policy,s),canEdit:v.canEdit};},
 async savePolicy(_ctx:Ctx,s:string,patch:Omit<PublicationPolicy,'schoolId'>){return publicationPolicyView((await http('savePublicationPolicyWorkspace',{params:{schoolId:s},body:{...patch,version:displayedVersion(patch.version)}})).data,s);},
 async classRules(_ctx:Ctx,s:string,y:string,cl:string){const v=(await http('getClassRuleWorkspace',{params:{schoolId:s,yearId:y,classId:cl}})).data;if(v.schoolId!==s||v.yearId!==y||v.classId!==cl)throw new RepoError('READ_ERROR','Nội quy không thuộc lớp đang xem.');return {current:v.current?ruleItem(v.current,s):null,next:v.next?ruleItem(v.next,s):null,policy:publicationPolicyView(v.policy,s)};},
 async publicationCenter(_ctx:Ctx,s:string,weekId?:string){return (await http('getPublicationCenterWorkspace',{params:{schoolId:s},query:{weekId}})).data;},
});
