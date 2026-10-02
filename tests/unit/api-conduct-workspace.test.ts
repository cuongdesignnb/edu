import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {authenticationChanged,setStaffCsrf,captureStaffAccess} from '@/lib/api/client';
import {connectedConductAdjustmentsRepo} from '@/lib/repositories/connected/conduct-adjustments';
import {connectedConductWorkspaceRepo} from '@/lib/repositories/connected/conduct-workspace';
import type {Ctx} from '@/lib/repositories/core';
const id=(n:number)=>`6f000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const source={weekId:id(4),periodId:id(5),version:2,dataVersion:3,classVersion:1,schoolVersion:1,sourceHash:'a'.repeat(64),publicationId:id(6)};
const ctx=():Ctx=>({actor:{kind:'staff',userId:id(8)},today:'2026-10-02',now:'2026-10-02T01:00:00Z',staffOwner:captureStaffAccess()});
beforeEach(()=>{authenticationChanged();setStaffCsrf('unit-conduct-csrf');});afterEach(()=>vi.unstubAllGlobals());
it('publishes exactly displayed source and version without leaking the UI row or refreshing before a failed save',async()=>{
 const fetch=vi.fn(async(url:RequestInfo|URL,options?:RequestInit)=>{expect(String(url)).toMatch(/\/adjustments\/[^/]+\/publish$/);expect(options?.method).toBe('POST');expect(JSON.parse(String(options?.body))).toEqual({source,version:2});return new Response(JSON.stringify({code:'DEPENDENCY_UNAVAILABLE'}),{status:503});});vi.stubGlobal('fetch',fetch);
 const displayed={source,version:2,studentName:'Dữ liệu trình bày',reason:'Không được gửi lại ngoài hợp đồng'};
 await expect(connectedConductAdjustmentsRepo.publishAdjustment(ctx(),id(1),id(2),id(3),id(9),displayed)).rejects.toMatchObject({code:'NETWORK'});expect(fetch).toHaveBeenCalledTimes(1);
});
it('propagates a source conflict through the active native facade without producing a successful record',async()=>{
 const fetch=vi.fn(async(_url:RequestInfo|URL,options?:RequestInit)=>{expect(JSON.parse(String(options?.body)).source).toEqual(source);return new Response(JSON.stringify({code:'STALE_SOURCE',currentVersion:4}),{status:409});});vi.stubGlobal('fetch',fetch);
 await expect(connectedConductWorkspaceRepo.createRecord(ctx(),id(1),id(2),id(3),{source,studentId:id(10),enrollmentId:id(11),date:'2026-10-02',ruleId:id(12),reason:'Nội dung hợp lệ',requestId:id(13)})).rejects.toMatchObject({code:'CONFLICT'});expect(fetch).toHaveBeenCalledTimes(1);
});
