import {Problem,validation} from '../../common/problem';
import type {Row} from '../../database/database';

/** The request is a Monday; the returned calendar is clipped to the granted year. */
export function timetableWeekBounds(link:Row,week:unknown){
 if(typeof week!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(week))validation('week','Tuần cần theo dạng YYYY-MM-DD');
 const date=new Date(week+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==week||date.getUTCDay()!==1)validation('week','Cần chọn ngày thứ Hai đầu tuần');
 const yearStart=String(link.year_starts_on),yearEnd=String(link.year_ends_on);date.setUTCDate(date.getUTCDate()+7);
 const first=week>yearStart?week:yearStart,last=date.toISOString().slice(0,10)<yearEnd?date.toISOString().slice(0,10):yearEnd;
 if(first>=last)validation('week','Tuần không thuộc năm học được cấp');return {week,first,last};
}
export function assertTimetableWeekSize(value:unknown){
 if(!value||typeof value!=='object'||!('days' in value)||!Array.isArray(value.days))throw new Problem(500,'PARENT_TIMETABLE_SOURCE_INVALID');
 const count=value.days.reduce((sum,day)=>sum+(day&&typeof day==='object'&&Array.isArray(day.lessons)?day.lessons.length:0),0);
 if(count>1000)throw new Problem(422,'PARENT_WEEK_TOO_LARGE');
}
