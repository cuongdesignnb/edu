import type {ApiSchemas} from '../../api/generated';
import {guardianContact} from './guardian-mapping';
import {displayedVersion,requiredId,requiredValue} from './common';
import {RepoError} from '../errors';

export function guardianFormSource(view:ApiSchemas['GuardianFormContext'],schoolId:string,studentId:string,relationshipId?:string){
  if(view.student.id!==studentId||relationshipId&&view.target?.relationship.id!==relationshipId||!relationshipId&&view.target!==null)throw new RepoError('READ_ERROR','Nguồn sửa giám hộ không khớp học sinh hoặc quan hệ đã chọn.');
  if(view.target&&(view.target.relationship.studentId!==studentId||view.target.relationship.guardianId!==view.target.guardian.id))throw new RepoError('READ_ERROR','Liên hệ giám hộ không khớp nguồn sửa.');
  return {...view,schoolId,student:{...view.student,id:requiredId(view.student.id),version:displayedVersion(view.student.version)},primaryContacts:requiredValue(view.primaryContacts,'primaryContacts').map(row=>({...row,id:requiredId(row.id),version:displayedVersion(row.version)})),
    target:view.target?{...view.target,canEditContact:requiredValue(view.target.canEditContact,'canEditContact'),guardian:guardianContact(view.target.guardian,schoolId),relationship:{...view.target.relationship,id:requiredId(view.target.relationship.id),version:displayedVersion(view.target.relationship.version)}}:null};
}
export type GuardianFormSource=ReturnType<typeof guardianFormSource>;
export interface GuardianSaveInput {studentId:string;guardianId?:string;relationshipId?:string;fullName:string;relation:string;phone:string;email?:string|null;isPrimaryContact:boolean;source:GuardianFormSource}
export function guardianSaveBody(schoolId:string,input:GuardianSaveInput):ApiSchemas['GuardianSaveRequest']{
  const {source}=input;
  if(!source||source.schoolId!==schoolId||source.student.id!==input.studentId||input.guardianId!==source.target?.guardian.id||input.relationshipId!==source.target?.relationship.id)throw new RepoError('CONFLICT','Hãy tải lại đúng nguồn giám hộ trước khi sửa.',{details:{requiresReload:true}});
  const fullName=input.fullName.trim().replace(/\s+/g,' '),relationshipLabel=input.relation.trim(),phone=input.phone.trim(),email=input.email?.trim()||null;
  if(!fullName||!relationshipLabel)throw new RepoError('VALIDATION','Nhập đủ tên và quan hệ giám hộ.',{fieldErrors:{...(!fullName?{fullName:'Nhập tên người giám hộ.'}:{}),...(!relationshipLabel?{relation:'Nhập quan hệ với học sinh.'}:{})}});
  const unchanged=!!source.target&&(phone===source.target.guardian.phoneMasked||phone===''&&source.target.guardian.phone===null);
  if(!unchanged&&(!/^\+?[\d ().-]{8,32}$/.test(phone)||phone.replace(/\D/g,'').length<8||phone.replace(/\D/g,'').length>15))throw new RepoError('VALIDATION','Nhập số điện thoại đầy đủ; không lưu số đã che.',{fieldErrors:{phone:'Nhập số điện thoại đầy đủ.'}});
  if(source.target&&!source.target.canEditContact&&(fullName!==source.target.guardian.fullName||email!==source.target.guardian.email||!unchanged&&phone!==source.target.guardian.phone))throw new RepoError('FORBIDDEN','Liên hệ dùng chung cần người có quyền quản lý tất cả lớp liên quan sửa.');
  return {expectedStudentVersion:displayedVersion(source.student.version),expectedPrimaryContacts:source.primaryContacts.map(row=>({id:requiredId(row.id),version:displayedVersion(row.version)})),fullName,relationshipLabel,email,isPrimary:input.isPrimaryContact,...(!unchanged?{phone}:{}),
    ...(source.target?{guardianId:requiredId(input.guardianId),relationshipId:requiredId(input.relationshipId),expectedGuardianVersion:displayedVersion(source.target.guardian.version),expectedRelationshipVersion:displayedVersion(source.target.relationship.version)}:{})};
}
