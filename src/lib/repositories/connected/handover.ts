import type {ApiSchemas} from '../../api/generated';
import {http,captureStaffAccess} from '../../api/client';
import {RepoError,isRepoError} from '../errors';
import {commandReason,displayedVersion,requiredId,requiredValue,formResult} from './common';
import {assignment} from './assignment-mapping';
import {dateDays} from '../../api/dates';

type Receipt=ApiSchemas['Handover'];
export interface HandoverInput {
  classId:string;toMembershipId:string;effectiveDate:string;note:string;clientRequestId:string;
  fromAssignmentId:string;fromAssignmentVersion:number;classVersion:number;toMemberVersion:number;previewHash:string;
}
export interface HandoverPreviewInput {effectiveDate?:string;toMembershipId?:string}
const fields={toMemberId:'toMembershipId',effectiveOn:'effectiveDate',reason:'note',expectedFromAssignmentVersion:'fromAssignmentVersion',expectedClassVersion:'classVersion',expectedToMemberVersion:'toMemberVersion'};
export async function readHandoverPreview(schoolId:string,classId:string,input:HandoverPreviewInput={}){
  const view=(await formResult(http('getHandoverPreview',{params:{schoolId,classId},query:{toMemberId:input.toMembershipId,effectiveOn:input.effectiveDate?dateDays(input.effectiveDate,0):undefined}}),fields)).data;
  return {...view,current:requiredValue(view.current,'current'),openItems:requiredValue(view.openItems,'openItems'),previewHash:requiredValue(view.previewHash,'previewHash'),toMemberVersion:requiredValue(view.toMemberVersion,'toMemberVersion')};
}
export async function readHandoverReceipt(schoolId:string,clientRequestId:string){
  return (await http('getHandoverByRequest',{params:{schoolId,requestId:clientRequestId}})).data;
}
function sameIntent(row:Receipt,input:HandoverInput){
  if(!row.id||row.clientRequestId!==input.clientRequestId||row.classId!==input.classId||row.fromAssignmentId!==input.fromAssignmentId||row.toMemberId!==input.toMembershipId||row.effectiveOn!==input.effectiveDate||row.reason.trim()!==input.note.trim())
    throw new RepoError('NETWORK','Chưa xác minh được biên nhận bàn giao. Giữ nội dung để thử lại.');
  displayedVersion(row.version);return row;
}
function applied(row:Receipt,input:HandoverInput,schoolId:string){
  const result=requiredValue(row.appliedAssignment,'appliedAssignment');
  if(row.status!=='APPLIED'||!result||row.appliedAssignmentId!==result.id||result.classId!==input.classId||result.memberId!==input.toMembershipId||result.kind!=='HOMEROOM'||result.startsOn!==input.effectiveDate||!row.appliedAt)
    throw new RepoError('NETWORK','Máy chủ chưa xác nhận đầy đủ kết quả bàn giao. Giữ nội dung để thử lại.');
  return {...assignment(result,schoolId),handoverId:requiredId(row.id),handoverVersion:row.version,appliedAt:row.appliedAt,checklist:requiredValue(row.checklist,'checklist')};
}

/** Caller keeps the nonsecret request UUID through retry/reload and reviews fresh source changes explicitly. */
export async function applyHandover(schoolId:string,input:HandoverInput){
  const access=captureStaffAccess(),source={expectedFromAssignmentVersion:displayedVersion(input.fromAssignmentVersion),expectedClassVersion:displayedVersion(input.classVersion),expectedToMemberVersion:displayedVersion(input.toMemberVersion)};
  if(!input.fromAssignmentId||!input.clientRequestId||!/^[0-9a-f]{64}$/.test(input.previewHash))throw new RepoError('CONFLICT','Hãy mở lại bước xác nhận và xem đủ nguồn bàn giao.',{details:{requiresReload:true}});
  const note=commandReason(input.note),date=dateDays(input.effectiveDate,0);let receipt:Receipt|undefined;
  try{receipt=sameIntent(await readHandoverReceipt(schoolId,input.clientRequestId),input);}catch(error){access.assertCurrent();if(!isRepoError(error)||error.code!=='NOT_FOUND')throw error;}
  access.assertCurrent();
  if(!receipt){
    receipt=sameIntent((await formResult(http('createHandover',{params:{schoolId},body:{classId:input.classId,fromAssignmentId:input.fromAssignmentId,toMemberId:input.toMembershipId,effectiveOn:date,reason:note,clientRequestId:input.clientRequestId,previewHash:input.previewHash,...source},idempotencyKey:`${input.clientRequestId}:handover:create`}),fields)).data,input);
    access.assertCurrent();
  }
  if(receipt.status==='APPLIED')return applied(receipt,input,schoolId);
  if(receipt.status!=='SUBMITTED')throw new RepoError('CONFLICT','Biên nhận bàn giao không còn ở trạng thái chờ áp dụng.');
  if(receipt.previewHash!==input.previewHash){
    receipt=sameIntent((await formResult(http('reviewHandover',{params:{schoolId,handoverId:requiredId(receipt.id)},body:{expectedVersion:receipt.version,previewHash:input.previewHash,...source},idempotencyKey:`${input.clientRequestId}:handover:review:${input.previewHash}`}),fields)).data,input);
    access.assertCurrent();if(receipt.status!=='SUBMITTED'||receipt.previewHash!==input.previewHash)throw new RepoError('NETWORK','Chưa xác minh được nguồn bàn giao vừa xem lại.');
  }
  receipt=sameIntent((await formResult(http('approveHandover',{params:{schoolId,handoverId:requiredId(receipt.id)},body:{expectedVersion:receipt.version,previewHash:input.previewHash},idempotencyKey:`${input.clientRequestId}:handover:approve:${receipt.version}`}),fields)).data,input);
  access.assertCurrent();return applied(receipt,input,schoolId);
}
