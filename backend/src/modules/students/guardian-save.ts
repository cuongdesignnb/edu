import {one,type Transaction,type Row} from '../../database/database';
import {dto,getResource,insertResource,updateResource,resource} from '../../database/resources';
import {audit,canonical} from '../../common/commands';
import {Problem,notFound,validation} from '../../common/problem';
import {canEditGuardianContact} from './guardian-policy';
import type {Grant} from '../../common/permissions';
import type {RequestContext} from '../../api.router';

type Access={grants:Grant[];today:string};
const ref=(row:Row)=>({id:row.id,version:row.version});
export function guardianSaveFields(body:Record<string,unknown>){
  const name=String(body.fullName).trim().replace(/\s+/g,' '),relation=String(body.relationshipLabel).trim();
  if(!name)validation('fullName','Nhập tên người giám hộ');if(!relation)validation('relationshipLabel','Nhập quan hệ giám hộ');
  const phone=body.phone;
  if(phone!==undefined&&(typeof phone!=='string'||!/^\+?[\d ().-]{8,32}$/.test(phone.trim())||phone.replace(/\D/g,'').length<8||phone.replace(/\D/g,'').length>15))validation('phone','Nhập số điện thoại đầy đủ; không lưu số đã che');
  if(!body.guardianId&&phone===undefined)validation('phone','Nhập số điện thoại liên hệ');
  return {fullName:name,email:body.email,...(phone!==undefined?{phone:(phone as string).trim()}:{})};
}
export async function guardianSaveTarget(tx:Transaction,c:RequestContext){
  const schoolId=c.params.schoolId!,studentId=c.params.studentId!,relationshipId=c.operation.id==='getStudentGuardianForm'?c.query.relationshipId:c.body.relationshipId;
  if(c.operation.id!=='getStudentGuardianForm'){
    const existing=!!c.body.guardianId||!!relationshipId;
    if(existing&&(!c.body.guardianId||!relationshipId||!c.body.expectedGuardianVersion||!c.body.expectedRelationshipVersion))validation('relationshipId','Chọn đúng liên hệ và phiên bản quan hệ đã hiển thị');
    if(!existing&&(c.body.expectedGuardianVersion!==undefined||c.body.expectedRelationshipVersion!==undefined))validation('relationshipId','Liên hệ mới không nhận phiên bản của liên hệ khác');
  }
  if(!relationshipId)return null;
  const relationship=await getResource(tx,resource('relationship'),schoolId,String(relationshipId));
  if(relationship.student_id!==studentId||c.body.guardianId&&relationship.guardian_id!==c.body.guardianId)notFound();
  const guardian=await getResource(tx,resource('guardian'),schoolId,String(relationship.guardian_id));
  if(guardian.status!=='ACTIVE')throw new Problem(409,'GUARDIAN_ARCHIVED');
  return {guardian,relationship};
}
export async function authorizeGuardianChanges(tx:Transaction,c:RequestContext,access:Access){
  const target=await guardianSaveTarget(tx,c),fields=guardianSaveFields(c.body);
  if(target&&Object.entries(fields).some(([key,value])=>target.guardian[resource('guardian').fields[key]!]!==value)
    &&!await canEditGuardianContact(tx,c.params.schoolId!,String(target.guardian.id),access.grants,access.today))throw new Problem(403,'SHARED_GUARDIAN_SCOPE');
  return target;
}
async function primaryContacts(tx:Transaction,schoolId:string,studentId:string){
  const rows=(await tx.query<Row>('SELECT id,version FROM app.guardian_relationships WHERE school_id=$1 AND student_id=$2 AND is_primary ORDER BY id LIMIT 1001',[schoolId,studentId])).rows;
  if(rows.length>1000)throw new Problem(422,'GUARDIAN_RELATIONSHIP_LIMIT');return rows.map(ref);
}
export async function guardianForm(tx:Transaction,c:RequestContext,access:Access){
  const schoolId=c.params.schoolId!,studentId=c.params.studentId!,student=await getResource(tx,resource('student'),schoolId,studentId),target=await guardianSaveTarget(tx,c);
  return {student:{id:student.id,version:student.version,name:student.full_name,code:student.student_code},today:access.today,primaryContacts:await primaryContacts(tx,schoolId,studentId),
    target:target?{guardian:dto(resource('guardian'),target.guardian),relationship:dto(resource('relationship'),target.relationship),canEditContact:await canEditGuardianContact(tx,schoolId,String(target.guardian.id),access.grants,access.today)}:null};
}
export async function saveGuardian(tx:Transaction,c:RequestContext){
  const schoolId=c.params.schoolId!,studentId=c.params.studentId!,body=c.body,fields=guardianSaveFields(body),target=await guardianSaveTarget(tx,c);
  const student=await getResource(tx,resource('student'),schoolId,studentId,true);
  if(student.version!==body.expectedStudentVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(student.version));
  const expected=body.expectedPrimaryContacts as Array<{id:string;version:number}>;
  if(new Set(expected.map(row=>row.id)).size!==expected.length)validation('expectedPrimaryContacts','Mỗi liên hệ ưu tiên chỉ xuất hiện một lần');
  const actual=await primaryContacts(tx,schoolId,studentId);
  if(canonical([...expected].sort((a,b)=>a.id.localeCompare(b.id)))!==canonical(actual))throw new Problem(409,'GUARDIAN_PRIMARY_CHANGED');
  if(target){
    if(target.guardian.version!==body.expectedGuardianVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(target.guardian.version));
    if(target.relationship.version!==body.expectedRelationshipVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(target.relationship.version));
  }else if((await one<{count:number}>(tx,'SELECT count(*)::int AS count FROM app.guardian_relationships WHERE school_id=$1 AND student_id=$2',[schoolId,studentId]))!.count>=1000)throw new Problem(422,'GUARDIAN_RELATIONSHIP_LIMIT');
  const changed=target?Object.fromEntries(Object.entries(fields).filter(([key,value])=>target.guardian[resource('guardian').fields[key]!]!==value)):fields;
  const guardian=target?(Object.keys(changed).length?await updateResource(tx,resource('guardian'),schoolId,String(target.guardian.id),{...changed,expectedVersion:body.expectedGuardianVersion}):dto(resource('guardian'),target.guardian)):
    await insertResource(tx,resource('guardian'),schoolId,fields);
  if(!target||Object.keys(changed).length)await audit(tx,c,'guardian',String(guardian.id),{version:guardian.version});
  if(body.isPrimary){const cleared=(await tx.query<Row>('UPDATE app.guardian_relationships SET is_primary=false WHERE school_id=$1 AND student_id=$2 AND is_primary AND ($3::uuid IS NULL OR id<>$3) RETURNING id,version',[schoolId,studentId,target?.relationship.id??null])).rows;
    for(const row of cleared)await audit(tx,c,'relationship',String(row.id),{isPrimary:false,version:row.version});}
  const relationFields={relationshipLabel:String(body.relationshipLabel).trim(),isPrimary:body.isPrimary};
  const relationship=target?await updateResource(tx,resource('relationship'),schoolId,String(target.relationship.id),{...relationFields,expectedVersion:body.expectedRelationshipVersion}):
    await insertResource(tx,resource('relationship'),schoolId,{...relationFields,studentId,guardianId:guardian.id},{status:'UNVERIFIED',can_receive_info:false});
  await audit(tx,c,'relationship',String(relationship.id),{version:relationship.version,isPrimary:relationship.isPrimary,status:relationship.status});
  const updated=(await one<{version:number}>(tx,'UPDATE app.students SET updated_at=now() WHERE school_id=$1 AND id=$2 AND version=$3 RETURNING version',[schoolId,studentId,body.expectedStudentVersion]))!;
  await audit(tx,c,'student',studentId,{familyChanged:true,version:updated.version});
  return {studentId,studentVersion:updated.version,guardian,relationship};
}
