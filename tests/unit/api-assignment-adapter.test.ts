import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedStaffRepo} from '@/lib/repositories/connected/staff';
import {authenticationChanged,authorizationChanged,captureStaffAccess,onStaffMutationAcknowledged,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

const ctx={today:'1900-01-01'} as Ctx,schoolId='00000000-0000-4000-8000-000000000001',memberId='00000000-0000-4000-8000-000000000002',classId='00000000-0000-4000-8000-000000000003';
const input={membershipId:memberId,classId,kind:'homeroom' as const,validFrom:'2026-10-01',validTo:'2026-12-31',memberVersion:8,classVersion:4};
const row={id:classId,version:2,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',memberId,classId,roleGrantId:memberId,kind:'HOMEROOM',subjectId:null,startsOn:'2026-10-01',endsOn:'2027-01-01',revokedAt:null};
const preview={memberId,memberVersion:8,classId,classVersion:4,kind:'HOMEROOM',subjectId:null,scopeName:'Lớp thật',referenceDate:'2026-10-01',startsOn:'2026-10-01',endsOn:'2027-01-01',grantStartsAt:'2026-09-30T15:00:00Z',grantEndsAt:'2026-12-31T15:00:00Z',added:['conduct.adjust.request','native.future.action'],kept:['student.read'],notIncluded:[],warnings:['Cảnh báo thật']};
const envelope=(data:unknown)=>new Response(JSON.stringify({data,requestId:'assignment-adapter'}));
beforeEach(()=>{authenticationChanged();setStaffCsrf('staff-csrf');});
afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});

