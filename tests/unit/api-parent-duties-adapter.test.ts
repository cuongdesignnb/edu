import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {connectedParentRepo as repo} from '@/lib/repositories/connected/parent';
import {nativeParentDuties} from '@/lib/repositories/connected/parent-duties';
import {nativeParentContext} from '@/lib/repositories/connected/parent-context';
import {beginParentExchange,clearParentSession,readParentView} from '@/lib/api/parent-session';
import {authenticationChanged,authorizationChanged,captureStaffAccess} from '@/lib/api/client';
import type {ApiSchemas} from '@/lib/api/generated';
import type {Ctx} from '@/lib/repositories/core';
const slug='parent-duties-unit',viewId='68000000-0000-4000-8000-000000000001',other='68000000-0000-4000-8000-000000000002',schoolId='68000000-0000-4000-8000-000000000003',accessId='68000000-0000-4000-8000-000000000004';
const context=():ApiSchemas['ParentContext']=>({viewId,school:{name:'Trường trực nhật API',slug,publicContactPhone:null,shortName:null,motto:null,publicContactEmail:null,publicAddress:null},student:{displayName:'Con API',classLabel:'6A',schoolYearLabel:'2026–2027'},allowedSections:['duties'],allowDownload:false,csrfToken:'owned-duty-csrf',expiresAt:'2026-10-05T08:00:00Z',today:'2026-10-05',year:{label:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01'},relationshipLabel:'Mẹ',linkExpiresAt:'2026-11-01T00:00:00Z',lastPublishedAt:null});
const schedule=():ApiSchemas['ParentDutySchedule']=>({today:'2026-10-05',year:{startsOn:'2026-09-01',endsOn:'2027-06-01'},items:[{date:'2026-10-06',task:'Trực tương lai đã hủy',status:'CANCELLED',publishedAt:'2026-10-01T01:00:00Z'},{date:'2026-10-04',task:'Trực đã qua chưa xác nhận xong',status:'ASSIGNED',publishedAt:'2026-10-01T01:00:00Z'},{date:'2026-10-05',task:'Trực hôm nay đã hoàn thành',status:'DONE',publishedAt:'2026-10-01T01:00:00Z'}]});
const response=(data:unknown)=>new Response(JSON.stringify({data,requestId:'parent-duty-unit'}),{status:200,headers:{'Content-Type':'application/json'}});
const adopt=(id=viewId)=>beginParentExchange().adopt(slug,id,'owned-duty-csrf');
beforeEach(()=>{clearParentSession();authenticationChanged();});afterEach(()=>{clearParentSession();vi.unstubAllGlobals();});
describe('Native parent own published duty schedule',()=>{
 it('keeps every concrete published task/status and uses school today without inferring completion or group rosters',()=>{
  const items=nativeParentDuties(schedule(),nativeParentContext(context(),slug).display);expect(items.map(row=>row.date)).toEqual(['2026-10-04','2026-10-05','2026-10-06']);expect(items[0]).toMatchObject({upcoming:false,status:'ASSIGNED'});expect(items[1]).toMatchObject({upcoming:true,status:'DONE'});expect(items[2].status).toBe('CANCELLED');expect(JSON.stringify(items)).not.toMatch(/studentId|enrollmentId|groupName|viewId|csrf/);expect(nativeParentDuties({...schedule(),items:[]},nativeParentContext(context(),slug).display)).toEqual([]);
 });
 it('rejects private fields, mismatched school dates/year, impossible dates, unknown status and oversized partial receipts',()=>{
  const base=schedule(),row=base.items[0],ctx=nativeParentContext(context(),slug).display;
  for(const value of [{...base,studentId:other},{...base,today:'2026-10-06'},{...base,year:{...base.year,endsOn:'2028-06-01'}},{...base,items:[{...row,groupStudents:['Bạn khác']}]},{...base,items:[{...row,date:'2027-06-01'}]},{...base,items:[{...row,date:'2027-02-30'}]},{...base,items:[{...row,status:'PUBLISHED'}]},{...base,items:[{...row,publishedAt:'not-a-time'}]},{...base,items:Array.from({length:5001},()=>row)}])expect(()=>nativeParentDuties(value as ApiSchemas['ParentDutySchedule'],ctx)).toThrow();
 });
 it('public context and complete schedule use the exact current view header; revoked publications become empty',async()=>{
  adopt();let visible=true;const fetcher=vi.fn(async(input:string)=>response(input.endsWith('duty-schedule')?{...schedule(),items:visible?schedule().items:[]}:context()));vi.stubGlobal('fetch',fetcher);expect(await repo.duties({viewId},slug)).toHaveLength(3);visible=false;expect(await repo.duties({viewId},slug)).toEqual([]);
  for(const [url,options] of fetcher.mock.calls as unknown as Array<[string,RequestInit]>){expect(url).toMatch(new RegExp(`/parent/${slug}/(context|duty-schedule)$`));expect((options.headers as Record<string,string>)['X-Parent-View']).toBe(viewId);expect(options.body).toBeUndefined();}
 });
 it('a delayed older child result cannot be cached or clear a newer view',async()=>{
  adopt();let resolve:(value:Response)=>void=()=>{throw new Error('not waiting');};let started=()=>{};const ready=new Promise<void>(r=>{started=r;});vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.endsWith('duty-schedule')?new Promise<Response>(r=>{resolve=r;started();}):response(context())));const pending=repo.duties({viewId},slug);await ready;adopt(other);resolve(response(schedule()));await expect(pending).rejects.toMatchObject({code:'CONFLICT',details:{problemCode:'PARENT_CONTEXT_CHANGED'}});expect(readParentView(slug)).toBe(other);
 });
 it('module denial preserves the view and current terminal revoke removes it',async()=>{
  adopt();let invalid=false;vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.endsWith('duty-schedule')?new Response(JSON.stringify({code:invalid?'PARENT_ACCESS_INVALID':'PARENT_SECTION_DENIED',requestId:'duty-denied'}),{status:invalid?401:403,headers:{'Content-Type':'application/json'}}):response(context())));await expect(repo.duties({viewId},slug)).rejects.toMatchObject({code:'FORBIDDEN'});expect(readParentView(slug)).toBe(viewId);invalid=true;await expect(repo.duties({viewId},slug)).rejects.toMatchObject({code:'REVOKED'});expect(readParentView(slug)).toBeNull();
 });
 it('staff preview carries its independent current scope and never adopts public view credentials',async()=>{
  adopt();const ctx:Ctx={actor:{kind:'staff',userId:other},today:'2026-10-05',now:'2026-10-05T01:00:00Z',staffOwner:captureStaffAccess()};const fetcher=vi.fn(async(input:string)=>response(input.endsWith('duty-schedule')?schedule():{context:context()}));vi.stubGlobal('fetch',fetcher);expect(await repo.duties({preview:{ctx,schoolId,accessId}},slug)).toHaveLength(3);expect(fetcher.mock.calls.map(([url])=>url)).toEqual([`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview`,`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview/duty-schedule`]);expect(readParentView(slug)).toBe(viewId);authorizationChanged();await expect(repo.duties({preview:{ctx,schoolId,accessId}},slug)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(2);
 });
});
