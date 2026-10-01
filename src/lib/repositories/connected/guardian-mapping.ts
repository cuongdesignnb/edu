import type {ApiSchemas} from '../../api/generated';
import type {ID} from '../../model/types';
import {requiredId,requiredValue,displayedVersion} from './common';
import {RepoError} from '../errors';

export function guardianContact(row:ApiSchemas['Guardian'],schoolId:ID){
  const phone=requiredValue(row.phone,'phone');return {...row,id:requiredId(row.id),schoolId,version:displayedVersion(row.version),phone,
    email:requiredValue(row.email,'email'),phoneMasked:phone===null?null:phone.replace(/(\d{4})\d+(\d{3})$/,'$1 *** $2'),nativeStatus:row.status};
}
export function guardianLink(row:ApiSchemas['StudentAccessLink'],schoolId:ID){
  if(['token','tokenHash','link'].some(key=>Object.hasOwn(row,key)))throw new RepoError('READ_ERROR','Hồ sơ link tra cứu chứa trường ngoài hợp đồng.');
  return {...row,id:requiredId(row.id),schoolId,version:displayedVersion(row.version),studentId:requiredId(row.studentId),yearId:requiredId(row.yearId),relationshipId:requiredId(row.relationshipId),
  modules:requiredValue(row.allowedSections,'allowedSections').filter(s=>s!=='overview'),status:row.status.toLowerCase(),nativeStatus:row.status,issuedAt:row.createdAt,relation:row.relationshipLabel,yearLabel:row.yearName};}
export function guardianDirectoryRow(row:ApiSchemas['GuardianDirectoryRow'],schoolId:ID){return {...guardianContact(row,schoolId),verified:requiredValue(row.verified,'verified'),unverified:requiredValue(row.unverified,'unverified'),revoked:requiredValue(row.revoked,'revoked'),activeLinks:requiredValue(row.activeLinks,'activeLinks'),
  students:requiredValue(row.students,'students').map(s=>({...s,id:requiredId(s.id),version:displayedVersion(s.version),relationshipId:requiredId(s.relationshipId),relationshipVersion:displayedVersion(s.relationshipVersion),verification:s.verification.toLowerCase(),nativeVerification:s.verification,
    classId:requiredValue(s.classId,'classId'),className:requiredValue(s.className,'className'),yearId:requiredValue(s.yearId,'yearId')}))};}
export function guardianProfile(view:ApiSchemas['GuardianDetails'],schoolId:ID){
  if(!view.canViewHistory&&(view.history!==null||view.historyHasMore!==null)||view.canViewHistory&&(view.history===null||view.historyHasMore===null))throw new RepoError('READ_ERROR','Lịch sử giám hộ không khớp quyền hiện tại.');
  for(const row of view.relationships){
    if(row.guardianId!==view.guardian.id||row.studentId!==row.student.id||!row.canSeeLinks&&row.links!==null||row.canSeeLinks&&row.links===null)throw new RepoError('READ_ERROR','Quan hệ giám hộ không khớp hồ sơ hoặc quyền hiện tại.');
    if(row.links?.some(link=>link.relationshipId!==row.id||link.studentId!==row.studentId))throw new RepoError('READ_ERROR','Link tra cứu không khớp quan hệ giám hộ.');
  }
  return {
  guardian:guardianContact(requiredValue(view.guardian,'guardian'),schoolId),today:requiredValue(view.today,'today'),canEditContact:requiredValue(view.canEditContact,'canEditContact'),canViewHistory:requiredValue(view.canViewHistory,'canViewHistory'),historyHasMore:requiredValue(view.historyHasMore,'historyHasMore'),
  relationships:requiredValue(view.relationships,'relationships').map(r=>({...r,id:requiredId(r.id),schoolId,version:displayedVersion(r.version),studentId:requiredId(r.studentId),guardianId:requiredId(r.guardianId),relation:r.relationshipLabel,verification:r.status.toLowerCase(),nativeVerification:r.status,isPrimaryContact:r.isPrimary,
    verifiedByName:requiredValue(r.verifiedByName,'verifiedByName'),verificationNote:requiredValue(r.verificationNote,'verificationNote'),revokedReason:requiredValue(r.revokedReason,'revokedReason'),
    student:{...r.student,id:requiredId(r.student.id),version:displayedVersion(r.student.version),classId:requiredValue(r.student.classId,'classId'),className:requiredValue(r.student.className,'className'),yearId:requiredValue(r.student.yearId,'yearId'),enrollmentId:requiredValue(r.student.enrollmentId,'enrollmentId'),enrollmentVersion:requiredValue(r.student.enrollmentVersion,'enrollmentVersion')},
    links:requiredValue(r.links,'links')===null?null:r.links!.map(l=>guardianLink(l,schoolId))})),
  history:requiredValue(view.history,'history')===null?null:view.history!.map(row=>({...row,id:requiredId(row.id),schoolId,actorName:requiredValue(row.actorName,'actorName'),actorId:requiredValue(row.actorId,'actorId'),entityType:row.targetType,entityId:requiredId(row.targetId)})),
};}
