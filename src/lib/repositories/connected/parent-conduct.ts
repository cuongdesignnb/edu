import type {ApiSchemas} from '../../api/generated';
import type {nativeParentContext} from './parent-context';
import {dateDays} from '../../api/dates';
import {RepoError} from '../errors';
type Context=ReturnType<typeof nativeParentContext>['display'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ kết quả thi đua đã công bố cho con.');
function allowed(value:object,keys:string[]){if(!value||Object.keys(value).some(key=>!keys.includes(key)))throw invalid();}
function text(value:unknown){if(typeof value!=='string'||!value.trim())throw invalid();return value;}
function nullable(value:unknown){if(value===null)return null;return text(value);}
function points(value:unknown){if(typeof value!=='string'||! /^-?\d{1,8}(\.\d{1,2})?$/.test(value)||!Number.isFinite(Number(value)))throw invalid();return value;}
function timestamp(value:unknown){const time=text(value);if(!Number.isFinite(Date.parse(time)))throw invalid();return time;}
function number(value:unknown){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1)throw invalid();return value;}
function date(value:unknown){const result=text(value);try{dateDays(result,0);}catch{throw invalid();}return result;}
function dateAt(at:string,timezone:string){try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at)),part=(name:string)=>parts.find(part=>part.type===name)?.value;return `${part('year')}-${part('month')}-${part('day')}`;}catch{throw invalid();}}
export function nativeParentConduct(value:ApiSchemas['ParentSharedConduct'],context:Context,id?:string){
 allowed(value,['periodId','periodLabel','revision','basePoints','bonusPoints','penaltyPoints','finalPoints','classification','lines','publishedAt','adjusted','weekNumber','startsOn','endsOn','classLabel','ruleSetName','ruleSetRevision','minimumPoints','maximumPoints','timezone','history']);
 if(!context.modules.includes('conduct')||!uuid.test(text(value.periodId))||id&&value.periodId!==id||typeof value.adjusted!=='boolean'||!Array.isArray(value.lines)||value.lines.length>1000||!Array.isArray(value.history)||!value.history.length||value.history.length>1000)throw invalid();
 const total=points(value.finalPoints),base=points(value.basePoints),plus=points(value.bonusPoints),minus=points(value.penaltyPoints),grade=nullable(value.classification),revision=number(value.revision),publishedAt=timestamp(value.publishedAt),zone=text(value.timezone),minimum=value.minimumPoints===null?null:points(value.minimumPoints),maximum=value.maximumPoints===null?null:points(value.maximumPoints);
 if(Number(plus)<0||Number(minus)>0||minimum!==null&&Number(total)<Number(minimum)||maximum!==null&&Number(total)>Number(maximum)||minimum!==null&&maximum!==null&&Number(minimum)>Number(maximum))throw invalid();
 const start=value.startsOn===null?null:date(value.startsOn),end=value.endsOn===null?null:date(value.endsOn);
 if((start===null)!==(end===null)||start&&end&&(start>=end||start<context.year.startsOn||end>context.year.endsOn))throw invalid();
 const items=value.lines.map(line=>{
  allowed(line,['label','delta','occurredAt','reason','date']);if(typeof line.reason!=='string')throw invalid();const occurredAt=timestamp(line.occurredAt),day=date(line.date);if(dateAt(occurredAt,zone)!==day||start&&end&&(day<start||day>=end))throw invalid();
  return {label:text(line.label),points:points(line.delta),date:day,reason:line.reason};
 });
 // Validate the timezone even for a publication with no lines.
 dateAt(publishedAt,zone);
 const history=value.history.map(item=>{allowed(item,['revision','publishedAt','total','classification','current']);if(typeof item.current!=='boolean')throw invalid();return {versionNo:number(item.revision),publishedAt:timestamp(item.publishedAt),total:points(item.total),grade:nullable(item.classification),current:item.current};});
 if(new Set(history.map(item=>item.versionNo)).size!==history.length||history.some((item,n)=>n>0&&item.versionNo<=history[n-1].versionNo))throw invalid();
 const current=history.filter(item=>item.current);if(current.length!==1||current[0].versionNo!==revision||current[0].total!==total||current[0].grade!==grade||Date.parse(current[0].publishedAt)!==Date.parse(publishedAt))throw invalid();
 return {periodId:value.periodId,periodLabel:text(value.periodLabel),weekIndex:value.weekNumber===null?null:number(value.weekNumber),startDate:start,endDate:end?dateDays(end,-1):null,versionNo:revision,publishedAt,className:nullable(value.classLabel),ruleSetName:nullable(value.ruleSetName),ruleSetVersionNo:value.ruleSetRevision===null?null:number(value.ruleSetRevision),minimum,maximum,base,plus,minus,total,grade,gradeTone:'neutral' as const,items,history,adjusted:value.adjusted,adjustmentNote:value.adjusted?'Kết quả đã được nhà trường điều chỉnh và công bố lại.':null};
}
export function nativeParentConductDirectory(value:ApiSchemas['ParentSharedConductDirectory'],context:Context){
 allowed(value,['items']);if(!context.modules.includes('conduct')||!Array.isArray(value.items)||value.items.length>1000)throw invalid();const items=value.items.map(item=>nativeParentConduct(item,context));if(new Set(items.map(item=>item.periodId)).size!==items.length)throw invalid();return items;
}
