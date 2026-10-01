import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {connectedParentRepo as repo,type ParentKey} from '@/lib/repositories/connected/parent';
import {authenticationChanged,captureStaffAccess} from '@/lib/api/client';
import {beginParentExchange,clearParentSession,readParentView,readParentFault} from '@/lib/api/parent-session';
import type {Ctx} from '@/lib/repositories/core';
import {overviewContext,overviewSlug as slug,overviewViewId as viewId,overviewSchoolId as schoolId,overviewAccessId as accessId,overviewPeriodId as periodId} from '../fixtures/parent-overview';

beforeEach(()=>{clearParentSession();authenticationChanged();const stored=new Map<string,string>();vi.stubGlobal('window',{sessionStorage:{getItem:(k:string)=>stored.get(k)??null,setItem:(k:string,v:string)=>stored.set(k,v),removeItem:(k:string)=>stored.delete(k)}});beginParentExchange().adopt(slug,viewId,'synthetic-owned-csrf');});
afterEach(()=>{clearParentSession();vi.unstubAllGlobals();});
const key=(kind:'parent'|'preview'):ParentKey=>kind==='parent'?{viewId}:{preview:{schoolId,accessId,ctx:{staffOwner:captureStaffAccess()} as Ctx}};
const response=(sections:Parameters<typeof overviewContext>[0])=>new Response(JSON.stringify({data:overviewContext(sections),requestId:'preview-scope-unit'}),{status:200,headers:{'Content-Type':'application/json'}});
it.each(['parent','preview'] as const)('%s does not request any specialist content excluded by its fresh context',async kind=>{
 const owner=key(kind),fetcher=vi.fn(async(url:string)=>{expect(url).toBe(kind==='parent'?`/api/v1/parent/${slug}/context`:`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview/context`);return response(['overview']);});vi.stubGlobal('fetch',fetcher);
 const reads=[()=>repo.attendance(owner,slug,'2026-10'),()=>repo.teachers(owner,slug),()=>repo.timetable(owner,slug,'2026-09-28'),()=>repo.duties(owner,slug),()=>repo.conductList(owner,slug),()=>repo.conductDetail(owner,slug,periodId),()=>repo.activities(owner,slug),()=>repo.activity(owner,slug,periodId),()=>repo.announcements(owner,slug),()=>repo.announcement(owner,slug,periodId),()=>repo.documents(owner,slug),()=>repo.file(owner,slug,periodId),()=>repo.downloadFile(owner,slug,periodId)];
 for(const [i,read]of reads.entries()){await expect(read()).rejects.toMatchObject({code:'FORBIDDEN',details:{problemCode:'PARENT_SECTION_DENIED'}});expect(fetcher).toHaveBeenCalledTimes(i+1);}
 expect(readParentView(slug)).toBe(viewId);expect(readParentFault(slug)).toBeNull();
});
it.each(['parent','preview'] as const)('%s does not request the overview when only teachers are shared',async kind=>{
 const fetcher=vi.fn(async()=>response(['teachers']));vi.stubGlobal('fetch',fetcher);await expect(repo.overview(key(kind),slug)).rejects.toMatchObject({code:'FORBIDDEN',details:{problemCode:'PARENT_SECTION_DENIED'}});expect(fetcher).toHaveBeenCalledTimes(1);expect(readParentView(slug)).toBe(viewId);expect(readParentFault(slug)).toBeNull();
});
