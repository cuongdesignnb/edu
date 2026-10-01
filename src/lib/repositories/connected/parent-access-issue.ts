import type {ApiSchemas} from '../../api/generated';
import type {ParentModule} from '../../model/types';
import {RepoError} from '../errors';
import {displayedVersion,requiredId,requiredValue,commandReason} from './common';

export const parentModules:ParentModule[]=['attendance','conduct','timetable','duties','activities','announcements','teachers','documents'];
export type ParentIssueSource=ApiSchemas['ParentIssueSource'];
export interface ParentIssueInput {source:ParentIssueSource;relationshipId:string;modules:ParentModule[];allowDownload:boolean;expiresOn:string;replace?:{accessId:string;version?:number};reason?:string}
export function parentIssueContext(value:ApiSchemas['ParentIssueContext'],schoolId:string){
  if(requiredId(value.schoolId)!==schoolId)throw new RepoError('READ_ERROR','Phản hồi cấp link không thuộc trường đã chọn.');
  displayedVersion(value.schoolVersion);requiredValue(value.today,'today');requiredValue(value.timezone,'timezone');requiredValue(value.schoolSlug,'schoolSlug');
  if(!Array.isArray(value.defaultSections)||value.defaultSections.some(section=>section!=='overview'&&!parentModules.includes(section as ParentModule)))throw new RepoError('READ_ERROR','Chính sách cấp link chưa được xác nhận.');
  const year=requiredValue(value.year,'year');if(year){requiredId(year.id);displayedVersion(year.version);requiredValue(year.lastDay,'lastDay');requiredValue(year.suggestedExpiryOn,'suggestedExpiryOn');}
  return {...value,defaultModules:value.defaultSections.filter(section=>section!=='overview') as ParentModule[]};
}
export function parentIssueSource(value:ParentIssueSource,schoolId:string,studentId:string,yearId?:string){
  parentIssueContext(requiredValue(value.context,'context'),schoolId);
  if(requiredId(value.student?.id)!==studentId||yearId&&value.context.year?.id!==yearId)throw new RepoError('READ_ERROR','Nguồn cấp link không khớp học sinh hoặc năm học đã chọn.');
  displayedVersion(value.student.version);requiredId(value.enrollment?.id);displayedVersion(value.enrollment?.version);requiredValue(value.enrollment?.inEffect,'enrollment.inEffect');requiredId(value.class?.id);displayedVersion(value.class?.version);
  if(!Array.isArray(value.relationships))throw new RepoError('READ_ERROR','Chưa nhận được danh sách người giám hộ.');
  for(const row of value.relationships){requiredId(row.id);displayedVersion(row.version);requiredId(row.guardianId);displayedVersion(row.guardianVersion);requiredValue(row.canReceiveInfo,'canReceiveInfo');requiredValue(row.canIssue,'canIssue');requiredValue(row.activeLinkIds,'activeLinkIds');}
  return value;
}
export function parentIssueBody(schoolId:string,input:ParentIssueInput):ApiSchemas['ParentAccessReviewedCreate']{
  const source=parentIssueSource(input.source,schoolId,input.source.student.id),year=source.context.year,relationship=source.relationships.find(row=>row.id===input.relationshipId);
  if(!year)throw new RepoError('VALIDATION','Trường chưa có năm học đang hoạt động.');
  if(!relationship||!relationship.canIssue||relationship.status!=='VERIFIED'||!relationship.canReceiveInfo)throw new RepoError('UNVERIFIED','Người nhận cần được xác minh và có quyền nhận thông tin.');
  if(!input.modules.length||new Set(input.modules).size!==input.modules.length||input.modules.some(section=>!parentModules.includes(section)))throw new RepoError('VALIDATION','Chọn ít nhất một mục được xem.',{fieldErrors:{modules:'Chọn các mục được phép xem.'}});
  if(typeof input.allowDownload!=='boolean'||input.allowDownload&&!input.modules.includes('documents'))throw new RepoError('VALIDATION','Chỉ cấp quyền tải khi cho phép xem tài liệu.',{fieldErrors:{allowDownload:'Kiểm tra quyền tải tài liệu.'}});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn)||input.expiresOn<source.context.today||input.expiresOn>year.lastDay)throw new RepoError('VALIDATION','Hạn sử dụng cần nằm trong thời gian còn lại của năm học.',{fieldErrors:{expiresOn:'Kiểm tra hạn sử dụng.'}});
  return {studentId:source.student.id,yearId:year.id,relationshipId:relationship.id,allowedSections:['overview',...input.modules],allowDownload:input.allowDownload,expiresOn:input.expiresOn,
    reviewedSource:{schoolVersion:source.context.schoolVersion,yearVersion:year.version,studentVersion:source.student.version,enrollmentId:source.enrollment.id,enrollmentVersion:source.enrollment.version,classVersion:source.class.version,relationshipVersion:relationship.version,guardianVersion:relationship.guardianVersion},
    ...(input.replace?{replace:{accessId:requiredId(input.replace.accessId),expectedVersion:displayedVersion(input.replace.version)},reason:commandReason(input.reason)}:{})};
}
export function parentIssueReceipt(value:ApiSchemas['ParentAccessIssued'],body:ApiSchemas['ParentAccessReviewedCreate'],source:ParentIssueSource){
  const access=value?.access;
  const fail=()=>{throw new RepoError('NETWORK','Chưa xác minh được kết quả cấp link. Giữ nội dung để kiểm tra lại.');};
  if(!access||!access.id||body.replace?.accessId===access.id||!Number.isInteger(access.version)||access.version<1||access.studentId!==body.studentId||access.yearId!==body.yearId||access.relationshipId!==body.relationshipId||access.allowDownload!==body.allowDownload||access.revokedAt!==null||value.displayOnce!==true||!Array.isArray(access.allowedSections)||[...access.allowedSections].sort().join('|')!==[...body.allowedSections].sort().join('|')||!Number.isFinite(Date.parse(access.expiresAt)))fail();
  for(const key of ['token','tokenHash','link'])if(Object.hasOwn(access,key))fail();
  let url:URL;try{url=new URL(value.link);}catch{return fail();}
  if(!['http:','https:'].includes(url.protocol)||url.pathname!==`/p/${source.context.schoolSlug}/access`||url.search||!/^#token=[A-Za-z0-9_-]{43}$/.test(url.hash)||url.username||url.password||typeof window!=='undefined'&&url.origin!==window.location.origin)fail();
  return {id:access.id,version:access.version,expiresAt:access.expiresAt,modules:access.allowedSections.filter(section=>section!=='overview') as ParentModule[],allowDownload:access.allowDownload,link:url.href};
}
