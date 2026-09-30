import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedPlatformRepo,connectedPlatformExtraRepo} from '@/lib/repositories/connected/platform';
import {authenticationChanged,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

const ctx={} as Ctx,id='00000000-0000-4000-8000-000000000001';
const steps=Object.fromEntries(['profileDone','adminAssigned','yearCreated','classesCreated','teachersInvited','studentsImported','homeroomAssigned','rulesPublished'].map(k=>[k,k==='profileDone']));
const school={id,name:'Trường API',code:'API',slug:'truong-api',shortName:'API',province:'Tỉnh API',level:null,status:'DRAFT',timezone:'Asia/Ho_Chi_Minh',accentColor:'#123456',motto:'',publicIntro:'',createdAt:'2026-09-30T00:00:00Z',updatedAt:'2026-09-30T00:00:00Z',version:3,classCount:4,staffCount:8,adminNames:[],onboarding:steps};
const input={name:'Trường API',shortName:'API',code:'API',slug:'truong-api',level:'THPT' as const,province:'Tỉnh API',address:'',publicEmail:'',publicPhone:'',adminName:'Người quản trị',adminEmail:'admin@example.invalid',asDraft:false};
const envelope=(data:unknown,page?:unknown)=>new Response(JSON.stringify({data,requestId:'platform-adapter',...(page?{page}:{})}));
beforeEach(()=>{authenticationChanged();setStaffCsrf('test-csrf');});
afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});

describe('platform school adapter candidates',()=>{
  it('submits the school and first administrator once and retries the exact uncertain command',async()=>{
    const fetcher=vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(envelope(school));vi.stubGlobal('fetch',fetcher);
    await expect(connectedPlatformRepo.createSchool(ctx,input)).rejects.toMatchObject({code:'NETWORK'});
    const result=await connectedPlatformRepo.createSchool(ctx,input);expect(result.id).toBe(id);expect(result.onboarding?.adminAssigned).toBe(false);expect(fetcher).toHaveBeenCalledTimes(2);
    const first=fetcher.mock.calls[0][1],second=fetcher.mock.calls[1][1];expect(first.body).toBe(second.body);expect(first.headers['Idempotency-Key']).toBe(second.headers['Idempotency-Key']);
    expect(JSON.parse(first.body).firstAdmin).toEqual({email:'admin@example.invalid',workDisplayName:'Người quản trị',roleId:null});
  });
  it('maps nested first-admin errors back to the existing wizard without accepting a failed save',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'VALIDATION_ERROR',fieldErrors:[{path:'/firstAdmin/email',message:'Email chưa hợp lệ'}]}),{status:422})));
    await expect(connectedPlatformRepo.createSchool(ctx,input)).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{adminEmail:'Email chưa hợp lệ'}});
  });
  it('uses SQL filter/sort and whole-result provinces rather than deriving facets from the current page',async()=>{
    const fetcher=vi.fn().mockImplementation((url:string)=>Promise.resolve(url.startsWith('/api/v1/platform/school-options')?envelope({provinces:['Tỉnh khác','Tỉnh API']}):envelope([school],{limit:10,nextCursor:null,hasMore:false,total:1})));vi.stubGlobal('fetch',fetcher);
    const page=await connectedPlatformRepo.listSchools(ctx,{page:1,pageSize:10,sort:'classCount',dir:'desc',filters:{status:'draft'}});
    expect(page.provinces).toEqual(['Tỉnh khác','Tỉnh API']);expect(page.items[0]).toMatchObject({classCount:4,staffCount:8,onboardingDone:1,onboardingTotal:8,version:3,level:null});expect(fetcher.mock.calls.some(([url])=>String(url).includes('status=DRAFT&sort=classCount&dir=desc'))).toBe(true);
    fetcher.mockImplementation((url:string)=>Promise.resolve(url.includes('school-options')?envelope({provinces:[]}):envelope([{...school,onboarding:{profileDone:true}}],{limit:10,nextCursor:null,hasMore:false,total:1})));
    await expect(connectedPlatformRepo.listSchools(ctx,{})).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('requires displayed versions and human reasons without fetching a fresh version',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    await expect(connectedPlatformRepo.changeSchoolStatus(ctx,id,'suspended','Lý do')).rejects.toMatchObject({code:'CONFLICT'});
    await expect(connectedPlatformRepo.revokeSchoolAdmin(ctx,id,id,'Lý do')).rejects.toMatchObject({code:'CONFLICT'});
    await expect(connectedPlatformRepo.revokeInvitation(ctx,id,id,3)).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{reason:expect.any(String)}});expect(fetcher).not.toHaveBeenCalled();
  });
  it('sends only edited profile fields, nullable cleared contacts and the displayed version',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope(school));vi.stubGlobal('fetch',fetcher);
    await connectedPlatformRepo.updateSchoolOps(ctx,id,{version:2,publicEmail:'',address:'Địa chỉ API'});expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({expectedVersion:2,publicContactEmail:null,publicAddress:'Địa chỉ API'});
  });
  it('retains an uncertain invitation intent with server time and actual expiry choice',async()=>{
    const fetcher=vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(envelope({id,version:1,status:'PENDING',deliveryState:'QUEUED',email:input.adminEmail,expiresAt:'2026-10-07T00:00:00Z'}));vi.stubGlobal('fetch',fetcher);
    const invitation={fullName:input.adminName,email:input.adminEmail,days:7};await expect(connectedPlatformRepo.inviteSchoolAdmin(ctx,id,invitation)).rejects.toMatchObject({code:'NETWORK'});
    const result=await connectedPlatformRepo.inviteSchoolAdmin(ctx,id,invitation);expect(result.deliveryState).toBe('QUEUED');expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({email:input.adminEmail,workDisplayName:input.adminName,roleId:null,expiresInDays:7});
  });
  it('reads native identity availability and keeps unconfigured settings editable',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope({codeTaken:true,slugTaken:false})).mockResolvedValueOnce(envelope({brandName:'API',supportEmail:null,publicSupportPhone:null,footerNote:'',version:4}));vi.stubGlobal('fetch',fetcher);
    expect(await connectedPlatformExtraRepo.checkSchoolIdentity(ctx,'API','new-slug')).toEqual({codeTaken:true,slugTaken:false});expect(fetcher.mock.calls[0][0]).toBe('/api/v1/platform/school-identity?code=API&slug=new-slug');expect(await connectedPlatformRepo.settings(ctx)).toMatchObject({supportEmail:'',supportPhone:'',version:4});
  });
});
