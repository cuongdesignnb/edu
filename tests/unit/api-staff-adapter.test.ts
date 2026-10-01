import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedStaffRepo} from '@/lib/repositories/connected/staff';
import {authenticationChanged,authorizationChanged,captureStaffAccess,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

const ctx={} as Ctx,schoolId='00000000-0000-4000-8000-000000000001',memberId='00000000-0000-4000-8000-000000000002',roleId='00000000-0000-4000-8000-000000000003';
const grant={id:roleId,version:4,roleId,roleLabel:'Vai trò thật',roleCode:'ACTUAL',scopeType:'SCHOOL',actions:['school.read'],validFrom:'2026-09-30T00:00:00Z',validUntil:'2026-10-01T00:00:00Z'};
const member={id:memberId,userId:memberId,version:8,createdAt:'2026-09-30T00:00:00Z',updatedAt:'2026-09-30T00:00:00Z',workDisplayName:'Nhân sự API',status:'ACTIVE',shareWorkContact:false,joinedAt:null,endedAt:null,statusReason:null,schoolRoleGrants:[grant],grants:[grant]};
const invitation={id:memberId,version:3,email:'teacher@example.invalid',createdAt:'2026-09-30T00:00:00Z',updatedAt:'2026-09-30T00:00:00Z',expiresAt:'2099-10-30T00:00:00Z',status:'PENDING',workDisplayName:'Nhân sự mời API',proposedDuty:'Chưa phân công',roleIds:[roleId],deliveryState:'QUEUED'};
const envelope=(data:unknown,page?:unknown)=>new Response(JSON.stringify({data,requestId:'staff-adapter',...(page?{page}:{})}));
beforeEach(()=>{authenticationChanged();setStaffCsrf('fixture-csrf');});
afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});

