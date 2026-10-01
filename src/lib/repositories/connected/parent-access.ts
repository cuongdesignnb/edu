import type {ApiSchemas} from '../../api/generated';
import type {ID,ParentModule} from '../../model/types';
import {RepoError} from '../errors';
import {displayedVersion,requiredId,requiredValue,commandReason} from './common';

const privateFields=['token','tokenHash','link','phone','email','dateOfBirth','internalNote','ipDailyHash','requestUserAgent'];
export function assertParentMetadata(value:object){if(privateFields.some(key=>Object.hasOwn(value,key)))throw new RepoError('READ_ERROR','Metadata link chứa trường ngoài hợp đồng.');}
export interface ParentRevokeSource {version:number;studentId:string;yearId:string;relationshipId:string}
export function staffParentLink(row:ApiSchemas['ParentStaffAccessRow'],schoolId:ID){
  assertParentMetadata(row);
  const status=requiredValue(row.status,'status'),sections=requiredValue(row.allowedSections,'allowedSections');
  if(!['ACTIVE','EXPIRED','REVOKED'].includes(status)||!Array.isArray(sections)||new Set(sections).size!==sections.length||sections.some(section=>!['overview','teachers','timetable','attendance','conduct','activities','announcements','documents','duties'].includes(section))||!Number.isInteger(row.opens)||row.opens<0)throw new RepoError('READ_ERROR','Trạng thái hoặc phạm vi link không hợp lệ.');
  for(const key of ['canIssue','canRevoke','canPreview','allowDownload','canReceiveInfo'] as const)if(typeof row[key]!=='boolean')throw new RepoError('READ_ERROR',`Chưa xác nhận ${key}.`);
  return {...row,id:requiredId(row.id),version:displayedVersion(row.version),schoolId,studentId:requiredId(row.studentId),studentVersion:displayedVersion(row.studentVersion),yearId:requiredId(row.yearId),relationshipId:requiredId(row.relationshipId),relationshipVersion:displayedVersion(row.relationshipVersion),guardianId:requiredId(row.guardianId),guardianVersion:displayedVersion(row.guardianVersion),classId:requiredId(row.classId),classVersion:displayedVersion(row.classVersion),
    status:status.toLowerCase() as 'active'|'expired'|'revoked',nativeStatus:status,issuedAt:requiredValue(row.createdAt,'createdAt'),modules:sections.filter(section=>section!=='overview') as ParentModule[],relation:requiredValue(row.relationshipLabel,'relationshipLabel'),yearLabel:requiredValue(row.yearName,'yearName'),opens:requiredValue(row.opens,'opens'),lastOpenedAt:requiredValue(row.lastOpenedAt,'lastOpenedAt')};
}
export function staffParentDetails(value:ApiSchemas['ParentStaffAccessDetails'],schoolId:ID,accessId:ID){
  assertParentMetadata(value);
  if(typeof value.canViewContact!=='boolean'||value.phoneMasked!==null&&(typeof value.phoneMasked!=='string'||!value.phoneMasked.includes('*')))throw new RepoError('READ_ERROR','Chưa xác nhận quyền hoặc liên hệ được che số.');
  const access=staffParentLink(requiredValue(value.access,'access'),schoolId);
  if(access.id!==accessId||!value.canViewContact&&value.phoneMasked!==null)throw new RepoError('READ_ERROR','Chi tiết link không khớp quyền hoặc đối tượng đã chọn.');
  const siblings=requiredValue(value.siblings,'siblings');
  if(!Number.isInteger(siblings.total)||siblings.total<0||typeof siblings.hasMore!=='boolean'||siblings.items.length>20||new Set(siblings.items.map(row=>row.id)).size!==siblings.items.length||siblings.items.some(row=>row.id===accessId||!['ACTIVE','EXPIRED','REVOKED'].includes(row.status))||siblings.hasMore&&siblings.total<=siblings.items.length||!siblings.hasMore&&siblings.total!==siblings.items.length)throw new RepoError('READ_ERROR','Danh sách link liên quan chưa được xác nhận.');
  return {access,today:requiredValue(value.today,'today'),canViewContact:requiredValue(value.canViewContact,'canViewContact'),
    student:{id:access.studentId,version:access.studentVersion,fullName:access.studentName,code:access.studentCode,classId:access.classId,className:access.className,nativeStatus:access.studentStatus},
    guardian:{id:access.guardianId,version:access.guardianVersion,fullName:access.guardianName,phoneMasked:requiredValue(value.phoneMasked,'phoneMasked')},
    relationship:{id:access.relationshipId,version:access.relationshipVersion,studentId:access.studentId,guardianId:access.guardianId,relation:access.relationshipLabel,verification:access.relationshipStatus.toLowerCase(),canReceiveInfo:access.canReceiveInfo},
    yearLabel:access.yearName,issuedByName:access.issuedByName,revokedByName:requiredValue(value.revokedByName,'revokedByName'),replacedBy:requiredValue(value.replacedById,'replacedById'),
    siblings:siblings.items.map(row=>({...row,id:requiredId(row.id),status:row.status.toLowerCase() as 'active'|'expired'|'revoked',relation:row.relationshipLabel})),siblingsHasMore:requiredValue(siblings.hasMore,'siblings.hasMore'),siblingsTotal:requiredValue(siblings.total,'siblings.total')};
}
export function parentRevokeBody(reason:string,source:ParentRevokeSource){
  requiredId(source.studentId);requiredId(source.yearId);requiredId(source.relationshipId);
  return {expectedVersion:displayedVersion(source.version),reason:commandReason(reason)};
}
export function parentRevokeReceipt(row:ApiSchemas['ParentAccess'],id:ID,source:ParentRevokeSource,reason:string){
  if(row.id!==id||!Number.isInteger(row.version)||row.version<1||row.version<=source.version||row.studentId!==source.studentId||row.yearId!==source.yearId||row.relationshipId!==source.relationshipId||!row.revokedAt||!Number.isFinite(Date.parse(row.revokedAt))||row.revokeReason!==reason)throw new RepoError('NETWORK','Chưa xác minh được kết quả thu hồi link. Giữ lý do để thử lại.');
  if(['token','tokenHash','link'].some(key=>Object.hasOwn(row,key)))throw new RepoError('NETWORK','Phản hồi thu hồi chứa trường ngoài hợp đồng.');
  return {id:requiredId(row.id),version:displayedVersion(row.version),revokedAt:row.revokedAt,revokeReason:row.revokeReason};
}
