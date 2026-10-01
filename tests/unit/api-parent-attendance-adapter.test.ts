import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedParentRepo as repo} from '@/lib/repositories/connected/parent';
import {nativeParentAttendance} from '@/lib/repositories/connected/parent-attendance';
import {nativeParentContext} from '@/lib/repositories/connected/parent-context';
import {beginParentExchange,clearParentSession,readParentView} from '@/lib/api/parent-session';
import {authenticationChanged,authorizationChanged,captureStaffAccess} from '@/lib/api/client';
import type {ApiSchemas} from '@/lib/api/generated';
import type {Ctx} from '@/lib/repositories/core';
const slug='parent-month-api',viewId='64000000-0000-4000-8000-000000000001',other='64000000-0000-4000-8000-000000000002',schoolId='64000000-0000-4000-8000-000000000003',accessId='64000000-0000-4000-8000-000000000004';
const context=():ApiSchemas['ParentContext']=>({viewId,school:{name:'Trường API',slug,publicContactPhone:null,shortName:null,motto:null,publicContactEmail:null,publicAddress:null},student:{displayName:'Con API',classLabel:'6A',schoolYearLabel:'2026–2027'},allowedSections:['attendance'],allowDownload:false,csrfToken:'private-parent-csrf',expiresAt:'2026-10-05T08:00:00Z',today:'2026-10-05',year:{label:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01'},relationshipLabel:'Mẹ',linkExpiresAt:'2026-11-01T00:00:00Z',lastPublishedAt:null});
const record=(status:ApiSchemas['ParentAttendance']['status'],slotLabel='Sáng',date='2026-10-02'):ApiSchemas['ParentAttendance']=>({status,slotLabel,date,publishedAt:'2026-10-03T00:00:00Z'});
const month=():ApiSchemas['ParentAttendanceMonth']=>({granularity:'DAILY',month:'2026-10',yearStart:'2026-09',yearEnd:'2027-05',today:'2026-10-05',totals:{present:1,late:1,excused:0,unexcused:0,unmarked:1,published:3,marked:2},days:Array.from({length:31},(_,i)=>{const date=`2026-10-${String(i+1).padStart(2,'0')}`;return {date,weekday:(new Date(date+'T00:00:00Z').getUTCDay()+6)%7+1,holidayNames:i===0?['Ngày nghỉ công bố']:[],sessions:i===1?[record('PRESENT'),record('LATE','Chiều')]:i===2?[record('UNMARKED','Sáng',date)]:[],status:i===0?'holiday':i===1?'mixed':i===2?'unmarked':i>=5?'future':'not_published'};})});
const response=(data:unknown)=>new Response(JSON.stringify({data,requestId:'parent-month-controlled-unit'}),{status:200,headers:{'Content-Type':'application/json'}});
let pendingResolve:(value:Response)=>void;
beforeEach(()=>{clearParentSession();authenticationChanged();});afterEach(()=>{clearParentSession();vi.unstubAllGlobals();});
const adopt=(id=viewId)=>beginParentExchange().adopt(slug,id,'owned-parent-csrf');
describe('Native parent month projection and public/staff ownership',()=>{
 it('preserves all actual sessions and unmarked counts, missing Sundays and existing current-month navigation',()=>{
  const result=nativeParentAttendance(month(),nativeParentContext(context(),slug).display,'2026-10');expect(result).toMatchObject({yearEnd:'2026-10',totals:{present:1,late:1,unmarked:1,published:3,marked:2}});expect(result.days[1].sessions).toHaveLength(2);expect(result.days[3]).toMatchObject({weekday:7,status:'not_published',holidayNames:[]});expect(result.days[0].holidayNames).toEqual(['Ngày nghỉ công bố']);expect(JSON.stringify(result)).not.toMatch(/viewId|csrf|studentId/);
 });
 it('rejects forged counts, dates, year/month/today, statuses and private receipt fields before display',()=>{
  const ctx=nativeParentContext(context(),slug).display,base=month();const cases=[{...base,granularity:'LESSON'},{...base,granularity:undefined},{...base,month:'2026-09'},{...base,today:'2026-10-06'},{...base,yearEnd:'2028-05'},{...base,totals:{...base.totals,marked:3}},{...base,studentId:other},{...base,days:base.days.slice(1)},{...base,days:base.days.map((d,i)=>i===3?{...d,status:'present'}:d)},{...base,days:base.days.map((d,i)=>i===1?{...d,sessions:[{...d.sessions[0],internalNote:'private'}]}:d)}];
  for(const value of cases)expect(()=>nativeParentAttendance(value as ApiSchemas['ParentAttendanceMonth'],ctx,'2026-10')).toThrow();
 });
 it('revalidates the exact public view and sends only its own bounded month query without staff credentials',async()=>{
  adopt();const fetcher=vi.fn(async(input:string)=>response(input.includes('attendance-month')?month():context()));vi.stubGlobal('fetch',fetcher);const result=await repo.attendance({viewId},slug,'2026-10');expect(result.totals.marked).toBe(2);expect(fetcher.mock.calls.map(([url])=>url)).toEqual([`/api/v1/parent/${slug}/context`,`/api/v1/parent/${slug}/attendance-month?month=2026-10`]);const calls=fetcher.mock.calls as unknown as [string,RequestInit][];for(const [,options]of calls)expect(options.headers).toMatchObject({'X-Parent-View':viewId});expect(readParentView(slug)).toBe(viewId);
 });
 it('keeps explicit section denial separate from invalidating the entire public session',async()=>{
  adopt();vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.includes('attendance-month')?new Response(JSON.stringify({code:'PARENT_SECTION_DENIED'}),{status:403}):response(context())));await expect(repo.attendance({viewId},slug,'2026-10')).rejects.toMatchObject({code:'FORBIDDEN'});expect(readParentView(slug)).toBe(viewId);
 });
 it('rejects a slow old month receipt after another child is adopted and leaves the new child intact',async()=>{
  adopt();const pending=new Promise<Response>(resolve=>{pendingResolve=resolve;});let monthlyCalls=0;vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.includes('attendance-month')?(monthlyCalls++,pending):response(context())));const work=repo.attendance({viewId},slug,'2026-10');await vi.waitFor(()=>expect(monthlyCalls).toBe(1));adopt(other);pendingResolve(response(month()));await expect(work).rejects.toMatchObject({code:'CONFLICT'});expect(readParentView(slug)).toBe(other);
 });
 it('uses the independent staff preview serializer without replacing a public view or borrowing parent cookies',async()=>{
  adopt();const ctx={staffOwner:captureStaffAccess()} as Ctx,fetcher=vi.fn(async(input:string)=>response(input.includes('attendance-month')?month():{context:context()}));vi.stubGlobal('fetch',fetcher);expect((await repo.attendance({preview:{ctx,schoolId,accessId}},slug,'2026-10')).totals.published).toBe(3);expect(fetcher.mock.calls.map(([url])=>url)).toEqual([`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview`,`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview/attendance-month?month=2026-10`]);expect(readParentView(slug)).toBe(viewId);authorizationChanged();await expect(repo.attendance({preview:{ctx,schoolId,accessId}},slug,'2026-10')).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(2);
 });
});
