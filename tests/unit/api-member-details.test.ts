import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedStaffRepo} from '@/lib/repositories/connected/staff';
import {authenticationChanged,authorizationChanged,captureStaffAccess,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

const ctx={} as Ctx,schoolId='00000000-0000-4000-8000-000000000001',memberId='00000000-0000-4000-8000-000000000002',roleId='00000000-0000-4000-8000-000000000003';
const grant={id:roleId,version:4,roleId,roleLabel:'Vai trò thật',roleCode:'CUSTOM',scopeType:'SCHOOL',actions:['school.read','publication.withdraw','native.future.action'],validFrom:'2026-09-30T00:00:00Z',validUntil:'2026-10-02T00:00:00Z'};
const member={id:memberId,userId:memberId,version:8,createdAt:'2026-09-30T00:00:00Z',updatedAt:'2026-09-30T00:00:00Z',workDisplayName:'Tên tại trường',workEmail:null,workPhone:null,status:'ACTIVE',shareWorkContact:false,joinedAt:null,endedAt:null,statusReason:null,schoolRoleGrants:[grant],grants:[grant]};
const view={member,referenceDate:'2026-10-01',joinedOn:null,accessActive:true,otherSchools:3,assignments:null,roleChoices:null,canAssign:false,canSuspend:false,canRole:false,canViewHistory:false,isSelf:false};
const event={id:roleId,actorId:null,actorLabel:'Tác giả thật',action:'revokeAssignment',targetType:'assignment',targetId:roleId,createdAt:'2026-09-30T00:00:00Z',reason:'Lý do thật',changes:[{field:'status',before:'ACTIVE',after:'REVOKED'}]};
const envelope=(data:unknown,page?:unknown)=>new Response(JSON.stringify({data,requestId:'member-adapter',...(page?{page}:{})}));
beforeEach(()=>{authenticationChanged();setStaffCsrf('fixture-csrf');});
afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});

describe('native member details adapter',()=>{
  it('preserves unavailable panels, actual count, nullable contacts and every native action without inferring authority',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope(view));vi.stubGlobal('fetch',fetcher);
    const result=await connectedStaffRepo.member(ctx,schoolId,memberId);expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({assignments:null,history:null,roleTemplates:null,otherSchools:3,joinedOn:null,canRole:false,accessActive:true});
    expect(result.user).toMatchObject({fullName:'Tên tại trường',email:null,workPhone:null});expect(result.schoolActionCodes).toEqual(grant.actions);expect(result.membership.version).toBe(8);expect(result.roles[0].validUntil).toBe(grant.validUntil);
  });
  it('keeps server assignment activity/dates and minimal role choices while traversing actual audit pages',async()=>{
    const assignment={id:roleId,version:7,classId:roleId,className:'10A',yearName:'Năm thật',memberId,roleGrantId:roleId,kind:'HOMEROOM',subjectId:null,subjectName:null,startsOn:'2099-09-01',endsOn:null,revokedAt:null,grantValidFrom:'2099-09-01T00:00:00Z',grantValidUntil:null,grantRevokedAt:null,roleLabel:'GVCN',roleStatus:'ACTIVE',createdAt:'2026-09-30T00:00:00Z',createdBy:null,createdByName:null,live:false};
    const choice={id:roleId,version:4,label:'Chọn vai trò',code:'CUSTOM',systemRole:false,canDelegate:false,delegationUntil:null};
    const fetcher=vi.fn().mockResolvedValueOnce(envelope({...view,assignments:[assignment],roleChoices:[choice],canRole:true,canViewHistory:true})).mockResolvedValueOnce(envelope([event],{limit:100,total:2,hasMore:true,nextCursor:'actual-history-cursor'})).mockResolvedValueOnce(envelope([{...event,id:memberId}],{limit:100,total:2,hasMore:false,nextCursor:null}));vi.stubGlobal('fetch',fetcher);
    const result=await connectedStaffRepo.member(ctx,schoolId,memberId);expect(result.assignments?.[0]).toMatchObject({version:7,validFrom:'2099-09-01',validUntil:null,live:false,createdBy:null,createdByName:null});expect(result.roleTemplates).toEqual([choice]);expect(result.history).toHaveLength(2);expect(result.history?.[0]).toMatchObject({actorId:null,actorName:'Tác giả thật',action:'revokeAssignment',reason:'Lý do thật'});
    expect(fetcher.mock.calls[2][0]).toContain('cursor=actual-history-cursor');expect(fetcher.mock.calls[1][0]).toContain(`/members/${memberId}/history`);
  });
  it('does not replace a newly denied audit read with an empty history',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope({...view,canViewHistory:true})).mockResolvedValueOnce(new Response(JSON.stringify({code:'FORBIDDEN'}),{status:403}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.member(ctx,schoolId,memberId)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not begin a history read after retained render ownership or profile response ownership changes',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope(view));vi.stubGlobal('fetch',fetcher);const stale={staffOwner:captureStaffAccess()} as Ctx;authorizationChanged();
    await expect(connectedStaffRepo.member(stale,schoolId,memberId)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).not.toHaveBeenCalled();
    const response=envelope({...view,canViewHistory:true});response.json=async()=>{authorizationChanged();return {data:{...view,canViewHistory:true},requestId:'changed'};};fetcher.mockResolvedValueOnce(response);
    await expect(connectedStaffRepo.member(ctx,schoolId,memberId)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('surfaces missing profile data and oversized history instead of inventing nulls or truncating records',async()=>{
    const incomplete={...view,assignments:undefined};const fetcher=vi.fn().mockResolvedValueOnce(envelope(incomplete));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.member(ctx,schoolId,memberId)).rejects.toMatchObject({code:'READ_ERROR'});
    fetcher.mockResolvedValueOnce(envelope({...view,canViewHistory:true})).mockResolvedValueOnce(envelope([event],{limit:100,total:2001,hasMore:true,nextCursor:'large-history'}));
    await expect(connectedStaffRepo.member(ctx,schoolId,memberId)).rejects.toMatchObject({code:'VALIDATION'});
  });
});
