import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedStudentsRepo} from '@/lib/repositories/connected/students';
import {connectedStudentsExtraRepo} from '@/lib/repositories/connected/students-extra';
import {authenticationChanged,authorizationChanged,captureStaffAccess,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

const ctx={} as Ctx,schoolId='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',studentId='00000000-0000-4000-8000-000000000003',relId='00000000-0000-4000-8000-000000000004';
const meta={id,version:3,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'},contact=()=>({...meta,fullName:'Giám hộ nguồn',phone:'0912222222',email:null,status:'ACTIVE'});
const student=()=>({id:studentId,version:4,name:'Học sinh nguồn',code:'SOURCE',status:'LEFT',classId:null,className:null,yearId:null,enrollmentId:null,enrollmentVersion:null});
const relation=()=>({...meta,id:relId,studentId,guardianId:id,relationshipLabel:'Mẹ',isPrimary:true,canReceiveInfo:false,status:'VERIFIED',verifiedAt:meta.createdAt,revokedAt:null,verifiedByName:null,verificationNote:'Căn cứ nguồn',revokedReason:null,student:student(),canEdit:false,canVerify:false,canIssue:false,canRevokeLinks:false,canSeeLinks:false,links:null});
const profile=()=>({guardian:contact(),today:'2026-10-01',canEditContact:false,canViewHistory:false,historyHasMore:null,relationships:[relation()],history:null});
const envelope=(data:unknown)=>new Response(JSON.stringify({data,requestId:'guardian-unit'}));
beforeEach(()=>{authenticationChanged();setStaffCsrf('guardian-csrf');});afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});

