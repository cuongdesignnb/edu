import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedStaffRepo} from '@/lib/repositories/connected/staff';
import {authenticationChanged,authorizationChanged,captureStaffAccess,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

const ctx={} as Ctx,schoolId='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const row={id,version:5,kind:'MEMBER',memberId:id,userId:id,status:'ACTIVE',accessActive:true,fullName:'Nguyễn Hoàng Bình',email:null,department:'Bộ môn Toán',staffCode:null,expiresAt:null,roleLabels:['GVCN'],dutyLabels:['Chủ nhiệm lớp 10A']};
const summary={kpi:{total:31,active:22,suspended:9,pendingInvites:null},departments:['Bộ môn Toán','Bộ môn Văn'],roleLabels:['GVCN','Giáo viên bộ môn'],canInvite:false,canSuspend:false,canAssign:false,canExport:false,canViewInvitations:false};
const envelope=(data:unknown,page?:unknown)=>new Response(JSON.stringify({data,requestId:'directory-adapter',...(page?{page}:{})}));
beforeEach(()=>{authenticationChanged();setStaffCsrf('fixture-csrf');});
afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});

describe('native staff directory adapter',()=>{
  it('uses exact SQL filters/pages and whole-result KPI while keeping missing work contacts and denied invitation counts null',async()=>{
    const fetcher=vi.fn().mockImplementation((url:string)=>Promise.resolve(url.includes('directory-summary')?envelope(summary):envelope([row],{limit:10,total:19,hasMore:true,nextCursor:'opaque-next'})));vi.stubGlobal('fetch',fetcher);
    const view=await connectedStaffRepo.teachers(ctx,schoolId,{pageSize:10,q:'binh',sort:'name',filters:{department:'Bộ môn Toán',role:'GVCN',status:'active'}});
    expect(view.total).toBe(19);expect(view.kpi.total).toBe(31);expect(view.kpi.pendingInvites).toBeNull();expect(view.canViewInvitations).toBe(false);expect(view.items[0]).toMatchObject({version:5,email:null,staffCode:null,status:'active',membershipId:id,accessActive:true});
    const url=new URL(fetcher.mock.calls[1][0],'https://example.invalid');expect(Object.fromEntries(url.searchParams)).toMatchObject({q:'binh',department:'Bộ môn Toán',role:'GVCN',status:'ACTIVE',sort:'fullName',limit:'10'});expect(view.allIds).toEqual([]);
  });
  it('represents an actual pending invitation without an invented user, membership or active status',async()=>{
    const invitation={...row,kind:'INVITATION',memberId:null,userId:null,status:null,accessActive:false,roleLabels:['Lời mời'],expiresAt:'2026-10-02T00:00:00Z'};vi.stubGlobal('fetch',vi.fn().mockImplementation((url:string)=>Promise.resolve(url.includes('directory-summary')?envelope({...summary,kpi:{...summary.kpi,pendingInvites:7},canViewInvitations:true}):envelope([invitation],{limit:10,total:1,hasMore:false,nextCursor:null}))));
    const view=await connectedStaffRepo.teachers(ctx,schoolId,{pageSize:10,filters:{status:'invited'}});expect(view.items[0]).toMatchObject({kind:'invitation',membershipId:null,userId:null,status:null,invitationStatus:'pending',accessActive:false});expect(view.kpi.pendingInvites).toBe(7);
  });
  it('does not start the page read through a new permission scope after a summary response',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:summary,requestId:'scope'})));vi.stubGlobal('fetch',fetcher);
    const stale={staffOwner:captureStaffAccess()} as Ctx;authorizationChanged();await expect(connectedStaffRepo.teachers(stale,schoolId,{pageSize:10})).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).not.toHaveBeenCalled();
    const changing=new Response(JSON.stringify({data:summary,requestId:'scope'}));changing.json=async()=>{authorizationChanged();return {data:summary,requestId:'scope'};};fetcher.mockResolvedValueOnce(changing);
    await expect(connectedStaffRepo.teachers(ctx,schoolId,{pageSize:10})).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('preserves native export denial instead of downloading an ordinary tenant directory or inventing rows',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope(summary)).mockResolvedValueOnce(new Response(JSON.stringify({code:'FORBIDDEN'}),{status:403}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.teachers(ctx,schoolId,{page:1,pageSize:100000,filters:{role:'GVCN'}})).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher.mock.calls[1][0]).toContain('purpose=export');expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('loads all filtered export pages under explicit export purpose with real rows and no truncated result',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope({...summary,canExport:true})).mockResolvedValueOnce(envelope([row],{limit:100,total:2,hasMore:true,nextCursor:'export-next'})).mockResolvedValueOnce(envelope([{...row,id:schoolId,fullName:'Trần Minh An'}],{limit:100,total:2,hasMore:false,nextCursor:null}));vi.stubGlobal('fetch',fetcher);
    const view=await connectedStaffRepo.teachers(ctx,schoolId,{page:1,pageSize:100000,q:'bo mon',filters:{role:'GVCN'}});expect(view.total).toBe(2);expect(view.items.map(r=>r.fullName)).toEqual(['Nguyễn Hoàng Bình','Trần Minh An']);expect(view.allIds).toEqual([id,schoolId]);expect(fetcher.mock.calls[2][0]).toContain('purpose=export');expect(fetcher.mock.calls[2][0]).toContain('cursor=export-next');
  });
  it('reports malformed pages/metadata instead of treating them as empty directory data',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope(summary)).mockResolvedValueOnce(envelope([row]));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.teachers(ctx,schoolId,{pageSize:10})).rejects.toMatchObject({code:'READ_ERROR'});
  });
});
