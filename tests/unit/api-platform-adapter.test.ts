import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedPlatformRepo,connectedPlatformExtraRepo} from '@/lib/repositories/connected/platform';
import {authenticationChanged,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';
import {refreshStaffContext} from '@/lib/api/session';
vi.mock('@/lib/api/session',()=>({refreshStaffContext:vi.fn().mockResolvedValue({platformActions:['platform.schools.read']}),serverNowISO:()=> '2026-09-30T00:00:00Z'}));

const ctx={} as Ctx,id='00000000-0000-4000-8000-000000000001';
const steps=Object.fromEntries(['profileDone','adminAssigned','yearCreated','classesCreated','teachersInvited','studentsImported','homeroomAssigned','rulesPublished'].map(k=>[k,k==='profileDone']));
const school={id,name:'Trường API',code:'API',slug:'truong-api',shortName:'API',province:'Tỉnh API',level:null,status:'DRAFT',timezone:'Asia/Ho_Chi_Minh',accentColor:'#123456',motto:'',publicIntro:'',createdAt:'2026-09-30T00:00:00Z',updatedAt:'2026-09-30T00:00:00Z',version:3,classCount:4,staffCount:8,adminNames:[],onboarding:steps};
const input={name:'Trường API',shortName:'API',code:'API',slug:'truong-api',level:'THPT' as const,province:'Tỉnh API',address:'',publicEmail:'',publicPhone:'',adminName:'Người quản trị',adminEmail:'admin@example.invalid',asDraft:false};
const envelope=(data:unknown,page?:unknown)=>new Response(JSON.stringify({data,requestId:'platform-adapter',...(page?{page}:{})}));
beforeEach(()=>{authenticationChanged();setStaffCsrf('test-csrf');vi.mocked(refreshStaffContext).mockResolvedValue({platformActions:['platform.schools.read']} as Awaited<ReturnType<typeof refreshStaffContext>>);});
afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});
it('reads grant totals and school choices from the API without deriving counters from a displayed page',async()=>{
  const grants={active:7,requested:13,expired:19,revoked:23,declined:29,inactive:31},schools=[{id,name:'Trường tổng hợp API',status:'ACTIVE'}];
  const fetcher=vi.fn().mockResolvedValue(envelope({grants,schools}));vi.stubGlobal('fetch',fetcher);
  expect(await connectedPlatformExtraRepo.grantSummary(ctx)).toEqual({grants,schools});expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe('/api/v1/platform/support-options');
});

