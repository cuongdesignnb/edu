import type {ID,Gender,GuardianRelationship} from '../../model/types';
import type {Ctx,ListQuery} from '../core';
import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import {dateDays,inclusiveDate} from '../../api/dates';
import {apiPage,apiList} from '../../api/lists';
import {displayedVersion,formResult,requiredId,requiredValue,withStaffAccess} from './common';
import {RepoError} from '../errors';
import {guardianDirectoryRow,guardianProfile,guardianContact} from './guardian-mapping';
import {guardianSaveBody,type GuardianSaveInput} from './guardian-form';

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
function directoryRow(row:ApiSchemas['StudentDirectoryRow'],schoolId:ID){
  const source=nativeStudent(row,schoolId);
  return {id:source.id,code:source.code,fullName:source.fullName,dob:source.dob,gender:source.gender,status:source.status,nativeStatus:source.nativeStatus,version:source.version,
    classId:requiredId(row.classId),className:requiredValue(row.className,'className'),yearId:requiredId(row.yearId),yearLabel:row.yearName,
    enrollmentId:requiredId(row.enrollmentId),enrollmentVersion:displayedVersion(row.enrollmentVersion),enrollmentInEffect:requiredValue(row.enrollmentInEffect,'enrollmentInEffect'),
    guardianCount:requiredValue(row.guardianCount,'guardianCount'),verifiedGuardians:requiredValue(row.verifiedGuardians,'verifiedGuardians'),activeLinks:requiredValue(row.activeLinks,'activeLinks'),avatarTone:'blue'};
}
function profileView(view:ApiSchemas['StudentDetails'],schoolId:ID){
  const student=nativeStudent(requiredValue(view.student,'student'),schoolId),selected=requiredValue(view.selectedEnrollment,'selectedEnrollment'),perms=requiredValue(view.perms,'perms');
  const family=requiredValue(view.relationships,'relationships'),links=requiredValue(view.links,'links'),logs=requiredValue(view.accessLog,'accessLog'),positions=requiredValue(view.positions,'positions');
  if(perms.seeGuardians&&family===null||perms.manageLinks&&(links===null||logs===null)||view.level==='FULL'&&positions===null)throw new RepoError('READ_ERROR','Máy chủ chưa trả đủ phần hồ sơ được phép xem.');
  if(!perms.seeGuardians&&family!==null||!perms.manageLinks&&(links!==null||logs!==null)||!perms.seeInternalNote&&(view.internalNote!==null||Object.hasOwn(view.student,'internalNote')))throw new RepoError('READ_ERROR','Phản hồi hồ sơ vượt quyền đang được xác nhận.');
  const classView=selected?{id:requiredId(selected.classId),name:selected.className,yearId:requiredId(selected.yearId),yearLabel:selected.yearName,homeroom:selected.homeroomName,referenceDate:view.referenceDate,enrollmentId:requiredId(selected.id),enrollmentVersion:displayedVersion(selected.version)}:null;
  return {student:{...student,...(perms.seeInternalNote?{internalNote:requiredValue(view.internalNote,'internalNote')}:{})},level:view.level==='FULL'?'full' as const:'subject-minimal' as const,
    today:requiredValue(view.today,'today'),year:requiredValue(view.year,'year'),referenceDate:requiredValue(view.referenceDate,'referenceDate'),currentClass:selected?.inEffect?classView:null,lastClass:selected&&!selected.inEffect?classView:null,
    selectedEnrollment:selected,group:requiredValue(view.group,'group')?.name??null,positions:positions===null?null:positions.map(p=>p.name),nativePositions:positions,
    history:requiredValue(view.history,'history').map(e=>({...e,schoolId,studentId:requiredId(e.studentId),classId:requiredId(e.classId),yearId:requiredId(e.yearId),startDate:e.startsOn,endDate:e.endsOn===null?null:inclusiveDate(e.endsOn),status:e.status.toLowerCase(),className:e.className,yearLabel:e.yearName,homeroom:e.homeroomName})),
    relationships:family===null?null:family.map(r=>({...r,schoolId,studentId:requiredId(r.studentId),guardianId:requiredId(r.guardianId),relation:r.relationshipLabel,isPrimaryContact:r.isPrimary,verification:r.status.toLowerCase(),
      guardian:{...r.guardian,schoolId,phoneMasked:r.guardian.phone===null?null:requiredValue(r.guardian.phone,'guardian.phone').replace(/(\d{4})\d+(\d{3})$/,'$1 *** $2')}})),
    links:links===null?null:links.map(l=>({...l,schoolId,studentId:requiredId(l.studentId),yearId:requiredId(l.yearId),relationshipId:requiredId(l.relationshipId),modules:requiredValue(l.allowedSections,'allowedSections').filter(s=>s!=='overview'),
      issuedAt:l.createdAt,relation:l.relationshipLabel,yearLabel:l.yearName,status:l.status.toLowerCase(),nativeStatus:l.status})),
    accessLog:logs===null?null:logs.map(l=>({...l,schoolId,accessId:requiredId(l.accessLinkId),at:l.occurredAt,event:l.eventKind,device:l.deviceSummary,module:l.section,label:`Link cấp cho ${l.relationshipLabel.toLowerCase()} (${l.guardianName})`})),
    accessLogHasMore:requiredValue(view.accessLogHasMore,'accessLogHasMore'),perms};
}

