import {iso,one,type Transaction,type Row} from '../../database/database';
import {validateSchema} from '../../common/contract';
import {Problem} from '../../common/problem';
import {parentConductDisplay} from './conduct-display';
import {parentSharedContent} from './shared-content';
import {assertTimetableWeekSize} from './timetable-week';
import type {ParentPrincipal} from './parent.service';

function day(value:string,offset=0){const date=new Date(value+'T00:00:00Z');if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Problem(500,'PARENT_DATE_SOURCE_INVALID');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10);}
function monday(value:string){return day(value,-((new Date(value+'T00:00:00Z').getUTCDay()+6)%7));}
export async function parentOverviewDisplay(tx:Transaction,p:ParentPrincipal){
 const today=String(p.link.today),year={startsOn:iso(p.link.year_starts_on as Date),endsOn:iso(p.link.year_ends_on as Date)},sections=p.link.allowed_sections as string[],allowed=(section:string)=>sections.includes(section),args=[p.schoolId,p.studentId,p.yearId];
 const checks=(await tx.query<{section:string;allowed:boolean}>("SELECT section,app.parent_can_read($1,$2,$3,section) AS allowed FROM unnest($4::text[]) section",[...args,sections])).rows;
 if(!allowed('overview')||!checks.find(item=>item.section==='overview')?.allowed)throw new Problem(403,'PARENT_SECTION_DENIED');
 if(checks.some(item=>!item.allowed))throw new Problem(403,'PARENT_SECTION_DENIED');
 const weekStart=monday(today),startsOn=weekStart>year.startsOn?weekStart:year.startsOn,endsOn=day(weekStart,7)<year.endsOn?day(weekStart,7):year.endsOn,inYear=startsOn<endsOn&&today>=year.startsOn&&today<year.endsOn;
 let attendanceWeek:Row|null=null;
 if(allowed('attendance')&&inYear){
  const rows=(await tx.query<Row>(`SELECT i.payload,app.parent_publication_time(i.school_id,i.student_id,i.year_id,i.section,i.publication_id) AS published_at
   FROM app.parent_publication_items i WHERE i.school_id=$1 AND i.student_id=$2 AND i.year_id=$3 AND i.section='attendance'
    AND i.payload->>'date'>=$4 AND i.payload->>'date'<$5 AND i.payload->>'date'<=$6
    AND app.parent_attendance_is_daily(i.school_id,i.student_id,i.year_id,i.publication_id)
    AND app.parent_dated_item_visible(i.school_id,i.student_id,i.year_id,i.section,i.publication_id,(i.payload->>'date')::date)
   ORDER BY i.payload->>'date',i.payload->>'slotLabel',i.id LIMIT 1001`,[...args,startsOn,endsOn,today])).rows;
  if(rows.length>1000)throw new Problem(422,'PARENT_WEEK_TOO_LARGE');
  const records=rows.map(row=>{const value:Row={...row.payload as Row,publishedAt:iso(row.published_at as Date)};validateSchema('ParentAttendance',value,true);return value;});
  const totals={present:0,late:0,excused:0,unexcused:0,unmarked:0,published:records.length,marked:0};
  for(const record of records){totals[String(record.status).toLowerCase() as 'present'|'late'|'excused'|'unexcused'|'unmarked']++;if(record.status!=='UNMARKED')totals.marked++;}
  attendanceWeek={granularity:'DAILY',weekStart,startsOn,endsOn,totals,records};validateSchema('ParentOverviewAttendanceWeek',attendanceWeek,true);
 }
 let teachers:Row|null=null,timetable:Row|null=null,duties:Row|null=null;
 if(allowed('teachers')){teachers=(await one<{directory:Row|null}>(tx,'SELECT app.parent_teacher_directory($1,$2,$3) AS directory',args))!.directory;if(!teachers)throw new Problem(401,'PARENT_ACCESS_INVALID');validateSchema('ParentTeacherDirectory',teachers,true);}
 if(allowed('timetable')&&inYear){timetable=(await one<{week:Row|null}>(tx,'SELECT app.parent_timetable_week($1,$2,$3,$4) AS week',[...args,weekStart]))!.week;if(!timetable)throw new Problem(401,'PARENT_ACCESS_INVALID');assertTimetableWeekSize(timetable);validateSchema('ParentTimetableWeek',timetable,true);}
 if(allowed('duties')){
  const rows=(await tx.query<Row>(`SELECT j.item AS payload,app.parent_publication_time(i.school_id,i.student_id,i.year_id,i.section,i.publication_id) AS published_at
   FROM app.parent_publication_items i CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.payload->'items')='array' THEN i.payload->'items' ELSE jsonb_build_array(i.payload) END) WITH ORDINALITY j(item,ordinal)
   WHERE i.school_id=$1 AND i.student_id=$2 AND i.year_id=$3 AND i.section='duties' AND j.item->>'date'>=$4 AND j.item->>'status'='ASSIGNED'
    AND app.parent_dated_item_visible(i.school_id,i.student_id,i.year_id,i.section,i.publication_id,(j.item->>'date')::date)
   ORDER BY j.item->>'date',i.created_at,i.id,j.ordinal LIMIT 2`,[...args,today])).rows;
  duties={today,year,items:rows.map(row=>({...row.payload as Row,publishedAt:iso(row.published_at as Date)}))};validateSchema('ParentDutySchedule',duties,true);
 }
 const latest=allowed('conduct')?await parentConductDisplay(tx,p,undefined,true):null;
 const conduct=Array.isArray(latest)&&latest.length?latest[0]:null;
 const activities=allowed('activities')?{items:await parentSharedContent(tx,p,'activities',undefined,3)}:null;
 const announcements=allowed('announcements')?{items:await parentSharedContent(tx,p,'announcements',undefined,3)}:null;
 const asOf=(await one<{at:Date}>(tx,'SELECT now() AS at'))!.at.toISOString(),value={today,year,asOf,teachers,attendanceWeek,conduct,timetable,duties,activities,announcements};
 validateSchema('ParentPublishedOverview',value,true);return value;
}
