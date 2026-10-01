import type {ApiSchemas} from '../../api/generated';
import {dateDays} from '../../api/dates';
import {RepoError} from '../errors';
import type {nativeParentContext} from './parent-context';

type Context=ReturnType<typeof nativeParentContext>['display'];
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ tháng chuyên cần của con.');
function allowed(value:object,fields:string[]){if(!value||Object.keys(value).some(key=>!fields.includes(key)))throw invalid();}
/** Only actual published sessions/calendar facts enter display; all counts are checked. */
export function nativeParentAttendance(value:ApiSchemas['ParentAttendanceMonth'],context:Context,month:string){
 allowed(value,['granularity','month','yearStart','yearEnd','today','days','totals']);
 if(value.granularity!=='DAILY'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||value.month!==month||value.yearStart!==context.year.startsOn.slice(0,7)||value.yearEnd!==dateDays(context.year.endsOn,-1).slice(0,7)||value.today!==context.today||!Array.isArray(value.days))throw invalid();
 const first=month+'-01',next=new Date(`${first}T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);
 const from=first>context.year.startsOn?first:context.year.startsOn,to=next.toISOString().slice(0,10)<context.year.endsOn?next.toISOString().slice(0,10):context.year.endsOn;
 if(from>=to||value.days.length!==(Date.parse(to)-Date.parse(from))/86400000)throw invalid();
 const totals={present:0,late:0,excused:0,unexcused:0,unmarked:0,published:0,marked:0},statuses=['UNMARKED','PRESENT','LATE','EXCUSED','UNEXCUSED'];
 const days=value.days.map((item,index)=>{
  allowed(item,['date','weekday','holidayNames','sessions','status']);
  if(item.date!==dateDays(from,index)||item.weekday!==(new Date(`${item.date}T00:00:00Z`).getUTCDay()+6)%7+1||!Array.isArray(item.holidayNames)||item.holidayNames.some(label=>typeof label!=='string'||!label)||!Array.isArray(item.sessions))throw invalid();
  const sessions=item.sessions.map(record=>{
   allowed(record,['date','slotLabel','status','publicNote','publishedAt']);
   if(record.date!==item.date||typeof record.slotLabel!=='string'||!record.slotLabel||!statuses.includes(record.status)||typeof record.publishedAt!=='string'||!Number.isFinite(Date.parse(record.publishedAt))||record.publicNote!==undefined&&typeof record.publicNote!=='string')throw invalid();
   totals.published++;totals[record.status.toLowerCase() as 'present'|'late'|'excused'|'unexcused'|'unmarked']++;if(record.status!=='UNMARKED')totals.marked++;
   return {date:record.date,slotLabel:record.slotLabel,status:record.status,publicNote:record.publicNote,publishedAt:record.publishedAt};
  });
  const actual=new Set(sessions.map(session=>session.status.toLowerCase())),status=sessions.length?actual.size===1?[...actual][0]:'mixed':item.date>context.today?'future':item.holidayNames.length?'holiday':'not_published';
  if(item.status!==status)throw invalid();return {date:item.date,weekday:item.weekday,holidayNames:[...item.holidayNames],sessions,status:item.status};
 });
 allowed(value.totals,Object.keys(totals));if(Object.entries(totals).some(([key,count])=>value.totals[key as keyof typeof totals]!==count))throw invalid();
 // Preserve the existing attendance navigation through the current school month.
 const last=dateDays(context.year.endsOn,-1),navigationEnd=(context.today<last?context.today:last).slice(0,7);
 return {month,yearStart:value.yearStart,yearEnd:navigationEnd,today:context.today,days,totals};
}