describe('native guardian directory and profile candidates',()=>{
  it('sends search and verification filters to the server and preserves real null link counts and current classes',async()=>{
    const row={...contact(),verified:1,unverified:0,revoked:0,activeLinks:null,relationshipCount:1,students:[{...student(),relationshipId:relId,relationshipVersion:5,relation:'Mẹ',verification:'VERIFIED',canReceiveInfo:false,isPrimaryContact:true}]};
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[row],requestId:'page',page:{total:1,limit:10,nextCursor:null,hasMore:false}})));vi.stubGlobal('fetch',fetcher);
    const result=await connectedStudentsRepo.guardians(ctx,schoolId,{page:1,pageSize:10,q:'Đặng %_',sort:'name',filters:{verification:'verified'}});
    expect(fetcher.mock.calls[0][0]).toContain('/guardian-directory?');expect(fetcher.mock.calls[0][0]).toContain('verification=VERIFIED');expect(fetcher.mock.calls[0][0]).toContain('sort=fullName');expect(result.items[0]).toMatchObject({version:3,activeLinks:null,phoneMasked:'0912 *** 222',students:[{version:4,relationshipVersion:5,classId:null,verification:'verified',canReceiveInfo:false}]});
  });
  it('retains verified relationships without receiving permission and leaves denied panels null',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope(profile())));const result=await connectedStudentsRepo.guardian(ctx,schoolId,id);
    expect(result).toMatchObject({guardian:{version:3,email:null},canEditContact:false,history:null,historyHasMore:null,relationships:[{version:3,verification:'verified',canReceiveInfo:false,links:null,student:{className:null,enrollmentVersion:null}}]});
  });
  it('rejects wrong contacts, relationships and populated denied panels instead of rendering private data',async()=>{
    const invalid=[{...profile(),guardian:{...contact(),id:studentId}},{...profile(),history:[]},{...profile(),relationships:[{...relation(),studentId:id}]},{...profile(),relationships:[{...relation(),links:[]}]}];
    const fetcher=vi.fn();for(const value of invalid)fetcher.mockResolvedValueOnce(envelope(value));vi.stubGlobal('fetch',fetcher);
    for(const ignored of invalid){void ignored;await expect(connectedStudentsRepo.guardian(ctx,schoolId,id)).rejects.toMatchObject({code:'READ_ERROR'});}
  });
  it('requires source versions and actual nullable contact fields',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope({...profile(),guardian:{...contact(),version:undefined}})).mockResolvedValueOnce(envelope({...profile(),guardian:{...contact(),email:undefined}}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStudentsRepo.guardian(ctx,schoolId,id)).rejects.toMatchObject({code:'CONFLICT'});await expect(connectedStudentsRepo.guardian(ctx,schoolId,id)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('uses actual authorized link metadata and rejects a sibling link or a reusable secret',async()=>{
    const link={...meta,id:schoolId,studentId,yearId:schoolId,relationshipId:relId,allowedSections:['overview','teachers'],allowDownload:false,expiresAt:meta.createdAt,revokedAt:null,revokeReason:null,issuedBy:schoolId,issuedByName:null,guardianName:contact().fullName,relationshipLabel:'Mẹ',yearName:'Năm nguồn',status:'ACTIVE',opens:2,lastOpenedAt:null};
    const value={...profile(),relationships:[{...relation(),canSeeLinks:true,links:[link]}]},fetcher=vi.fn().mockResolvedValueOnce(envelope(value)).mockResolvedValueOnce(envelope({...value,relationships:[{...value.relationships[0],links:[{...link,studentId:id}]}]})).mockResolvedValueOnce(envelope({...value,relationships:[{...value.relationships[0],links:[{...link,token:'unexpected-secret'}]}]}));vi.stubGlobal('fetch',fetcher);
    const result=await connectedStudentsRepo.guardian(ctx,schoolId,id);expect(result.relationships[0].links?.[0]).toMatchObject({version:3,status:'active',modules:['teachers'],opens:2,lastOpenedAt:null});expect(result.relationships[0].links?.[0]).not.toHaveProperty('token');await expect(connectedStudentsRepo.guardian(ctx,schoolId,id)).rejects.toMatchObject({code:'READ_ERROR'});await expect(connectedStudentsRepo.guardian(ctx,schoolId,id)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('returns server summary and propagates server failures without fabricated zero counters',async()=>{
    const source={guardians:2,verified:1,unverified:2,revoked:1,activeLinks:null,canSeeLinks:false,canManage:false,canVerify:true};const fetcher=vi.fn().mockResolvedValueOnce(envelope(source)).mockResolvedValueOnce(new Response(JSON.stringify({code:'UNAVAILABLE'}),{status:503}));vi.stubGlobal('fetch',fetcher);
    expect(await connectedStudentsExtraRepo.guardianSummary(ctx,schoolId)).toEqual(source);await expect(connectedStudentsExtraRepo.guardianSummary(ctx,schoolId)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('rejects revoked request ownership and invalid filters before returning results',async()=>{
    const fetcher=vi.fn().mockImplementation(async()=>{authorizationChanged();return envelope(profile());});vi.stubGlobal('fetch',fetcher);const old={staffOwner:captureStaffAccess()} as Ctx;authorizationChanged();
    await expect(connectedStudentsRepo.guardian(old,schoolId,id)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).not.toHaveBeenCalled();
    await expect(connectedStudentsRepo.guardians(ctx,schoolId,{page:1,pageSize:10,filters:{verification:'made-up'}})).rejects.toMatchObject({code:'VALIDATION'});expect(fetcher).not.toHaveBeenCalled();await expect(connectedStudentsRepo.guardian(ctx,schoolId,id)).rejects.toMatchObject({code:'FORBIDDEN'});
  });
});

describe('native relationship verification commands',()=>{
  it('sends the displayed version and explicit receiving permission, separately from verification',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({...relation(),version:4,status:'VERIFIED',canReceiveInfo:false}));vi.stubGlobal('fetch',fetcher);
    const result=await connectedStudentsRepo.setVerification(ctx,schoolId,relId,'verified','Căn cứ đối chiếu',{version:3,canReceiveInfo:false});expect(result).toMatchObject({version:4,verification:'verified',canReceiveInfo:false});expect(fetcher).toHaveBeenCalledTimes(1);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({expectedVersion:3,canReceiveInfo:false,verificationNote:'Căn cứ đối chiếu'});
  });
  it('requires reviewed version and explicit receiving choice before issuing a verification request',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);await expect(connectedStudentsRepo.setVerification(ctx,schoolId,relId,'verified','Căn cứ đối chiếu',{version:0,canReceiveInfo:true})).rejects.toMatchObject({code:'CONFLICT'});await expect(connectedStudentsRepo.setVerification(ctx,schoolId,relId,'verified','Căn cứ đối chiếu',{version:3})).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{canReceiveInfo:expect.any(String)}});expect(fetcher).not.toHaveBeenCalled();
  });
  it('retries revocation with the same command key after a lost acknowledgement and propagates version conflicts',async()=>{
    const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('lost acknowledgement')).mockResolvedValueOnce(envelope({...relation(),version:4,status:'REVOKED',canReceiveInfo:false})).mockResolvedValueOnce(new Response(JSON.stringify({code:'VERSION_CONFLICT',currentVersion:8}),{status:409}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStudentsRepo.setVerification(ctx,schoolId,relId,'revoked','Thu hồi có lý do',{version:3})).rejects.toMatchObject({code:'NETWORK'});const result=await connectedStudentsRepo.setVerification(ctx,schoolId,relId,'revoked','Thu hồi có lý do',{version:3});expect(result.verification).toBe('revoked');expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({expectedVersion:3,reason:'Thu hồi có lý do'});await expect(connectedStudentsRepo.setVerification(ctx,schoolId,relId,'revoked','Lý do khác',{version:3})).rejects.toMatchObject({code:'CONFLICT',details:{currentVersion:8}});
  });
});
