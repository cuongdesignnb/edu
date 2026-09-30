import type {ID,Gender,GuardianRelationship} from '../../model/types';
import type {Ctx} from '../core';
import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import {dateDays} from '../../api/dates';
import {displayedVersion,formResult,requiredId,requiredValue,withStaffAccess} from './common';
import {RepoError} from '../errors';

export interface StudentCreateInput {
  code?:string;fullName:string;dob:string;gender:Gender;classId:ID;startDate:string;
  guardian?:{fullName:string;relation:GuardianRelationship['relation'];phone:string};
}
export interface StudentPatchInput {fullName:string;dob:string;gender:Gender;internalNote?:string|null;version:number}
const fields={studentCode:'code',dateOfBirth:'dob',initialClassId:'classId',startsOn:'startDate',expectedVersion:'version',initialGuardian:'guardian','initialGuardian.relationshipLabel':'guardian.relation'};
export function nativeStudent(row:ApiSchemas['Student'],schoolId:ID){
  return {id:requiredId(row.id),schoolId,code:row.studentCode,fullName:row.fullName,dob:requiredValue(row.dateOfBirth,'dateOfBirth'),gender:requiredValue(row.gender,'gender'),
    nativeStatus:row.status,status:row.status==='ACTIVE'?'studying' as const:row.status==='LEFT'?'left' as const:row.status==='GRADUATED'?'graduated' as const:'archived' as const,
    preferredName:row.preferredName??null,version:displayedVersion(row.version),updatedAt:row.updatedAt,createdAt:row.createdAt,
    ...(row.internalNote!==undefined?{internalNote:row.internalNote}:{}),...(row.initialEnrollment?{initialEnrollment:row.initialEnrollment}:{}),
    ...(row.initialGuardian?{initialGuardian:row.initialGuardian}:{}),...(row.initialRelationship?{initialRelationship:row.initialRelationship}:{})};
}
function reviewedGender(value:Gender){if(!['Nam','Nữ'].includes(value))throw new RepoError('VALIDATION','Chọn giới tính học sinh.',{fieldErrors:{gender:'Chọn Nam hoặc Nữ.'}});return value;}
function confirmedFields(row:ApiSchemas['Student'],input:{fullName:string;dob:string;gender:Gender}){
  if(!row.id||!Number.isInteger(row.version)||row.version<1||row.fullName!==input.fullName.trim().replace(/\s+/g,' ')||row.dateOfBirth!==input.dob||row.gender!==input.gender)throw new RepoError('NETWORK','Máy chủ chưa xác nhận đầy đủ nội dung hồ sơ. Giữ nội dung để thử lại.');
}

export const connectedStudentsRepo=withStaffAccess({
  async create(_ctx:Ctx,schoolId:ID,input:StudentCreateInput){
    const result=await formResult(http('createStudent',{params:{schoolId},body:{...(input.code?.trim()?{studentCode:input.code.trim().toUpperCase()}:{}),fullName:input.fullName.trim(),dateOfBirth:dateDays(input.dob,0),gender:reviewedGender(input.gender),initialClassId:requiredId(input.classId),startsOn:dateDays(input.startDate,0),
      ...(input.guardian?{initialGuardian:{fullName:input.guardian.fullName.trim(),relationshipLabel:input.guardian.relation,phone:input.guardian.phone.trim()}}:{})}}),fields);
    confirmedFields(result.data,input);if(input.code?.trim()&&result.data.studentCode!==input.code.trim().toUpperCase())throw new RepoError('NETWORK','Chưa xác minh được mã học sinh đã nhập.');
    const enrollment=result.data.initialEnrollment;
    if(!enrollment||enrollment.studentId!==result.data.id||enrollment.classId!==input.classId||enrollment.startsOn!==input.startDate)throw new RepoError('NETWORK','Chưa xác minh được lớp ban đầu của học sinh. Giữ nội dung để thử lại.');
    if(input.guardian){const guardian=result.data.initialGuardian,relationship=result.data.initialRelationship;
      if(!guardian||!guardian.id||!relationship||!relationship.id||relationship.studentId!==result.data.id||relationship.guardianId!==guardian.id||relationship.relationshipLabel!==input.guardian.relation||relationship.isPrimary!==true||relationship.status!=='UNVERIFIED'||relationship.canReceiveInfo!==false||guardian.fullName!==input.guardian.fullName.trim().replace(/\s+/g,' ')||guardian.phone!==input.guardian.phone.trim())throw new RepoError('NETWORK','Chưa xác minh được quan hệ giám hộ. Giữ nội dung để thử lại.');}
    return nativeStudent(result.data,schoolId);
  },
  async update(_ctx:Ctx,schoolId:ID,studentId:ID,patch:StudentPatchInput){
    const result=await formResult(http('updateStudent',{params:{schoolId,studentId},body:{expectedVersion:displayedVersion(patch.version),fullName:patch.fullName.trim(),dateOfBirth:dateDays(patch.dob,0),gender:reviewedGender(patch.gender),...(patch.internalNote!==undefined?{internalNote:patch.internalNote}:{})}}),fields);
    if(result.data.id!==studentId||result.data.version<=patch.version)throw new RepoError('NETWORK','Chưa xác minh được hồ sơ vừa cập nhật.');confirmedFields(result.data,patch);
    if(patch.internalNote!==undefined&&result.data.internalNote!==patch.internalNote)throw new RepoError('NETWORK','Chưa xác minh được ghi chú vừa lưu.');return nativeStudent(result.data,schoolId);
  },
});