describe('platform school adapter candidates',()=>{
  it('shows only observed operational states and actual backup records without simulated schedules',async()=>{
    const value={checkedAt:'2026-09-30T00:00:00Z',services:[{key:'worker',state:'unknown',note:'Chưa nhận heartbeat',observedAt:null},{key:'mail',state:'local',note:'Thư cục bộ',observedAt:null}],backups:[{id,kind:'BACKUP',status:'FAILED',createdAt:'2026-09-29T00:00:00Z',summary:{errorCode:'BACKUP_FAILED'}}],backupTotal:12,storageFreeBytes:null,mail:{failed:1,pending:2},store:{schema:'031-operations-health.sql',migratedAt:'2026-09-29T00:00:00Z',migrations:31,schools:2,users:60,auditEvents:34},checklist:{noAdmin:1,drafts:2,expiringAdminInvitations:3,pendingAdminInvitations:4,highTickets:5,unassignedTickets:6,activeGrants:7,requestedGrants:8}};
    const fetcher=vi.fn().mockResolvedValueOnce(envelope(value)).mockResolvedValueOnce(envelope({...value,backups:[],backupTotal:0}));vi.stubGlobal('fetch',fetcher);
    const result=await connectedPlatformExtraRepo.operations(ctx);expect(result.simulated).toBe(false);expect(result.services[0]).toMatchObject({state:'unknown',observedAt:null});expect(result.backups).toEqual([{id,kind:'BACKUP',state:'failed',at:'2026-09-29T00:00:00Z',startedAt:undefined,finishedAt:undefined,summary:{errorCode:'BACKUP_FAILED'}}]);expect(result.backupTotal).toBe(12);expect(result.store).not.toHaveProperty('seededAt');expect(result.checklist[0].count).toBe(1);expect((await connectedPlatformExtraRepo.operations(ctx)).backups).toEqual([]);expect(fetcher.mock.calls[0][0]).toBe('/api/v1/platform/operations-overview');
  });
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
  it('shows current native message counts and never creates an empty history on queue rows',async()=>{
    const ticket={id,version:5,schoolId:id,subject:'Yêu cầu API',description:'Nội dung API',status:'WAITING_SCHOOL',priority:'HIGH',requesterId:id,requesterName:'Người gửi API',schoolName:'Trường API',schoolStatus:'SUSPENDED',createdAt:'2026-09-30T00:00:00Z',updatedAt:'2026-09-30T00:00:00Z',messageCount:12};
    const fetcher=vi.fn().mockResolvedValue(envelope([ticket],{limit:10,nextCursor:null,hasMore:false,total:1}));vi.stubGlobal('fetch',fetcher);
    const page=await connectedPlatformRepo.tickets(ctx,{pageSize:10,filters:{status:'waiting_school',priority:'high'}});expect(page.items[0]).toMatchObject({messageCount:12,schoolStatus:'suspended',status:'waiting_school',version:5});expect(page.items[0]).not.toHaveProperty('updates');expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toContain('status=WAITING_SCHOOL&priority=HIGH');
  });
  it('saves message and status in one acknowledged PATCH with the original version on retry',async()=>{
    const ticket={id,version:6,schoolId:id,subject:'Yêu cầu API',description:'Nội dung API',status:'RESOLVED',priority:'HIGH',requesterId:id,requesterName:'Người gửi API',schoolName:'Trường API',schoolStatus:'ACTIVE',createdAt:'2026-09-30T00:00:00Z',updatedAt:'2026-09-30T00:00:00Z',messageCount:13};
    const fetcher=vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(envelope(ticket));vi.stubGlobal('fetch',fetcher);const command={version:5,status:'resolved' as const,text:'Hoàn tất API'};
    await expect(connectedPlatformRepo.updateTicket(ctx,id,command)).rejects.toMatchObject({code:'NETWORK'});expect((await connectedPlatformRepo.updateTicket(ctx,id,command)).version).toBe(6);
    expect(fetcher.mock.calls[0][1].method).toBe('PATCH');expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({expectedVersion:5,status:'RESOLVED',message:'Hoàn tất API'});expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);
  });
  it('requests only the chosen read actions with stable server duration and trusts native effective state',async()=>{
    const grant={id,version:1,schoolId:id,ticketId:id,operatorId:id,allowedActions:['class.read','assignment.read'],reason:'Hỗ trợ API',validFrom:'2026-09-30T00:00:00Z',validUntil:'2026-10-07T00:00:00Z',status:'APPROVED',viewStatus:'inactive',effective:false,operatorName:'Operator API',schoolName:'Trường API'};
    const fetcher=vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(envelope(grant));vi.stubGlobal('fetch',fetcher);const command={schoolId:id,ticketId:id,scopes:['class_structure' as const],reason:'Hỗ trợ API',days:7};
    await expect(connectedPlatformRepo.requestSupportGrant(ctx,command)).rejects.toMatchObject({code:'NETWORK'});const result=await connectedPlatformRepo.requestSupportGrant(ctx,command);expect(result).toMatchObject({status:'inactive',canonicalStatus:'APPROVED',effective:false,scopes:['class_structure']});
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ticketId:id,allowedActions:['class.read','assignment.read'],reason:'Hỗ trợ API',durationDays:7});expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);
    await expect(connectedPlatformRepo.requestSupportGrant(ctx,{...command,ticketId:undefined})).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{ticketId:expect.any(String)}});
  });
  it('retains unavailable platform school panels as null without borrowing admin/support/audit reads',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope(school));vi.stubGlobal('fetch',fetcher);const result=await connectedPlatformRepo.school(ctx,id);
    expect(result).toMatchObject({admins:null,invitations:null,history:null,tickets:null,activeGrants:null});expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/platform/schools/${id}`);
  });
});
