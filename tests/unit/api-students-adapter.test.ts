import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedStudentsRepo,nativeStudent} from '@/lib/repositories/connected/students';
import {authenticationChanged,authorizationChanged,captureStaffAccess,setStaffCsrf} from '@/lib/api/client';
import type {ApiSchemas} from '@/lib/api/generated';
import type {Ctx} from '@/lib/repositories/core';

const ctx={} as Ctx,schoolId='00000000-0000-4000-8000-000000000001',classId='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003',guardianId='00000000-0000-4000-8000-000000000004';
const input={fullName:'Học sinh thật',dob:'2011-09-30',gender:'Nữ' as const,classId,startDate:'2026-10-01',guardian:{fullName:'Giám hộ thật',relation:'Mẹ' as const,phone:'0912222222'}};
const meta={id,version:1,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'};
const row=()=>({...meta,studentCode:'HS26001',fullName:input.fullName,dateOfBirth:input.dob,gender:input.gender,status:'ACTIVE' as const,preferredName:null,
  initialEnrollment:{...meta,studentId:id,classId,yearId:id,startsOn:input.startDate,endsOn:'2027-01-01',status:'ACTIVE'},initialGuardian:{...meta,id:guardianId,fullName:input.guardian.fullName,phone:input.guardian.phone,email:null,status:'ACTIVE'},
  initialRelationship:{...meta,studentId:id,guardianId,relationshipLabel:'Mẹ',isPrimary:true,canReceiveInfo:false,status:'UNVERIFIED'}});
const envelope=(data:unknown)=>new Response(JSON.stringify({data,requestId:'student-unit'}));
beforeEach(()=>{authenticationChanged();setStaffCsrf('student-csrf');});afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});

describe('native student form commands',()=>{
  it('sends one atomic command with no invented code, actor or verified guardian',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope(row()));vi.stubGlobal('fetch',fetcher);const result=await connectedStudentsRepo.create(ctx,schoolId,input);
    expect(result).toMatchObject({id,code:'HS26001',gender:'Nữ',dob:input.dob,initialRelationship:{status:'UNVERIFIED',canReceiveInfo:false}});expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({fullName:input.fullName,dateOfBirth:input.dob,gender:'Nữ',initialClassId:classId,startsOn:input.startDate,initialGuardian:{fullName:input.guardian.fullName,relationshipLabel:'Mẹ',phone:input.guardian.phone}});
  });
  it('sends the displayed edit version and actual nullable note without fetching a replacement version',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({...row(),version:5,internalNote:null}));vi.stubGlobal('fetch',fetcher);
    const result=await connectedStudentsRepo.update(ctx,schoolId,id,{fullName:input.fullName,dob:input.dob,gender:input.gender,version:4,internalNote:null});expect(result.internalNote).toBeNull();expect(fetcher).toHaveBeenCalledTimes(1);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({expectedVersion:4,gender:'Nữ',internalNote:null});
  });
  it('keeps the same uncertain command key on a manual retry after a lost creation acknowledgement',async()=>{
    const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('lost acknowledgement')).mockResolvedValueOnce(envelope(row()));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStudentsRepo.create(ctx,schoolId,input)).rejects.toMatchObject({code:'NETWORK'});await connectedStudentsRepo.create(ctx,schoolId,input);expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
  });
  it('maps native validation fields and preserves conflict failures without falling back',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:'VALIDATION_ERROR',fieldErrors:[{path:'initialGuardian.phone',message:'Sai điện thoại'},{path:'dateOfBirth',message:'Sai ngày'}]}),{status:422})).mockResolvedValueOnce(new Response(JSON.stringify({code:'VERSION_CONFLICT',currentVersion:8}),{status:409}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStudentsRepo.create(ctx,schoolId,input)).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{'guardian.phone':'Sai điện thoại',dob:'Sai ngày'}});await expect(connectedStudentsRepo.update(ctx,schoolId,id,{...input,version:3})).rejects.toMatchObject({code:'CONFLICT',details:{currentVersion:8}});
  });
  it('keeps unknown source gender/birthdate null, while commands require an explicit reviewed gender',async()=>{
    expect(nativeStudent({...row(),gender:null,dateOfBirth:null} as ApiSchemas['Student'],schoolId)).toMatchObject({gender:null,dob:null});const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    await expect(connectedStudentsRepo.create(ctx,schoolId,{...input,gender:undefined as unknown as 'Nam'})).rejects.toMatchObject({code:'VALIDATION'});await expect(connectedStudentsRepo.update(ctx,schoolId,id,{...input,version:undefined as unknown as number})).rejects.toMatchObject({code:'CONFLICT'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects an incomplete or changed acknowledgement and stops callbacks owned by revoked access',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope({...row(),gender:null})).mockResolvedValueOnce(envelope({...row(),initialEnrollment:undefined}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStudentsRepo.create(ctx,schoolId,input)).rejects.toMatchObject({code:'NETWORK'});await expect(connectedStudentsRepo.create(ctx,schoolId,input)).rejects.toMatchObject({code:'NETWORK'});
    const old={staffOwner:captureStaffAccess()} as Ctx;authorizationChanged();await expect(connectedStudentsRepo.create(old,schoolId,input)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockImplementationOnce(async()=>{authorizationChanged();return envelope(row());});await expect(connectedStudentsRepo.create(ctx,schoolId,input)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