describe('native staff command adapters',()=>{
  it('sends one atomic role replacement with the displayed version, keeping returned grant IDs and expiry',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope(member));vi.stubGlobal('fetch',fetcher);
    const view=await connectedStaffRepo.setMemberRoles(ctx,schoolId,memberId,[roleId],'Đổi vai trò thật',7);
    expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toContain(`/members/${memberId}/school-roles`);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({expectedVersion:7,roleIds:[roleId],reason:'Đổi vai trò thật'});
    expect(view.roleTemplateIds).toEqual([roleId]);expect(view.schoolRoleGrants[0]).toMatchObject({id:roleId,validUntil:grant.validUntil});expect(view.version).toBe(8);expect(view).not.toHaveProperty('workPhone');expect(view).not.toHaveProperty('workEmail');
  });
  it('requires versions before any lifecycle or role request and does not fetch a fresh version to overwrite',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.setMemberRoles(ctx,schoolId,memberId,[],'Lý do')).rejects.toMatchObject({code:'CONFLICT'});
    await expect(connectedStaffRepo.setMembershipStatus(ctx,schoolId,memberId,'revoked','Lý do')).rejects.toMatchObject({code:'CONFLICT'});
    await expect(connectedStaffRepo.revokeInvitation(ctx,schoolId,memberId)).rejects.toMatchObject({code:'CONFLICT'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('maps permanent ending to the native end command and keeps the acknowledged reason/time',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({...member,status:'ENDED',endedAt:'2026-09-30T03:00:00Z',statusReason:'Kết thúc công tác',grants:[],schoolRoleGrants:[]}));vi.stubGlobal('fetch',fetcher);
    const result=await connectedStaffRepo.setMembershipStatus(ctx,schoolId,memberId,'revoked','Kết thúc công tác',7);expect(fetcher.mock.calls[0][0]).toContain(`/members/${memberId}/end`);
    expect(result).toMatchObject({status:'revoked',endedAt:'2026-09-30T03:00:00Z',statusReason:'Kết thúc công tác',roleTemplateIds:[],grants:[]});
  });
  it('does not submit a stale form through the new identity or permission scope',async()=>{
    const owned={staffOwner:captureStaffAccess()} as Ctx,fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);authorizationChanged();
    await expect(connectedStaffRepo.setMemberRoles(owned,schoolId,memberId,[],'Lý do',7)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).not.toHaveBeenCalled();
    const previous={staffOwner:captureStaffAccess()} as Ctx;authenticationChanged();setStaffCsrf('new-csrf');
    await expect(connectedStaffRepo.invite(previous,schoolId,{fullName:'Người mới',email:'new@example.invalid',roleTemplateIds:[],days:2,proposedDuty:''})).rejects.toMatchObject({code:'NO_SESSION'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('retains zero/multiple invitation roles, the agreed lifetime and optional delegation expiry without synthetic grants',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope({...invitation,roleIds:[]})).mockResolvedValueOnce(envelope({...invitation,workDisplayName:'Nhân sự',proposedDuty:'Giáo viên',roleIds:[roleId,memberId]}));vi.stubGlobal('fetch',fetcher);
    const empty=await connectedStaffRepo.invite(ctx,schoolId,{fullName:' Nhân sự mời API ',email:' teacher@example.invalid ',proposedDuty:' Chưa phân công ',roleTemplateIds:[],days:30});expect(empty.roleTemplateIds).toEqual([]);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({workDisplayName:'Nhân sự mời API',email:'teacher@example.invalid',proposedDuty:'Chưa phân công',roleIds:[],expiresInDays:30});
    const roles=[roleId,memberId],until='2026-10-01T00:00:00Z';await connectedStaffRepo.invite(ctx,schoolId,{fullName:'Nhân sự',email:'teacher@example.invalid',proposedDuty:'Giáo viên',roleTemplateIds:roles,days:7,validUntil:until});expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({roleIds:roles,expiresInDays:7,validUntil:until});
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).not.toHaveProperty('actorId');expect(JSON.parse(fetcher.mock.calls[1][1].body)).not.toHaveProperty('validFrom');
  });
  it('keeps native validation/conflicts and translates the existing invitation form field names',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'VALIDATION_ERROR',fieldErrors:[{path:'roleIds',message:'Vượt quyền'},{path:'expiresInDays',message:'Sai hạn'},{path:'workDisplayName',message:'Thiếu tên'}]}),{status:422})));
    await expect(connectedStaffRepo.invite(ctx,schoolId,{fullName:'Nhân sự',email:'teacher@example.invalid',proposedDuty:'',roleTemplateIds:[roleId],days:7})).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{roleTemplateIds:'Vượt quyền',days:'Sai hạn',fullName:'Thiếu tên'}});
  });
  it('lists only real invitation pages with actual inviter labels and validates the revoke ACK',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope([{...invitation,inviterName:'Người mời thực'}],{limit:100,total:1,hasMore:false,nextCursor:null})).mockResolvedValueOnce(envelope({...invitation,status:'REVOKED',version:4}));vi.stubGlobal('fetch',fetcher);
    expect((await connectedStaffRepo.invitations(ctx,schoolId))[0]).toMatchObject({inviterName:'Người mời thực',fullName:'Nhân sự mời API',version:3});const revoked=await connectedStaffRepo.revokeInvitation(ctx,schoolId,memberId,3,'Thu hồi đúng phiên bản');expect(revoked.status).toBe('revoked');expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({expectedVersion:3,reason:'Thu hồi đúng phiên bản'});
  });
  it('rejects lifecycle metadata missing from the server rather than fabricating empty grants or join dates',async()=>{
    const {schoolRoleGrants:_omit,...missing}=member;vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope(missing)));
    await expect(connectedStaffRepo.setMemberRoles(ctx,schoolId,memberId,[],'Đổi vai trò',7)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('explains actual policy failures while retaining native problem metadata instead of claiming a version conflict',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:'LAST_ADMIN_REQUIRED',requestId:'guard'}),{status:409})).mockResolvedValueOnce(new Response(JSON.stringify({code:'DELEGATION_EXPIRY_CEILING'}),{status:403}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.setMemberRoles(ctx,schoolId,memberId,[],'Lý do',7)).rejects.toMatchObject({code:'CONFLICT',message:expect.stringContaining('quản trị'),details:{problemCode:'LAST_ADMIN_REQUIRED',requestId:'guard'}});
    await expect(connectedStaffRepo.setMemberRoles(ctx,schoolId,memberId,[roleId],'Lý do',7)).rejects.toMatchObject({code:'FORBIDDEN',message:expect.stringContaining('Thời hạn'),details:{problemCode:'DELEGATION_EXPIRY_CEILING'}});
  });
});
