import test from 'node:test';
import assert from 'node:assert/strict';
import {timetableWeekBounds,assertTimetableWeekSize} from '../../dist/modules/parents/timetable-week.js';
const year={year_starts_on:'2026-09-01',year_ends_on:'2027-06-01'};
test('parent weekly timetable uses real Monday/calendar bounds and clips partial academic weeks',()=>{
 assert.deepEqual(timetableWeekBounds(year,'2026-08-31'),{week:'2026-08-31',first:'2026-09-01',last:'2026-09-07'});
 assert.deepEqual(timetableWeekBounds(year,'2027-05-31'),{week:'2027-05-31',first:'2027-05-31',last:'2027-06-01'});
 assert.deepEqual(timetableWeekBounds(year,'2026-10-05'),{week:'2026-10-05',first:'2026-10-05',last:'2026-10-12'});
 for(const week of [undefined,'2026-10-06','2027-02-30','2026-08-24','2027-06-07','2026-10-05T00:00:00Z'])assert.throws(()=>timetableWeekBounds(year,week),error=>error.status===422);
});
test('parent weekly timetable rejects a source exceeding the total bound before response serialization',()=>{
 assert.doesNotThrow(()=>assertTimetableWeekSize({days:[{lessons:Array.from({length:600},()=>({}))},{lessons:Array.from({length:400},()=>({}))}]}));
 assert.throws(()=>assertTimetableWeekSize({days:[{lessons:Array.from({length:600},()=>({}))},{lessons:Array.from({length:401},()=>({}))}]}),error=>error.status===422&&error.code==='PARENT_WEEK_TOO_LARGE');
 assert.throws(()=>assertTimetableWeekSize(null),error=>error.status===500&&error.code==='PARENT_TIMETABLE_SOURCE_INVALID');
});
