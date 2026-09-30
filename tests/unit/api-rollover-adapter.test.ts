import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {connectedSchoolRepo} from '@/lib/repositories/connected/school';
import {authenticationChanged,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

const schoolId='00000000-0000-4000-8000-000000000001',sourceId='00000000-0000-4000-8000-000000000002',targetId='00000000-0000-4000-8000-000000000003',classId='00000000-0000-4000-8000-000000000004',targetClassId='00000000-0000-4000-8000-000000000005',studentId='00000000-0000-4000-8000-000000000006',batchId='00000000-0000-4000-8000-000000000007';
const ctx={} as Ctx,decision=[{studentId,fromClassId:classId,action:'promote' as const,targetClassId}];
const envelope=(data:unknown)=>new Response(JSON.stringify({data,requestId:'rollover-test'}));
const batch=(status:'DRAFT'|'VALIDATED'|'APPLIED',version:number,hash='a'.repeat(64))=>({id:batchId,sourceYearId:sourceId,targetYearId:targetId,plan:[{decision:'PROMOTED',toClassId:targetClassId,fromClassId:classId,studentId}],status,version,...(status==='DRAFT'?{}:{planHash:hash}),warnings:['Cần phê duyệt phân công riêng.']});
const run=()=>connectedSchoolRepo.rolloverApply(ctx,schoolId,sourceId,targetId,decision);
beforeEach(()=>{authenticationChanged();setStaffCsrf('test-csrf');});
afterEach(()=>{vi.unstubAllGlobals();authenticationChanged();});

describe('rollover command acknowledgement',()=>{
  it('uses one scoped preview response and preserves nullable grade metadata and actual end-year date',async()=>{
    const year={id:sourceId,name:'2026–2027',code:'2026-2027',startsOn:'2026-09-01',endsOn:'2027-06-01',status:'ARCHIVED',version:2};
    const fetcher=vi.fn().mockResolvedValue(envelope({source:year,referenceDate:'2027-05-31',sourceClasses:[{id:classId,name:'10A1',gradeLevel:null,students:[{id:studentId,studentCode:'API001',fullName:'Học sinh API',status:'ACTIVE',dateOfBirth:'unexpected-private'}]}],targets:[{year:{...year,id:targetId,status:'DRAFT'},classes:[{id:targetClassId,name:'11A1',gradeLevelId:classId,studentCount:3}]}],grades:[{id:classId,name:'Khối chưa cấu hình',code:'X',status:'ACTIVE',gradeLevel:null,version:1}]}));vi.stubGlobal('fetch',fetcher);
    const result=await connectedSchoolRepo.rolloverPreview(ctx,schoolId,sourceId);expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toContain(`/academic-years/${sourceId}/rollover-preview`);expect(result.referenceDate).toBe('2027-05-31');expect(result.classes[0].gradeLevel).toBeNull();expect(result.classes[0].students[0]).toEqual({id:studentId,code:'API001',fullName:'Học sinh API',status:'studying'});expect(result.targets[0].classes[0].size).toBe(3);
  });
  it('retains the create key after a lost body, then uses the acknowledged ID/version/hash for later steps',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>{throw new Error('lost response');}}).mockResolvedValueOnce(envelope(batch('DRAFT',1))).mockResolvedValueOnce(envelope(batch('VALIDATED',2))).mockResolvedValueOnce(envelope(batch('APPLIED',3)));vi.stubGlobal('fetch',fetcher);
    await expect(run()).rejects.toMatchObject({code:'NETWORK'});expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(run()).resolves.toMatchObject({enrolled:1,left:0,warnings:['Cần phê duyệt phân công riêng.']});expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({expectedVersion:1});expect(JSON.parse(fetcher.mock.calls[3][1].body)).toEqual({expectedVersion:2,previewHash:'a'.repeat(64)});
    await expect(run()).resolves.toMatchObject({enrolled:1,left:0});expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it.each(['validate','commit'])('retries only the uncertain %s stage with its same key and body',async(stage)=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope(batch('DRAFT',1)));
    if(stage==='validate')fetcher.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce(envelope(batch('VALIDATED',2))).mockResolvedValueOnce(envelope(batch('APPLIED',3)));
    else fetcher.mockResolvedValueOnce(envelope(batch('VALIDATED',2))).mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce(envelope(batch('APPLIED',3)));
    vi.stubGlobal('fetch',fetcher);await expect(run()).rejects.toMatchObject({code:'NETWORK'});const failedIndex=stage==='validate'?1:2;
    await expect(run()).resolves.toMatchObject({enrolled:1,left:0});expect(fetcher).toHaveBeenCalledTimes(4);expect(fetcher.mock.calls[failedIndex][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[failedIndex+1][1].headers['Idempotency-Key']);expect(fetcher.mock.calls[failedIndex][1].body).toBe(fetcher.mock.calls[failedIndex+1][1].body);
    expect(fetcher.mock.calls.filter(([url])=>String(url).endsWith('/rollovers'))).toHaveLength(1);
  });
  it('returns a stale preview conflict and only revalidates when the user retries, without creating another batch',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope(batch('DRAFT',1))).mockResolvedValueOnce(envelope(batch('VALIDATED',2))).mockResolvedValueOnce(new Response(JSON.stringify({code:'STALE_PREVIEW'}),{status:409})).mockResolvedValueOnce(envelope(batch('VALIDATED',3,'b'.repeat(64)))).mockResolvedValueOnce(envelope(batch('APPLIED',4,'b'.repeat(64))));vi.stubGlobal('fetch',fetcher);
    await expect(run()).rejects.toMatchObject({code:'CONFLICT',details:{problemCode:'STALE_PREVIEW'}});expect(fetcher).toHaveBeenCalledTimes(3);await expect(run()).resolves.toMatchObject({enrolled:1});expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher.mock.calls[1][1].headers['Idempotency-Key']).not.toBe(fetcher.mock.calls[3][1].headers['Idempotency-Key']);expect(JSON.parse(fetcher.mock.calls[3][1].body)).toEqual({expectedVersion:2});expect(JSON.parse(fetcher.mock.calls[4][1].body)).toEqual({expectedVersion:3,previewHash:'b'.repeat(64)});
  });
  it('stops between acknowledged stages when authentication changes',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>{authenticationChanged();return {data:batch('DRAFT',1),requestId:'changed'};}});vi.stubGlobal('fetch',fetcher);
    await expect(run()).rejects.toMatchObject({code:'NO_SESSION'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects missing source classes, duplicate students and a substituted acknowledgement plan',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({...batch('DRAFT',1),plan:[{studentId:classId,fromClassId:classId,toClassId:targetClassId,decision:'PROMOTED'}]}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedSchoolRepo.rolloverApply(ctx,schoolId,sourceId,targetId,[{studentId,action:'leave'}])).rejects.toMatchObject({code:'CONFLICT'});await expect(connectedSchoolRepo.rolloverApply(ctx,schoolId,sourceId,targetId,[...decision,...decision])).rejects.toMatchObject({code:'VALIDATION'});expect(fetcher).not.toHaveBeenCalled();await expect(run()).rejects.toMatchObject({code:'NETWORK'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
