import type {ApiSchemas} from '../../api/generated';
import type {nativeParentContext} from './parent-context';
import {nativeParentTeachers} from './parent-teachers';
import {nativeParentConduct} from './parent-conduct';
import {nativeParentTimetable,parentWeekStart} from './parent-timetable';
import {nativeParentDuties} from './parent-duties';
import {nativeParentActivities,nativeParentAnnouncements} from './parent-shared';
import {dateDays} from '../../api/dates';
import {RepoError} from '../errors';
type Context=ReturnType<typeof nativeParentContext>['display'];
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ thông tin đã công bố của con.');
function allowed(value:object,keys:string[]){if(!value||Object.keys(value).some(key=>!keys.includes(key)))throw invalid();}
function timestamp(value:unknown){if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw invalid();return value;}
function count(value:unknown){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>1000)throw invalid();return value;}
function attendanceWeek(value:ApiSchemas['ParentOverviewAttendanceWeek'],context:Context){
 allowed(value,['granularity','weekStart','startsOn','endsOn','totals','records']);allowed(value.totals,['present','late','excused','unexcused','unmarked','published','marked']);
 const monday=parentWeekStart(context.today),first=monday>context.year.startsOn?monday:context.year.startsOn,last=dateDays(monday,7)<context.year.endsOn?dateDays(monday,7):context.year.endsOn;
 if(value.granularity!=='DAILY'||value.weekStart!==monday||value.startsOn!==first||value.endsOn!==last||first>=last||!Array.isArray(value.records)||value.records.length>1000)throw invalid();
 const actual={present:0,late:0,excused:0,unexcused:0,unmarked:0,published:value.records.length,marked:0};
 for(const record of value.records){
  allowed(record,['date','slotLabel','status','publicNote','publishedAt']);try{dateDays(record.date,0);}catch{throw invalid();}
  if(record.date<first||record.date>=last||record.date>context.today||typeof record.slotLabel!=='string'||!record.slotLabel.trim()||!['PRESENT','LATE','EXCUSED','UNEXCUSED','UNMARKED'].includes(record.status)||record.publicNote!==undefined&&typeof record.publicNote!=='string')throw invalid();timestamp(record.publishedAt);
  actual[record.status.toLowerCase() as 'present'|'late'|'excused'|'unexcused'|'unmarked']++;if(record.status!=='UNMARKED')actual.marked++;
 }
 for(const key of Object.keys(actual) as Array<keyof typeof actual>)if(count(value.totals[key])!==actual[key])throw invalid();
 return {monday,startsOn:first,endsOn:last,...actual};
}
export function nativeParentOverview(value:ApiSchemas['ParentPublishedOverview'],context:Context){
 allowed(value,['today','year','asOf','teachers','attendanceWeek','conduct','timetable','duties','activities','announcements']);allowed(value.year,['startsOn','endsOn']);
 if(!context.overviewAllowed||value.today!==context.today||value.year.startsOn!==context.year.startsOn||value.year.endsOn!==context.year.endsOn)throw invalid();timestamp(value.asOf);
 const inYear=context.today>=context.year.startsOn&&context.today<context.year.endsOn;
 const panels=[['teachers',value.teachers],['attendance',value.attendanceWeek],['conduct',value.conduct],['timetable',value.timetable],['duties',value.duties],['activities',value.activities],['announcements',value.announcements]] as const;
 for(const [module,panel]of panels){if(!context.modules.includes(module)&&panel!==null)throw invalid();if(context.modules.includes(module)&&['teachers','duties','activities','announcements'].includes(module)&&panel===null)throw invalid();}
 if((value.attendanceWeek!==null||value.timetable!==null)&&!inYear||inYear&&context.modules.includes('attendance')&&value.attendanceWeek===null||inYear&&context.modules.includes('timetable')&&value.timetable===null)throw invalid();
 const teachers=value.teachers===null?null:nativeParentTeachers(value.teachers,context),teacher=teachers?.homeroom?{...teachers.homeroom,role:`Giáo viên chủ nhiệm lớp ${teachers.homeroom.className}`,contactHours:teachers.contactHours}:null;
 const conduct=value.conduct===null?null:nativeParentConduct(value.conduct,context),attendance=value.attendanceWeek===null?null:attendanceWeek(value.attendanceWeek,context),timetable=value.timetable===null?null:nativeParentTimetable(value.timetable,context,parentWeekStart(context.today)),todayDay=timetable?.days.find(day=>day.date===context.today);
 const duties=value.duties===null?[]:nativeParentDuties(value.duties,context);if(duties.length>2||duties.some(item=>!item.upcoming||item.status!=='ASSIGNED'))throw invalid();
 const activities=value.activities===null?[]:nativeParentActivities(value.activities,context),announcements=value.announcements===null?[]:nativeParentAnnouncements(value.announcements,context);if(activities.length>3||announcements.length>3)throw invalid();
 return {modules:context.modules,today:context.today,asOf:value.asOf,teacher,attendanceWeek:attendance,conduct,todayLessons:todayDay?.lessons??[],todayHolidayNames:todayDay?.holidayNames??[],duties,activities:activities.map(item=>({id:item.id,title:item.title,dueDate:item.dueDate,status:item.submission})),announcements:announcements.map(item=>({id:item.id,title:item.title,summary:item.summary,publishedAt:item.publishedAt}))};
}