export const connectedStudentsRepo=withStaffAccess({
  async saveGuardian(_ctx:Ctx,schoolId:ID,input:GuardianSaveInput){
    const body=guardianSaveBody(schoolId,input);
    const acknowledge=(view:ApiSchemas['GuardianSaveResult'])=>{
      const contact=guardianContact(view.guardian,schoolId),row=view.relationship;
      if(view.studentId!==input.studentId||view.studentVersion<=body.expectedStudentVersion||row.studentId!==input.studentId||row.guardianId!==contact.id||contact.fullName!==body.fullName||contact.email!==body.email||body.phone!==undefined&&contact.phone!==body.phone||row.relationshipLabel!==body.relationshipLabel||row.isPrimary!==body.isPrimary||input.relationshipId&&row.id!==input.relationshipId||input.guardianId&&contact.id!==input.guardianId)throw new RepoError('NETWORK','Chưa xác minh được kết quả lưu giám hộ. Hãy giữ nội dung để thử lại.');
      if(!input.relationshipId&&(row.status!=='UNVERIFIED'||row.canReceiveInfo!==false)||input.source.target&&(contact.version<input.source.target.guardian.version||row.version<=input.source.target.relationship.version||row.status!==input.source.target.relationship.status||row.canReceiveInfo!==input.source.target.relationship.canReceiveInfo))throw new RepoError('NETWORK','Trạng thái hoặc phiên bản giám hộ không khớp xác nhận lưu.');
      return {...row,id:requiredId(row.id),schoolId,version:displayedVersion(row.version),studentVersion:displayedVersion(view.studentVersion),guardian:contact,relation:row.relationshipLabel,verification:row.status.toLowerCase(),nativeVerification:row.status,isPrimaryContact:row.isPrimary};
    };
    const result=await formResult(http('saveStudentGuardian',{params:{schoolId,studentId:input.studentId},body,validateData:view=>{acknowledge(view);return true;}}),{expectedStudentVersion:'studentVersion',expectedGuardianVersion:'guardianVersion',expectedRelationshipVersion:'relationshipVersion',relationshipLabel:'relation'});
    return acknowledge(result.data);
  },
  async setVerification(_ctx:Ctx,schoolId:ID,relationshipId:ID,status:'verified'|'revoked',note:string,source:{version:number;canReceiveInfo?:boolean}){
    if(!['verified','revoked'].includes(status))throw new RepoError('VALIDATION','Trạng thái xác minh không hợp lệ.');
    if(note.trim().length<3)throw new RepoError('VALIDATION','Ghi căn cứ xác minh hoặc lý do thu hồi ít nhất 3 ký tự.',{fieldErrors:{note:'Nhập căn cứ hoặc lý do ít nhất 3 ký tự.'}});
    const expectedVersion=displayedVersion(source.version);
    if(status==='verified'&&typeof source.canReceiveInfo!=='boolean')throw new RepoError('VALIDATION','Chọn rõ quyền nhận thông tin trước khi xác minh.',{fieldErrors:{canReceiveInfo:'Chọn có hoặc không cho nhận thông tin.'}});
    const acknowledge=(row:ApiSchemas['Relationship'])=>{
      if(row.id!==relationshipId||row.status!==(status==='verified'?'VERIFIED':'REVOKED')||row.canReceiveInfo!==(status==='verified'?source.canReceiveInfo:false)||displayedVersion(row.version)<=expectedVersion)throw new RepoError('NETWORK','Chưa xác minh được kết quả cập nhật quan hệ. Hãy tải lại hồ sơ.');
      return {...row,id:requiredId(row.id),schoolId,studentId:requiredId(row.studentId),guardianId:requiredId(row.guardianId),relation:row.relationshipLabel,verification:status,nativeVerification:row.status,isPrimaryContact:row.isPrimary};
    };
    const params={schoolId,relationshipId},data=await formResult(status==='verified'
      ?http('verifyRelationship',{params,body:{expectedVersion,canReceiveInfo:source.canReceiveInfo!,verificationNote:note.trim()},validateData:row=>{acknowledge(row);return true;}})
      :http('revokeRelationship',{params,body:{expectedVersion,reason:note.trim()},validateData:row=>{acknowledge(row);return true;}}),{verificationNote:'note',reason:'note'});
    return acknowledge(data.data);
  },
  async guardians(_ctx:Ctx,schoolId:ID,q:ListQuery){
    const verification=q.filters?.verification,states:Record<string,string>={verified:'VERIFIED',unverified:'UNVERIFIED',revoked:'REVOKED'};
    if(verification&&!states[verification]||q.sort&&!['name','fullName'].includes(q.sort))throw new RepoError('VALIDATION','Bộ lọc giám hộ không hợp lệ.');
    return apiPage('listGuardianDirectory',{params:{schoolId},query:{q:q.q,verification:verification?states[verification]:undefined,sort:'fullName',dir:q.dir??'asc'}},q,row=>guardianDirectoryRow(row,schoolId));
  },
  async guardian(_ctx:Ctx,schoolId:ID,guardianId:ID){const value=(await http('getGuardianDetails',{params:{schoolId,guardianId}})).data;
    if(value.guardian.id!==guardianId)throw new RepoError('READ_ERROR','Máy chủ trả sai hồ sơ giám hộ.');return guardianProfile(value,schoolId);
  },
  async list(_ctx:Ctx,schoolId:ID,q:ListQuery){
    const summary=(await http('getStudentDirectorySummary',{params:{schoolId},query:{yearId:q.filters?.yearId}})).data;
    const statuses:Record<string,string>={studying:'ACTIVE',left:'LEFT',graduated:'GRADUATED',archived:'ARCHIVED'},status=q.filters?.status,guardian=q.filters?.guardian;
    if(status&&!statuses[status]||guardian&&guardian!=='unverified')throw new RepoError('VALIDATION','Bộ lọc học sinh không hợp lệ.');
    const sorts:Record<string,string>={name:'fullName',code:'studentCode',class:'className',fullName:'fullName',studentCode:'studentCode',className:'className'};
    if(q.sort&&!sorts[q.sort])throw new RepoError('VALIDATION','Cách sắp xếp học sinh không hợp lệ.');
    const options={params:{schoolId},query:{yearId:summary.year?.id,classId:q.filters?.classId,status:status?statuses[status]:undefined,guardian,q:q.q,sort:q.sort?sorts[q.sort]:'fullName',dir:q.dir??'asc'}};
    const page=await apiPage('listStudentDirectory',options,q,row=>directoryRow(row,schoolId));
    if(page.items.some(row=>row.yearId!==summary.year?.id))throw new RepoError('READ_ERROR','Năm học đã thay đổi. Hãy tải lại danh sách.');
    if(!page.allIds.length&&page.total>0&&page.total<=10000){const ids=await apiList('listStudentDirectoryIds',options,10000);if(ids.length!==page.total)throw new RepoError('READ_ERROR','Danh sách chọn đã thay đổi. Hãy tải lại.');page.allIds=ids.map(row=>requiredId(row.id));}
    return {...page,kpi:requiredValue(summary.kpi,'kpi'),year:requiredValue(summary.year,'year'),referenceDate:requiredValue(summary.referenceDate,'referenceDate'),today:summary.today,
      yearOptions:summary.years,classOptions:summary.classes,canSeeGuardians:summary.canSeeGuardians,canSeeLinks:summary.canSeeLinks,canCreate:summary.canCreate,canTransfer:summary.canTransfer,canExport:summary.canExport,canSelectAll:page.total<=10000};
  },
  async profile(_ctx:Ctx,schoolId:ID,studentId:ID,classId?:ID,yearId?:ID){
    const view=(await http('getStudentDetails',{params:{schoolId,studentId},query:{classId,yearId}})).data;
    if(view.student.id!==studentId)throw new RepoError('READ_ERROR','Máy chủ trả sai hồ sơ học sinh.');return profileView(view,schoolId);
  },
  async create(_ctx:Ctx,schoolId:ID,input:StudentCreateInput){
    const confirm=(data:ApiSchemas['Student'])=>{
      confirmedFields(data,input);if(input.code?.trim()&&data.studentCode!==input.code.trim().toUpperCase())throw new RepoError('NETWORK','Chưa xác minh được mã học sinh đã nhập.');
      const enrollment=data.initialEnrollment;
      if(!enrollment||enrollment.studentId!==data.id||enrollment.classId!==input.classId||enrollment.startsOn!==input.startDate)throw new RepoError('NETWORK','Chưa xác minh được lớp ban đầu của học sinh. Giữ nội dung để thử lại.');
      if(input.guardian){const guardian=data.initialGuardian,relationship=data.initialRelationship;
      if(!guardian||!guardian.id||!relationship||!relationship.id||relationship.studentId!==data.id||relationship.guardianId!==guardian.id||relationship.relationshipLabel!==input.guardian.relation||relationship.isPrimary!==true||relationship.status!=='UNVERIFIED'||relationship.canReceiveInfo!==false||guardian.fullName!==input.guardian.fullName.trim().replace(/\s+/g,' ')||guardian.phone!==input.guardian.phone.trim())throw new RepoError('NETWORK','Chưa xác minh được quan hệ giám hộ. Giữ nội dung để thử lại.');}
      return true;
    };
    const result=await formResult(http('createStudent',{params:{schoolId},body:{...(input.code?.trim()?{studentCode:input.code.trim().toUpperCase()}:{}),fullName:input.fullName.trim(),dateOfBirth:dateDays(input.dob,0),gender:reviewedGender(input.gender),initialClassId:requiredId(input.classId),startsOn:dateDays(input.startDate,0),
      ...(input.guardian?{initialGuardian:{fullName:input.guardian.fullName.trim(),relationshipLabel:input.guardian.relation,phone:input.guardian.phone.trim()}}:{})},validateData:confirm}),fields);
    return nativeStudent(result.data,schoolId);
  },
  async update(_ctx:Ctx,schoolId:ID,studentId:ID,patch:StudentPatchInput){
    const confirm=(data:ApiSchemas['Student'])=>{
      if(data.id!==studentId||data.version<=patch.version)throw new RepoError('NETWORK','Chưa xác minh được hồ sơ vừa cập nhật.');confirmedFields(data,patch);
      if(patch.internalNote!==undefined&&data.internalNote!==patch.internalNote)throw new RepoError('NETWORK','Chưa xác minh được ghi chú vừa lưu.');
      return true;
    };
    const result=await formResult(http('updateStudent',{params:{schoolId,studentId},body:{expectedVersion:displayedVersion(patch.version),fullName:patch.fullName.trim(),dateOfBirth:dateDays(patch.dob,0),gender:reviewedGender(patch.gender),...(patch.internalNote!==undefined?{internalNote:patch.internalNote}:{})},validateData:confirm}),fields);
    return nativeStudent(result.data,schoolId);
  },
});
