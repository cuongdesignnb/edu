import type {ApiSchemas} from '../../api/generated';
import type {nativeParentContext} from './parent-context';
import {dateDays} from '../../api/dates';
import {RepoError} from '../errors';

type Context=ReturnType<typeof nativeParentContext>['display'];
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ thời khóa biểu của con.');
function allowed(value:object,keys:string[]){if(!value||Object.keys(value).some(key=>!keys.includes(key)))throw invalid();}
function text(value:unknown){if(typeof value!=='string'||!value.trim())throw invalid();return value;}
function nullable(value:unknown){return value===null?undefined:text(value);}
export function parentWeekStart(date:string){const checked=dateDays(date,0),weekday=(new Date(checked+'T00:00:00Z').getUTCDay()+6)%7;return dateDays(checked,-weekday);}
/** Local labels are verified against the school's timezone, never the host clock. */
export function nativeParentTimetable(value:ApiSchemas['ParentTimetableWeek'],context:Context,week:string){
 allowed(value,['weekStart','today','timezone','year','weekNumber','days']);allowed(value.year,['startsOn','endsOn']);
 if(parentWeekStart(week)!==week||value.weekStart!==week||value.today!==context.today||value.year.startsOn!==context.year.startsOn||value.year.endsOn!==context.year.endsOn||value.weekNumber!==null&&(!Number.isInteger(value.weekNumber)||value.weekNumber<1)||!Array.isArray(value.days)||typeof value.timezone!=='string')throw invalid();
 let formatter:Intl.DateTimeFormat;
 try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:value.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}catch{throw invalid();}
 const local=(date:number)=>{const parts=formatter.formatToParts(new Date(date)),part=(type:string)=>parts.find(value=>value.type===type)?.value;return {date:`${part('year')}-${part('month')}-${part('day')}`,time:`${part('hour')}:${part('minute')}`};};
 const first=week>context.year.startsOn?week:context.year.startsOn,last=dateDays(week,7)<context.year.endsOn?dateDays(week,7):context.year.endsOn;
 if(first>=last||value.days.length!==(Date.parse(last)-Date.parse(first))/86400000)throw invalid();let count=0;
 const days=value.days.map((day,index)=>{
  allowed(day,['date','holidayNames','lessons']);if(day.date!==dateDays(first,index)||!Array.isArray(day.holidayNames)||day.holidayNames.some(name=>typeof name!=='string'||!name.trim())||!Array.isArray(day.lessons))throw invalid();
  const lessons=day.lessons.map(item=>{
   allowed(item,['date','startsAt','endsAt','startsAtLocal','endsAtLocal','periodNumber','subjectName','teacherName','roomName','status','changeNote']);
   const start=typeof item.startsAt==='string'?Date.parse(item.startsAt):NaN,end=typeof item.endsAt==='string'?Date.parse(item.endsAt):NaN;
   if(++count>1000||item.date!==day.date||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!['SCHEDULED','CANCELLED'].includes(item.status)||item.periodNumber!==null&&(!Number.isInteger(item.periodNumber)||item.periodNumber<1))throw invalid();
   const begins=local(start),ends=local(end);if(begins.date!==day.date||ends.date!==day.date||item.startsAtLocal!==begins.time||item.endsAtLocal!==ends.time)throw invalid();
   return {period:item.periodNumber,start:item.startsAtLocal,end:item.endsAtLocal,subject:text(item.subjectName),teacher:text(item.teacherName),room:nullable(item.roomName),cancelled:item.status==='CANCELLED',changed:nullable(item.changeNote),startsAt:item.startsAt};
  }).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
  return {date:day.date,holidayNames:[...day.holidayNames],holiday:day.holidayNames.length?day.holidayNames.join(' · '):undefined,lessons};
 });
 return {weekStart:week,week:value.weekNumber??undefined,today:value.today,yearStart:context.year.startsOn,yearEnd:dateDays(context.year.endsOn,-1),days};
}
