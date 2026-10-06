import type {ApiSchemas} from '../../api/generated';
import {dateDays,exclusiveDate,inclusiveDate} from '../../api/dates';
import type {ID} from '../../model/types';
import {RepoError} from '../errors';
import {displayedVersion,requiredId,requiredValue} from './common';

export interface StaffAssignmentInput {
  membershipId:ID;kind:'homeroom'|'subject';classId:ID;subjectId?:ID;
  roleId?:ID;validFrom:string;validTo?:string;reason?:string;memberVersion?:number;classVersion?:number;
}
export function assignmentBody(input:StaffAssignmentInput,versions=false):ApiSchemas['AssignmentCreate']{
  if(!['homeroom','subject'].includes(input.kind))throw new RepoError('VALIDATION','Nhiệm vụ phân công không hợp lệ.');
  if(input.kind==='subject'&&!input.subjectId)throw new RepoError('VALIDATION','Chọn môn được phân công.',{fieldErrors:{subjectId:'Chọn môn.'}});
  return {memberId:requiredId(input.membershipId),classId:requiredId(input.classId),kind:input.kind==='homeroom'?'HOMEROOM':'SUBJECT',
    ...(input.roleId?{roleId:requiredId(input.roleId)}:{}),...(input.kind==='subject'?{subjectId:requiredId(input.subjectId)}:{}),startsOn:dateDays(input.validFrom,0),
    ...(input.validTo!==undefined?{endsOn:exclusiveDate(input.validTo)}:{}),...(input.reason?.trim()?{reason:input.reason.trim()}:{}),
    ...(versions||input.memberVersion!==undefined?{expectedMemberVersion:displayedVersion(input.memberVersion)}:{}),
    ...(versions||input.classVersion!==undefined?{expectedClassVersion:displayedVersion(input.classVersion)}:{})};
}
export function assignment(row:ApiSchemas['Assignment'],schoolId:ID){
  const ends=requiredValue(row.endsOn,'endsOn'),revokedAt=requiredValue(row.revokedAt,'revokedAt');
  return {id:requiredId(row.id),schoolId,version:displayedVersion(row.version),classId:requiredId(row.classId),membershipId:requiredId(row.memberId),roleGrantId:requiredId(row.roleGrantId),
    kind:row.kind==='HOMEROOM'?'homeroom' as const:'subject' as const,subjectId:row.subjectId??null,validFrom:row.startsOn,validTo:ends===null?null:inclusiveDate(ends),
    revokedAt,status:revokedAt===null?'active' as const:'revoked' as const,createdAt:row.createdAt,updatedAt:row.updatedAt};
}
