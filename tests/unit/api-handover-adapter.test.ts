import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedStaffRepo} from '@/lib/repositories/connected/staff';
import {authenticationChanged,authorizationChanged,captureStaffAccess,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

const ctx={} as Ctx,schoolId='00000000-0000-4000-8000-000000000001',classId='00000000-0000-4000-8000-000000000002',sourceId='00000000-0000-4000-8000-000000000003',memberId='00000000-0000-4000-8000-000000000004',requestId='00000000-0000-4000-8000-000000000005',handoverId='00000000-0000-4000-8000-000000000006',assignmentId='00000000-0000-4000-8000-000000000007';
const hash='a'.repeat(64),checklist={pendingConduct:2,openWeeks:1,pendingAdjustments:0,pendingEvidence:3,draftAnnouncements:1,activeLinks:4};
const input={classId,toMembershipId:memberId,effectiveDate:'2026-10-02',note:'Lý do thật',clientRequestId:requestId,fromAssignmentId:sourceId,fromAssignmentVersion:3,classVersion:8,toMemberVersion:6,previewHash:hash};
const receipt=(status='SUBMITTED',version=1,previewHash=hash)=>({id:handoverId,version,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',classId,fromAssignmentId:sourceId,toMemberId:memberId,effectiveOn:input.effectiveDate,reason:input.note,status,clientRequestId:requestId,previewHash,checklist,appliedAt:status==='APPLIED'?'2026-10-01T01:00:00Z':null,appliedAssignmentId:status==='APPLIED'?assignmentId:null,appliedAssignment:status==='APPLIED'?{id:assignmentId,version:1,createdAt:'2026-10-01T01:00:00Z',updatedAt:'2026-10-01T01:00:00Z',classId,memberId,roleGrantId:assignmentId,kind:'HOMEROOM',startsOn:input.effectiveDate,endsOn:'2027-01-01',revokedAt:null}:null});
const envelope=(data:unknown)=>new Response(JSON.stringify({data,requestId:'handover-unit'}));
const missing=()=>new Response(JSON.stringify({code:'RESOURCE_NOT_FOUND'}),{status:404});
beforeEach(()=>{authenticationChanged();setStaffCsrf('handover-csrf');});
afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});

describe('durable native handover adapters',()=>{
  it('creates and approves reviewed sources with explicit stable stage keys, reporting only the actual applied assignment',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(missing()).mockResolvedValueOnce(envelope(receipt())).mockResolvedValueOnce(envelope(receipt('APPLIED',2)));vi.stubGlobal('fetch',fetcher);
    const result=await connectedStaffRepo.handover(ctx,schoolId,input);expect(result).toMatchObject({id:assignmentId,version:1,handoverId,handoverVersion:2,validFrom:'2026-10-02',validTo:'2026-12-31',checklist});
    const create=fetcher.mock.calls[1][1],approve=fetcher.mock.calls[2][1];expect(JSON.parse(create.body)).toMatchObject({clientRequestId:requestId,expectedClassVersion:8,expectedFromAssignmentVersion:3,expectedToMemberVersion:6,previewHash:hash});expect(JSON.parse(approve.body)).toEqual({expectedVersion:1,previewHash:hash});expect(create.headers['Idempotency-Key']).toBe(requestId+':handover:create');expect(approve.headers['Idempotency-Key']).toBe(requestId+':handover:approve:1');
  });
  it('recovers a submitted receipt after lost creation acknowledgement without creating another row',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(missing()).mockRejectedValueOnce(new TypeError('lost create response')).mockResolvedValueOnce(envelope(receipt())).mockResolvedValueOnce(envelope(receipt('APPLIED',2)));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.handover(ctx,schoolId,input)).rejects.toMatchObject({code:'NETWORK'});await connectedStaffRepo.handover(ctx,schoolId,input);
    expect(fetcher.mock.calls.filter(([,init])=>init.method==='POST'&&!JSON.parse(init.body).expectedVersion)).toHaveLength(1);expect(fetcher.mock.calls[3][0]).toContain('/approve');
  });
  it('recovers an applied durable receipt after lost approval acknowledgement and sends no additional commands',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope(receipt())).mockRejectedValueOnce(new TypeError('lost approval response')).mockResolvedValueOnce(envelope(receipt('APPLIED',2)));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.handover(ctx,schoolId,input)).rejects.toMatchObject({code:'NETWORK'});expect((await connectedStaffRepo.handover(ctx,schoolId,input)).id).toBe(assignmentId);expect(fetcher.mock.calls.map(([,init])=>init.method)).toEqual(['GET','POST','GET']);
  });
  it('reviews an existing pending row only with newly supplied reviewed hash/versions and uses the acknowledged review version',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope(receipt('SUBMITTED',2,'b'.repeat(64)))).mockResolvedValueOnce(envelope(receipt('SUBMITTED',3))).mockResolvedValueOnce(envelope(receipt('APPLIED',4)));vi.stubGlobal('fetch',fetcher);await connectedStaffRepo.handover(ctx,schoolId,input);
    expect(fetcher.mock.calls[1][0]).toContain('/review');expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({expectedVersion:2,previewHash:hash,expectedToMemberVersion:6});expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({expectedVersion:3,previewHash:hash});
  });
  it('does not fabricate a success from a foreign receipt, stale approval or missing applied assignment',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope({...receipt(),toMemberId:schoolId})).mockResolvedValueOnce(envelope(receipt())).mockResolvedValueOnce(new Response(JSON.stringify({code:'STALE_PREVIEW'}),{status:409})).mockResolvedValueOnce(envelope({...receipt('APPLIED',2),appliedAssignment:null}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.handover(ctx,schoolId,input)).rejects.toMatchObject({code:'NETWORK'});await expect(connectedStaffRepo.handover(ctx,schoolId,input)).rejects.toMatchObject({code:'CONFLICT',details:{problemCode:'STALE_PREVIEW'}});await expect(connectedStaffRepo.handover(ctx,schoolId,input)).rejects.toMatchObject({code:'NETWORK'});expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('retains chosen preview dates, real null current teacher and actual open counts without demo-clock substitution',async()=>{
    const view={className:'Lớp thật',classVersion:8,referenceDate:'2026-10-01',effectiveOn:input.effectiveDate,canHandover:true,current:null,openItems:checklist,previewHash:null,toMemberVersion:null},fetcher=vi.fn().mockResolvedValue(envelope(view));vi.stubGlobal('fetch',fetcher);
    expect(await connectedStaffRepo.handoverPreview(ctx,schoolId,classId,{effectiveDate:input.effectiveDate})).toEqual(view);expect(fetcher.mock.calls[0][0]).toContain('effectiveOn=2026-10-02');expect(fetcher.mock.calls[0][1].method).toBe('GET');
  });
  it('keeps approval field errors on the existing form fields without reporting success',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope(receipt())).mockResolvedValueOnce(new Response(JSON.stringify({code:'VALIDATION_ERROR',fieldErrors:[{path:'effectiveOn',message:'Khoảng hiệu lực đã thay đổi'},{path:'toMemberId',message:'Nhân sự nhận chưa hoạt động'}]}),{status:422}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.handover(ctx,schoolId,input)).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{effectiveDate:'Khoảng hiệu lực đã thay đổi',toMembershipId:'Nhân sự nhận chưa hoạt động'}});expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects missing source versions and old render ownership before network work, and stops after mid-flow revocation',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.handover(ctx,schoolId,{...input,classVersion:undefined as unknown as number})).rejects.toMatchObject({code:'CONFLICT'});const stale={staffOwner:captureStaffAccess()} as Ctx;authorizationChanged();await expect(connectedStaffRepo.handover(stale,schoolId,input)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockImplementationOnce(async()=>{authorizationChanged();return envelope(receipt());});await expect(connectedStaffRepo.handover(ctx,schoolId,input)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
