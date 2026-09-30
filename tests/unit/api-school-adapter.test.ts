import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {connectedSchoolRepo} from '@/lib/repositories/connected/school';
import type {Ctx} from '@/lib/repositories/core';
import {authenticationChanged,setStaffCsrf} from '@/lib/api/client';

vi.mock('@/lib/api/session',()=>({refreshStaffContext:vi.fn().mockResolvedValue({})}));
vi.mock('@/lib/api/permissions',()=>({uiActions:vi.fn(()=>new Set(['school.profile.edit','school.settings.edit','dictionary.manage']))}));
const schoolId='00000000-0000-4000-8000-000000000001',itemId='00000000-0000-4000-8000-000000000002';
const ctx={} as Ctx;
const envelope=(data:unknown)=>new Response(JSON.stringify({data,requestId:'adapter-test'}),{headers:{'content-type':'application/json'}});
beforeEach(()=>{authenticationChanged();setStaffCsrf('test-csrf');});
afterEach(()=>{vi.unstubAllGlobals();authenticationChanged();});

describe('school API adapter candidates',()=>{
  it('maps returned profile fields and the read version without inventing onboarding progress',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({id:schoolId,code:'API',slug:'api-school',name:'Trường từ API',shortName:'API',province:'TP.HCM',level:null,accentColor:'#123456',motto:'Học tốt',publicIntro:'Giới thiệu',publicContactEmail:'office@example.invalid',publicContactPhone:null,publicAddress:'Địa chỉ',website:'https://example.invalid',status:'ACTIVE',version:12,createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z',timezone:'Asia/Ho_Chi_Minh'}));
    vi.stubGlobal('fetch',fetcher);const result=await connectedSchoolRepo.profile(ctx,schoolId);
    expect(result.school).toMatchObject({name:'Trường từ API',publicEmail:'office@example.invalid',publicPhone:'',address:'Địa chỉ',website:'https://example.invalid',version:12,level:null});expect(result.school.onboarding).toBeUndefined();expect(result.canEdit).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects a response missing required profile fields instead of substituting mock content',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope({id:schoolId,name:'API',status:'ACTIVE',version:1})));
    await expect(connectedSchoolRepo.profile(ctx,schoolId)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('requires the version displayed by the form before modifying a dictionary',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    await expect(connectedSchoolRepo.saveDictionaryItem(ctx,schoolId,'subject',{id:itemId,name:'Toán',code:'MATH',color:'#123456'})).rejects.toMatchObject({code:'CONFLICT',details:{requiresReload:true}});
    await expect(connectedSchoolRepo.setDictionaryStatus(ctx,schoolId,'room',itemId,'inactive')).rejects.toMatchObject({code:'CONFLICT'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('validates the grade and preserves the submitted version and real field errors',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:'VALIDATION_ERROR',fieldErrors:[{path:'gradeLevel',message:'Khối không hợp lệ'}]}),{status:422}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedSchoolRepo.saveDictionaryItem(ctx,schoolId,'grade',{name:'Khối chưa rõ'})).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{level:'Khối phải từ 1 đến 12.'}});expect(fetcher).not.toHaveBeenCalled();
    await expect(connectedSchoolRepo.saveDictionaryItem(ctx,schoolId,'grade',{id:itemId,name:'Khối 6',level:6,version:3})).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{level:'Khối không hợp lệ'}});
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({name:'Khối 6',code:'6',gradeLevel:6,expectedVersion:3});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not replace a missing dictionary usage flag with false',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope([{id:itemId,code:'6',name:'Khối 6',status:'ACTIVE',version:1,gradeLevel:6}])));
    await expect(connectedSchoolRepo.dictionaries(ctx,schoolId)).rejects.toMatchObject({code:'READ_ERROR'});
  });
});
