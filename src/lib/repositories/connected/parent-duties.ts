import type {ApiSchemas} from '../../api/generated';
import type {nativeParentContext} from './parent-context';
import {RepoError} from '../errors';

type Context=ReturnType<typeof nativeParentContext>['display'];
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ lịch trực nhật của con.');
function allowed(value:object,keys:string[]){if(!value||Object.keys(value).some(key=>!keys.includes(key)))throw invalid();}
/** No group lookup, invented source ID or inferred completion from a past date. */
export function nativeParentDuties(value:ApiSchemas['ParentDutySchedule'],context:Context){
 allowed(value,['today','year','items']);allowed(value.year,['startsOn','endsOn']);
 if(value.today!==context.today||value.year.startsOn!==context.year.startsOn||value.year.endsOn!==context.year.endsOn||!Array.isArray(value.items)||value.items.length>5000)throw invalid();
 const items=value.items.map(item=>{
  allowed(item,['date','task','status','publishedAt']);
  if(typeof item.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!Number.isFinite(Date.parse(item.date+'T00:00:00Z'))||new Date(item.date+'T00:00:00Z').toISOString().slice(0,10)!==item.date||item.date<context.year.startsOn||item.date>=context.year.endsOn||typeof item.task!=='string'||!item.task.trim()||!['ASSIGNED','DONE','CANCELLED'].includes(item.status)||typeof item.publishedAt!=='string'||!Number.isFinite(Date.parse(item.publishedAt)))throw invalid();
  return {date:item.date,task:item.task,status:item.status,publishedAt:item.publishedAt,upcoming:item.date>=value.today};
 });
 return items.sort((a,b)=>a.date.localeCompare(b.date)||a.publishedAt.localeCompare(b.publishedAt));
}