describe('native assignment adapters',()=>{
  it('previews chosen dates and native action codes with CSRF but no mutation retry key or acknowledgement',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope(preview)),ack=vi.fn(),unsubscribe=onStaffMutationAcknowledged(ack);vi.stubGlobal('fetch',fetcher);
    try{const view=await connectedStaffRepo.previewAssignment(ctx,schoolId,input);expect(view).toMatchObject({scope:'Lớp thật',referenceDate:'2026-10-01',validTo:'2026-12-31',memberVersion:8,classVersion:4});expect(view.added).toEqual(preview.added);expect(view.warnings).toEqual(preview.warnings);
      const init=fetcher.mock.calls[0][1];expect(init.method).toBe('POST');expect(init.headers['X-CSRF-Token']).toBe('staff-csrf');expect(init.headers['Idempotency-Key']).toBeUndefined();expect(ack).not.toHaveBeenCalled();
      expect(JSON.parse(init.body)).toEqual({memberId,classId,kind:'HOMEROOM',startsOn:'2026-10-01',endsOn:'2027-01-01',expectedMemberVersion:8,expectedClassVersion:4});
    }finally{unsubscribe();}
  });
  it('saves both reviewed source versions, sends an exclusive end and keeps returned grant/version metadata',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope(row));vi.stubGlobal('fetch',fetcher);const view=await connectedStaffRepo.assign(ctx,schoolId,input);
    expect(fetcher.mock.calls[0][0]).toContain('/assignments');expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({expectedMemberVersion:8,expectedClassVersion:4,endsOn:'2027-01-01'});expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBeTruthy();expect(view).toMatchObject({membershipId:memberId,roleGrantId:memberId,version:2,validTo:'2026-12-31',status:'active',subjectId:null});
  });
  it('requires reviewed versions and valid subjects before sending a save request',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.assign(ctx,schoolId,{...input,memberVersion:undefined})).rejects.toMatchObject({code:'CONFLICT'});
    await expect(connectedStaffRepo.assign(ctx,schoolId,{...input,classVersion:undefined})).rejects.toMatchObject({code:'CONFLICT'});
    await expect(connectedStaffRepo.previewAssignment(ctx,schoolId,{...input,kind:'subject'})).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{subjectId:'Chọn môn.'}});expect(fetcher).not.toHaveBeenCalled();
  });
  it('revokes with the displayed assignment version without truncating historical dates to the browser clock',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({...row,version:3,revokedAt:'2026-10-01T04:00:00Z'}));vi.stubGlobal('fetch',fetcher);
    const view=await connectedStaffRepo.revokeAssignment(ctx,schoolId,classId,'Lý do thật',2);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({expectedVersion:2,reason:'Lý do thật'});expect(view).toMatchObject({status:'revoked',validFrom:'2026-10-01',validTo:'2026-12-31',version:3});
  });
  it('maps field errors and classifies failed read-only previews as read errors without fake permission results',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:'VALIDATION_ERROR',fieldErrors:[{path:'startsOn',message:'Ngày ngoài năm học'}]}),{status:422})).mockRejectedValueOnce(new TypeError('offline'));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.previewAssignment(ctx,schoolId,input)).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{validFrom:'Ngày ngoài năm học'}});
    await expect(connectedStaffRepo.previewAssignment(ctx,schoolId,input)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('preserves an unconfigured matrix and unavailable profile links instead of fabricating an academic year',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({year:null,referenceDate:'2026-10-01',subjects:[],rows:[],canAssign:false,canViewMembers:false}));vi.stubGlobal('fetch',fetcher);
    const view=await connectedStaffRepo.assignmentMatrix(ctx,schoolId);expect(view).toMatchObject({year:null,rows:[],canAssign:false,canViewMembers:false});
  });
  it('maps real matrix dates, versions, colors, nullable cells and server access flags without inferring activity',async()=>{
    const subject={id:memberId,version:2,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',name:'Môn thật',code:'M',color:'#334455',status:'ACTIVE'};
    const cell={assignmentId:classId,version:6,memberId,name:'Tên tại trường',memberStatus:'SUSPENDED',identityActive:true,roleActive:true,kind:'HOMEROOM',subjectId:null,startsOn:'2026-10-01',endsOn:'2027-01-01',grantStartsAt:'2026-09-30T15:00:00Z',grantEndsAt:'2026-12-31T15:00:00Z',accessActive:false};
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope({year:{id:schoolId,version:2,name:'Năm thật',code:'Y',startsOn:'2026-01-01',endsOn:'2027-01-01',status:'ACTIVE'},referenceDate:'2026-10-01',subjects:[subject],rows:[{classId,version:4,className:'Lớp thật',status:'ACTIVE',homeroom:cell,bySubject:{[memberId]:null},conflicts:['Xung đột thật']},{classId:memberId,version:2,className:'Lớp lịch sử',status:'ARCHIVED',homeroom:{...cell,memberStatus:'ENDED'},bySubject:{[memberId]:null},conflicts:[]}],canAssign:false,canViewMembers:false})));
    const view=await connectedStaffRepo.assignmentMatrix(ctx,schoolId,schoolId);expect(view.rows[0].homeroom).toMatchObject({membershipId:memberId,version:6,accessActive:false,memberStatus:'suspended',membershipStatus:'SUSPENDED',validTo:'2026-12-31'});expect(view.rows[1].homeroom).toMatchObject({memberStatus:'revoked',membershipStatus:'ENDED',accessActive:false});expect(view.subjects[0].color).toBe('#334455');expect(view.rows[0].bySubject[memberId]).toBeNull();expect(view.rows[0].conflicts).toEqual(['Xung đột thật']);
  });
  it('rejects obsolete render ownership before preview, save, revoke or matrix requests',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const stale={staffOwner:captureStaffAccess()} as Ctx;authorizationChanged();
    for(const work of [()=>connectedStaffRepo.previewAssignment(stale,schoolId,input),()=>connectedStaffRepo.assign(stale,schoolId,input),()=>connectedStaffRepo.revokeAssignment(stale,schoolId,classId,'Lý do',2),()=>connectedStaffRepo.assignmentMatrix(stale,schoolId)])await expect(work()).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).not.toHaveBeenCalled();
  });
});
