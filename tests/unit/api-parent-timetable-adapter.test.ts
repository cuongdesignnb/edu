import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {connectedParentRepo as repo} from '@/lib/repositories/connected/parent';
import {nativeParentTimetable,parentWeekStart} from '@/lib/repositories/connected/parent-timetable';
import {nativeParentContext} from '@/lib/repositories/connected/parent-context';
import {dateDays} from '@/lib/api/dates';
import {beginParentExchange,clearParentSession,readParentView} from '@/lib/api/parent-session';
import {authenticationChanged,authorizationChanged,captureStaffAccess} from '@/lib/api/client';
import type {ApiSchemas} from '@/lib/api/generated';
import type {Ctx} from '@/lib/repositories/core';
const slug='parent-week-unit',week='2026-10-05',viewId='6a000000-0000-4000-8000-000000000001',other='6a000000-0000-4000-8000-000000000002',schoolId='6a000000-0000-4000-8000-000000000003',accessId='6a000000-0000-4000-8000-000000000004';
const context=():ApiSchemas['ParentContext']=>({viewId,school:{name:'Trường lịch API',slug,publicContactPhone:null,shortName:null,motto:null,publicContactEmail:null,publicAddress:null},student:{displayName:'Con API',classLabel:'6A',schoolYearLabel:'2026–2027'},allowedSections:['timetable'],allowDownload:false,csrfToken:'owned-week-csrf',expiresAt:'2026-10-05T08:00:00Z',today:week,year:{label:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01'},relationshipLabel:'Mẹ',linkExpiresAt:'2026-11-01T00:00:00Z',lastPublishedAt:null});
const lesson=():ApiSchemas['ParentTimetableWeekLesson']=>({date:week,startsAt:week+'T01:00:00Z',endsAt:week+'T01:45:00Z',startsAtLocal:'08:00',endsAtLocal:'08:45',periodNumber:3,subjectName:'Toán công bố',teacherName:'Giáo viên công tác',roomName:null,status:'SCHEDULED',changeNote:null});
const timetable=():ApiSchemas['ParentTimetableWeek']=>({weekStart:week,today:week,timezone:'Asia/Ho_Chi_Minh',year:{startsOn:'2026-09-01',endsOn:'2027-06-01'},weekNumber:6,days:Array.from({length:7},(_,i)=>({date:dateDays(week,i),holidayNames:i===6?['Lịch nghỉ công bố Chủ nhật']:[],lessons:i===0?[lesson()]:[]}))});
const display=()=>nativeParentContext(context(),slug).display;
const response=(data:unknown)=>new Response(JSON.stringify({data,requestId:'parent-week-unit'}),{status:200,headers:{'Content-Type':'application/json'}});
const adopt=(id=viewId)=>beginParentExchange().adopt(slug,id,'owned-week-csrf');
beforeEach(()=>{clearParentSession();authenticationChanged();});afterEach(()=>{clearParentSession();vi.unstubAllGlobals();});
describe('Native parent bounded published weekly timetable',()=>{
 it('keeps actual period/time/status metadata and Sunday, with no inferred lessons, room or week number',()=>{
  const base=timetable(),items=nativeParentTimetable(base,display(),week);expect(items.week).toBe(6);expect(items.days).toHaveLength(7);expect(items.days[0].lessons[0]).toMatchObject({period:3,start:'08:00',end:'08:45',room:undefined,cancelled:false,changed:undefined});expect(items.days[1].lessons).toEqual([]);expect(items.days[6].holiday).toBe('Lịch nghỉ công bố Chủ nhật');expect(parentWeekStart('2026-10-11')).toBe(week);
  base.weekNumber=null;base.days[0].lessons[0]={...lesson(),periodNumber:null,status:'CANCELLED',changeNote:'Đổi lịch đã công bố'};const cancelled=nativeParentTimetable(base,display(),week);expect(cancelled.week).toBeUndefined();expect(cancelled.days[0].lessons[0]).toMatchObject({period:null,cancelled:true,changed:'Đổi lịch đã công bố'});expect(JSON.stringify(cancelled)).not.toMatch(/studentId|memberId|roomId|csrf|viewId/);
 });
 it('uses the school timezone for labels and clips academic boundary weeks independently of the host',()=>{
  const base=timetable();base.timezone='America/New_York';base.days[0].lessons[0]={...lesson(),startsAt:week+'T12:00:00Z',endsAt:week+'T12:45:00Z'};expect(nativeParentTimetable(base,display(),week).days[0].lessons[0].start).toBe('08:00');
  const first='2026-08-31',clipped={...timetable(),weekStart:first,weekNumber:null,days:Array.from({length:6},(_,i)=>({date:dateDays('2026-09-01',i),holidayNames:[],lessons:[]}))};expect(nativeParentTimetable(clipped,display(),first).days[0].date).toBe('2026-09-01');
 });
 it('rejects private fields, incomplete/foreign dates, mismatched timezone labels, invalid status and oversized sources',()=>{
  const base=timetable(),first=base.days[0];for(const value of [{...base,studentId:other},{...base,today:'2026-10-06'},{...base,year:{...base.year,endsOn:'2028-06-01'}},{...base,timezone:'invalid/timezone'},{...base,days:base.days.slice(0,6)},{...base,days:[{...first,date:'2026-10-06'},...base.days.slice(1)]},{...base,days:[{...first,lessons:[{...lesson(),memberId:other}]},...base.days.slice(1)]},{...base,days:[{...first,lessons:[{...lesson(),periodNumber:0}]},...base.days.slice(1)]},{...base,days:[{...first,lessons:[{...lesson(),startsAtLocal:'09:00'}]},...base.days.slice(1)]},{...base,days:[{...first,lessons:[{...lesson(),status:'DRAFT'}]},...base.days.slice(1)]},{...base,days:[{...first,lessons:Array.from({length:1001},lesson)},...base.days.slice(1)]}])expect(()=>nativeParentTimetable(value as ApiSchemas['ParentTimetableWeek'],display(),week)).toThrow();
 });
 it('public composite requests carry the current exact view and requested week without using overview or attendance',async()=>{
  adopt();const fetcher=vi.fn(async(input:string)=>response(input.includes('timetable-week')?timetable():context()));vi.stubGlobal('fetch',fetcher);expect((await repo.timetable({viewId},slug,week)).days[0].lessons).toHaveLength(1);
  const calls=fetcher.mock.calls as unknown as Array<[string,RequestInit]>;expect(calls.map(([url])=>url)).toEqual([`/api/v1/parent/${slug}/context`,`/api/v1/parent/${slug}/timetable-week?week=${week}`]);for(const [,options] of calls)expect((options.headers as Record<string,string>)['X-Parent-View']).toBe(viewId);
 });
 it('a delayed older timetable cannot expose its lessons or clear a newly adopted child',async()=>{
  adopt();let resolve:(value:Response)=>void=()=>{throw new Error('not waiting');};let started=()=>{};const ready=new Promise<void>(r=>{started=r;});vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.includes('timetable-week')?new Promise<Response>(r=>{resolve=r;started();}):response(context())));const pending=repo.timetable({viewId},slug,week);await ready;adopt(other);resolve(response(timetable()));await expect(pending).rejects.toMatchObject({code:'CONFLICT',details:{problemCode:'PARENT_CONTEXT_CHANGED'}});expect(readParentView(slug)).toBe(other);
 });
 it('staff preview keeps independent current school/link scope without adopting the public view',async()=>{
  adopt();const ctx:Ctx={actor:{kind:'staff',userId:other},today:week,now:week+'T01:00:00Z',staffOwner:captureStaffAccess()};const fetcher=vi.fn(async(input:string)=>response(input.includes('timetable-week')?timetable():{context:context()}));vi.stubGlobal('fetch',fetcher);expect((await repo.timetable({preview:{ctx,schoolId,accessId}},slug,week)).days).toHaveLength(7);expect(fetcher.mock.calls.map(([url])=>url)).toEqual([`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview`,`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview/timetable-week?week=${week}`]);expect(readParentView(slug)).toBe(viewId);authorizationChanged();await expect(repo.timetable({preview:{ctx,schoolId,accessId}},slug,week)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(2);
 });
});
