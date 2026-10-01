import test from 'node:test';
import assert from 'node:assert/strict';
import {attendanceMonthBounds,parentAttendanceMonth} from '../../dist/modules/parents/attendance-month.js';
const link={year_starts_on:'2026-09-01',year_ends_on:'2027-06-01',today:'2026-10-05'};
const calendar=()=>Array.from({length:31},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,holidayNames:i===0?['Ngày nghỉ đã công bố']:[]}));
const record=(status,slotLabel='Sáng',date='2026-10-02')=>({date,slotLabel,status,publishedAt:'2026-10-02T12:00:00Z'});
test('parent month keeps actual sessions, mixed days and unmarked outside the attendance denominator',()=>{
 const result=parentAttendanceMonth(link,'2026-10',calendar(),[record('PRESENT'),record('LATE','Chiều'),record('UNMARKED','Sáng','2026-10-03')]);
 assert.deepEqual(result.totals,{present:1,late:1,excused:0,unexcused:0,unmarked:1,published:3,marked:2});assert.equal(result.days[1].status,'mixed');assert.equal(result.days[1].sessions.length,2);assert.equal(result.days[2].status,'unmarked');assert.equal(result.yearEnd,'2027-05');
});
test('parent month infers neither Sunday holidays nor missing-day presence and preserves actual published holiday names',()=>{
 const result=parentAttendanceMonth(link,'2026-10',calendar(),[]);assert.equal(result.days[0].status,'holiday');assert.deepEqual(result.days[0].holidayNames,['Ngày nghỉ đã công bố']);assert.equal(result.days[3].weekday,7);assert.equal(result.days[3].status,'not_published');assert.equal(result.days[5].status,'future');assert.equal(result.totals.marked,0);
});
test('parent month clips only to real exclusive year bounds and rejects malformed/outside-year selection',()=>{
 assert.deepEqual(attendanceMonthBounds({...link,year_starts_on:'2026-10-15'},'2026-10'),{month:'2026-10',from:'2026-10-15',to:'2026-11-01'});assert.deepEqual(attendanceMonthBounds({...link,year_ends_on:'2026-10-20'},'2026-10'),{month:'2026-10',from:'2026-10-01',to:'2026-10-20'});
 for(const month of [undefined,'2026-00','2026-13','2026-1','2026-08','2027-06'])assert.throws(()=>attendanceMonthBounds(link,month));
});
test('parent month rejects missing calendar days, shifted date sources, unknown statuses and foreign date rows',()=>{
 for(const [days,rows] of [[calendar().slice(1),[]],[calendar().map((d,i)=>i===0?{...d,date:'2026-10-02'}:d),[]],[calendar(),[record('invented')]],[calendar(),[record('PRESENT','Sáng','2026-09-30')]]])assert.throws(()=>parentAttendanceMonth(link,'2026-10',days,rows));
});
