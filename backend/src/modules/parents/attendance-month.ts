import {Problem,validation} from '../../common/problem';
import type {Row} from '../../database/database';

interface Attendance {date:string;slotLabel:string;status:string;publicNote?:string;publishedAt:string}
interface CalendarDay {date:string;holidayNames:string[]}
const day=(value:string,days=0)=>{const d=new Date(`${value}T00:00:00Z`);if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new Problem(500,'PARENT_DATE_SOURCE_INVALID');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
export function attendanceMonthBounds(link:Row,month:unknown){
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))validation('month','Tháng cần theo dạng YYYY-MM');
 const first=month+'-01',next=new Date(`${first}T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);
 const from=first>String(link.year_starts_on)?first:String(link.year_starts_on),to=next.toISOString().slice(0,10)<String(link.year_ends_on)?next.toISOString().slice(0,10):String(link.year_ends_on);
 if(from>=to)validation('month','Tháng không thuộc năm học được cấp');return {month,from,to};
}
/** Missing days remain unpublished; no inferred presence, absence or holiday. */
export function parentAttendanceMonth(link:Row,month:string,calendar:CalendarDay[],records:Attendance[]){
 const bounds=attendanceMonthBounds(link,month),today=String(link.today),statuses=['UNMARKED','PRESENT','LATE','EXCUSED','UNEXCUSED'];
 if(calendar.length!==Math.round((Date.parse(bounds.to)-Date.parse(bounds.from))/86400000)||calendar.some((value,index)=>value.date!==day(bounds.from,index)||!Array.isArray(value.holidayNames)||value.holidayNames.some(name=>typeof name!=='string'))||records.some(value=>value.date<bounds.from||value.date>=bounds.to||!statuses.includes(value.status)||typeof value.slotLabel!=='string'||!value.slotLabel||!Number.isFinite(Date.parse(value.publishedAt))))throw new Problem(500,'PARENT_ATTENDANCE_SOURCE_INVALID');
 const totals={present:0,late:0,excused:0,unexcused:0,unmarked:0,published:records.length,marked:0};
 for(const value of records){totals[value.status.toLowerCase() as 'present'|'late'|'excused'|'unexcused'|'unmarked']++;if(value.status!=='UNMARKED')totals.marked++;}
 const days=calendar.map(value=>{const sessions=records.filter(record=>record.date===value.date).sort((a,b)=>a.slotLabel.localeCompare(b.slotLabel,'vi')||a.publishedAt.localeCompare(b.publishedAt));const actual=new Set(sessions.map(record=>record.status.toLowerCase()));return {...value,weekday:(new Date(`${value.date}T00:00:00Z`).getUTCDay()+6)%7+1,sessions,status:sessions.length?actual.size===1?[...actual][0]:'mixed':value.date>today?'future':value.holidayNames.length?'holiday':'not_published'};});
 return {granularity:'DAILY' as const,month,yearStart:String(link.year_starts_on).slice(0,7),yearEnd:day(String(link.year_ends_on),-1).slice(0,7),today,days,totals};
}
