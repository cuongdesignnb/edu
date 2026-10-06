import type {ApiSchemas} from '@/lib/api/generated';
export type QuickCreateKind='year'|'grade'|'room'|'subject'|'class'|'teacher'|'student';
const actions:Record<QuickCreateKind,string[]>={year:['year.manage'],grade:['dictionary.manage'],room:['dictionary.manage'],subject:['dictionary.manage'],class:['class.manage'],teacher:['member.create_direct','role.manage'],student:['student.manage']};
/** Advisory visibility uses the same membership, scope, clock and dated grant as a native command. */
export function canNativeFormAction(context:ApiSchemas['Context']|null,schoolId:string,required:string[],classId?:string){
 const member=context?.memberships.find(m=>m.schoolId===schoolId);if(!context||!member||member.status!=='ACTIVE'||member.schoolStatus!=='ACTIVE')return false;
 const now=Date.parse(context.serverNow);
 return member.grants.some(g=>{
  if(g.revokedAt||Date.parse(g.validFrom)>now||g.validUntil&&now>=Date.parse(g.validUntil))return false;
  if(g.scopeType!=='SCHOOL'){
   if(!classId||g.classId!==classId)return false;
   if(['HOMEROOM','SUBJECT_TEACHER'].includes(g.roleCode??'')&&(!g.assignmentStartsOn||member.today<g.assignmentStartsOn||g.assignmentEndsOn&&member.today>=g.assignmentEndsOn))return false;
  }
  return required.every(action=>g.actions.includes(action));
 });
}
export function canQuickCreate(context:ApiSchemas['Context']|null,kind:QuickCreateKind,schoolId:string,classId?:string){return canNativeFormAction(context,schoolId,actions[kind],kind==='student'?classId:undefined);}
