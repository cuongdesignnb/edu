import type {ID,School,SchoolSettings} from '../../model/types';
import type {Ctx} from '../core';
import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import {apiList} from '../../api/lists';
import {refreshStaffContext} from '../../api/session';
import {uiActions} from '../../api/permissions';
import {RepoError} from '../errors';
import {formResult,requiredId,requiredValue} from './common';

function school(row:ApiSchemas['School']){
  return {id:requiredId(row.id),name:row.name,code:row.code,slug:row.slug,shortName:requiredValue(row.shortName,'shortName'),status:row.status.toLowerCase() as School['status'],level:row.level??null,province:requiredValue(row.province,'province'),address:row.publicAddress??'',publicEmail:row.publicContactEmail??'',publicPhone:row.publicContactPhone??'',website:row.website??undefined,accentColor:requiredValue(row.accentColor,'accentColor'),motto:requiredValue(row.motto,'motto'),publicIntro:requiredValue(row.publicIntro,'publicIntro'),version:row.version,createdAt:row.createdAt,activatedAt:row.activatedAt??undefined,statusReason:row.statusReason??undefined,onboarding:row.onboarding};
}
function settings(row:ApiSchemas['Settings'],schoolId:ID){
  return {schoolId,language:'vi' as const,timezone:row.timezone,linkDefaultDays:row.parentLinkTtlDays,reportHeader:requiredValue(row.reportHeader,'reportHeader'),shareTeacherPhone:requiredValue(row.shareTeacherPhone,'shareTeacherPhone'),shareTeacherEmail:requiredValue(row.shareTeacherEmail,'shareTeacherEmail'),contactHours:requiredValue(row.contactHours,'contactHours'),version:row.version};
}
type DictionaryKind='grade'|'subject'|'room';
const paths={grade:'grades',subject:'subjects',room:'rooms'} as const;
function dictionary(row:ApiSchemas['DictionaryItem'],schoolId:ID){return {id:requiredId(row.id),schoolId,code:row.code,name:row.name,status:row.status==='ACTIVE'?'active' as const:'inactive' as const,version:row.version,inUse:row.inUse,level:row.gradeLevel??null,color:row.color,capacity:row.capacity??null};}
function version(value:number|undefined){if(value===undefined)throw new RepoError('CONFLICT','Hãy tải lại dữ liệu trước khi sửa để giữ đúng phiên bản.',{details:{requiresReload:true}});return value;}

export const connectedSchoolRepo={
  async profile(_ctx:Ctx,schoolId:ID){const [value,context]=await Promise.all([http('getSchoolProfile',{params:{schoolId}}),refreshStaffContext()]);return {school:school(value.data),canEdit:uiActions(context,{schoolId}).has('school.profile.edit')};},
  async saveProfile(_ctx:Ctx,schoolId:ID,patch:Pick<School,'shortName'|'motto'|'publicIntro'|'publicPhone'|'publicEmail'|'address'|'website'|'accentColor'>&{version:number}){
    const value=await formResult(http('updateSchoolProfile',{params:{schoolId},body:{expectedVersion:patch.version,shortName:patch.shortName,motto:patch.motto,publicIntro:patch.publicIntro,publicContactPhone:patch.publicPhone||null,publicContactEmail:patch.publicEmail||null,publicAddress:patch.address||null,website:patch.website||null,accentColor:patch.accentColor}}),{expectedVersion:'version',publicContactPhone:'publicPhone',publicContactEmail:'publicEmail',publicAddress:'address'});return school(value.data);
  },
  async settings(_ctx:Ctx,schoolId:ID){const [value,context]=await Promise.all([http('getSchoolSettings',{params:{schoolId}}),refreshStaffContext()]);return {settings:settings(value.data,schoolId),canEdit:uiActions(context,{schoolId}).has('school.settings.edit')};},
  async saveSettings(_ctx:Ctx,schoolId:ID,patch:Omit<SchoolSettings,'schoolId'|'language'|'timezone'>){
    const value=await formResult(http('updateSchoolSettings',{params:{schoolId},body:{expectedVersion:patch.version,parentLinkTtlDays:patch.linkDefaultDays,reportHeader:patch.reportHeader,shareTeacherPhone:patch.shareTeacherPhone,shareTeacherEmail:patch.shareTeacherEmail,contactHours:patch.contactHours}}),{expectedVersion:'version',parentLinkTtlDays:'linkDefaultDays'});return settings(value.data,schoolId);
  },
  async dictionaries(_ctx:Ctx,schoolId:ID){
    const [grades,subjects,rooms,context]=await Promise.all([apiList('listDictionary',{params:{schoolId,dictionary:'grades'}},100),apiList('listDictionary',{params:{schoolId,dictionary:'subjects'}},500),apiList('listDictionary',{params:{schoolId,dictionary:'rooms'}},500),refreshStaffContext()]);
    const map=(row:ApiSchemas['DictionaryItem'])=>{if(typeof row.inUse!=='boolean')throw new RepoError('READ_ERROR','Danh mục chưa trả thông tin sử dụng theo hợp đồng.');return dictionary(row,schoolId);};
    return {grades:grades.map(map),subjects:subjects.map(map),rooms:rooms.map(map),canManage:uiActions(context,{schoolId}).has('dictionary.manage')};
  },
  async saveDictionaryItem(_ctx:Ctx,schoolId:ID,kind:DictionaryKind,item:{id?:ID;name:string;code?:string;level?:number;color?:string;capacity?:number;version?:number}){
    if(kind==='grade'&&(!Number.isInteger(item.level)||item.level!<1||item.level!>12))throw new RepoError('VALIDATION','Khối học chưa hợp lệ.',{fieldErrors:{level:'Khối phải từ 1 đến 12.'}});
    const dictionaryPath=paths[kind];
    const fields={name:item.name,...(kind==='grade'?{code:String(item.level),gradeLevel:item.level}:{code:item.code??''}),...(kind==='subject'&&item.color!==undefined?{color:item.color}:{}),...(kind==='room'&&item.capacity!==undefined?{capacity:item.capacity}:{})};
    const write=item.id?http('updateDictionary',{params:{schoolId,dictionary:dictionaryPath,itemId:item.id},body:{...fields,expectedVersion:version(item.version)}}):http('createDictionary',{params:{schoolId,dictionary:dictionaryPath},body:fields});const value=await formResult(write,{expectedVersion:'version',gradeLevel:'level'});return dictionary(value.data,schoolId);
  },
  async setDictionaryStatus(_ctx:Ctx,schoolId:ID,kind:DictionaryKind,itemId:ID,status:'active'|'inactive',expectedVersion?:number){
    const value=await http('updateDictionary',{params:{schoolId,dictionary:paths[kind],itemId},body:{expectedVersion:version(expectedVersion),status:status==='active'?'ACTIVE':'ARCHIVED'}});return dictionary(value.data,schoolId);
  },
};
