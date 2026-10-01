import type {ApiSchemas} from '../../api/generated';
import type {nativeParentContext} from './parent-context';
import {RepoError} from '../errors';

type Context=ReturnType<typeof nativeParentContext>['display'];
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ giáo viên phụ trách của con.');
function allowed(value:object,keys:string[]){if(!value||Object.keys(value).some(key=>!keys.includes(key)))throw invalid();}
function nullableText(value:unknown){if(value===null)return undefined;if(typeof value!=='string'||!value.trim())throw invalid();return value;}
/** Purpose metadata is already scoped; internal staff/identity fields never enter display. */
export function nativeParentTeachers(value:ApiSchemas['ParentTeacherDirectory'],context:Context){
 allowed(value,['today','classLabel','contactHours','teachers']);
 const className=nullableText(value.classLabel),contactHours=nullableText(value.contactHours);
 if(value.today!==context.today||className!==undefined&&className!==context.className||!Array.isArray(value.teachers)||value.teachers.length>1000||!className&&value.teachers.length)throw invalid();
 const teachers=value.teachers.map(item=>{
  allowed(item,['kind','displayName','subjectName','workEmail','workPhone','weekdays']);
  if(!['HOMEROOM','SUBJECT'].includes(item.kind)||typeof item.displayName!=='string'||!item.displayName.trim()||!Array.isArray(item.weekdays)||item.weekdays.length>7||item.weekdays.some((day,index)=>!Number.isInteger(day)||day<1||day>7||index>0&&item.weekdays[index-1]>=day))throw invalid();
  const subject=nullableText(item.subjectName),phone=nullableText(item.workPhone),email=nullableText(item.workEmail);
  if(item.kind==='SUBJECT'&&!subject||item.kind==='HOMEROOM'&&(subject||item.weekdays.length))throw invalid();
  return {kind:item.kind,name:item.displayName,subject,phone,email,days:item.weekdays.map(day=>day===7?'CN':`Thứ ${day+1}`).join(', ')};
 });
 const homeroom=teachers.filter(item=>item.kind==='HOMEROOM');if(homeroom.length>1)throw invalid();
 return {homeroom:homeroom.length?{name:homeroom[0].name,tone:'blue' as const,className:className!,phone:homeroom[0].phone,email:homeroom[0].email}:null,
  subjects:teachers.filter(item=>item.kind==='SUBJECT').map(item=>({name:item.name,subject:item.subject!,phone:item.phone,email:item.email,days:item.days,subjectColor:undefined as string|undefined})),
  school:{name:context.school.name,address:context.school.address,publicPhone:context.school.publicPhone,publicEmail:context.school.publicEmail},contactHours};
}
