import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedStudentsRepo as repo} from '@/lib/repositories/connected/students';
import {authenticationChanged,authorizationChanged,captureStaffAccess,onStaffMutationAcknowledged,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

const schoolId='60000000-0000-4000-8000-000000000001',yearId='60000000-0000-4000-8000-000000000002',studentId='60000000-0000-4000-8000-000000000003',classId='60000000-0000-4000-8000-000000000004',relationshipId='60000000-0000-4000-8000-000000000005',guardianId='60000000-0000-4000-8000-000000000006',accessId='60000000-0000-4000-8000-000000000007',otherId='60000000-0000-4000-8000-000000000008';
const ctx={} as Ctx,stamp='2026-10-01T00:00:00Z',base=`/api/v1/schools/${schoolId}`;
const source=()=>({version:4,studentId,yearId,relationshipId});
const row=()=>({id:accessId,version:4,createdAt:stamp,updatedAt:stamp,studentId,studentVersion:3,studentName:'Học sinh API',studentCode:'HS001',studentStatus:'ACTIVE',yearId,yearName:'2026–2027',yearStatus:'ACTIVE',classId,classVersion:2,className:'Lớp API',enrollmentInEffect:true,relationshipId,relationshipVersion:6,relationshipLabel:'Mẹ',relationshipStatus:'VERIFIED',canReceiveInfo:true,relationshipRevokedAt:null,guardianId,guardianVersion:7,guardianName:'Giám hộ API',allowedSections:['overview','teachers','duties'],allowDownload:false,expiresAt:'2026-11-01T00:00:00Z',revokedAt:null,revokeReason:null,issuedBy:guardianId,issuedByName:null,status:'ACTIVE',opens:42,lastOpenedAt:stamp,canIssue:false,canRevoke:false,canPreview:false});
const summary=()=>({today:'2026-10-01',kpi:{total:10,active:7,expired:2,revoked:1},canIssue:false,classes:[{id:classId,version:2,name:'Lớp API',yearId,yearName:'2026–2027'}]});
const details=()=>({access:row(),today:'2026-10-01',canViewContact:false,phoneMasked:null,revokedByName:null,replacedById:null,siblings:{items:[],hasMore:false,total:0}});
const receipt=()=>({id:accessId,version:5,studentId,yearId,relationshipId,revokedAt:stamp,revokeReason:'Đề nghị thu hồi'});
const event=(id=otherId)=>({id,accessLinkId:accessId,eventKind:'READ',occurredAt:stamp,section:null,deviceSummary:null});
const envelope=(data:unknown,page?:unknown)=>new Response(JSON.stringify({data,requestId:'parent-access-unit',...(page?{page}:{})}));
const pageInfo=(total=1,hasMore=false,nextCursor:string|null=null)=>({limit:10,total,hasMore,nextCursor});
beforeEach(()=>{authenticationChanged();setStaffCsrf('unit-csrf');});afterEach(()=>vi.unstubAllGlobals());

describe('Native staff parent-link directory and history',()=>{
  it('uses only purpose metadata, server filters/sorts, own classes and independent counts/capabilities',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope(summary())).mockResolvedValueOnce(envelope([row()],pageInfo()));vi.stubGlobal('fetch',fetcher);
    const value=await repo.accessList(ctx,schoolId,{q:'Tên %_',page:1,pageSize:10,sort:'student',dir:'asc',filters:{status:'active',studentId,yearId,classId}});
    expect(value.kpi).toEqual(summary().kpi);expect(value.total).toBe(1);expect(value.items[0]).toMatchObject({opens:42,modules:['teachers','duties'],canRevoke:false});expect(value.classes).toEqual(summary().classes);
    expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[0][0]).toBe(`${base}/parent-access-directory-summary`);
    const url=new URL(fetcher.mock.calls[1][0],'http://unit');expect(Object.fromEntries(url.searchParams)).toEqual({q:'Tên %_',status:'ACTIVE',classId,yearId,studentId,sort:'studentName',dir:'asc',limit:'10'});
  });
  it('rejects invented KPI success, bad filters and credential/contact metadata',async()=>{
    for(const value of [{...summary(),kpi:{total:10,active:10}},{...summary(),canIssue:undefined}]){vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope(value)));await expect(repo.accessList(ctx,schoolId,{})).rejects.toMatchObject({code:'READ_ERROR'});}
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);await expect(repo.accessList(ctx,schoolId,{filters:{status:'other'}})).rejects.toMatchObject({code:'VALIDATION'});expect(fetcher).not.toHaveBeenCalled();
    for(const extra of [{tokenHash:'secret'},{phone:'0912345678'},{dateOfBirth:'2011-09-01'},{allowedSections:['overview','other']},{opens:-1}]){vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope({...details(),access:{...row(),...extra}})));await expect(repo.access(ctx,schoolId,accessId)).rejects.toMatchObject({code:'READ_ERROR'});}
  });
  it('preserves denied contact and actual sibling bounds; rejects another link, unmasked contact and fabricated sibling totals',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope(details())));const value=await repo.access(ctx,schoolId,accessId);expect(value.guardian.phoneMasked).toBeNull();expect(value.canViewContact).toBe(false);expect(value.access.opens).toBe(42);expect(value.replacedBy).toBeNull();expect(value).not.toHaveProperty('logs');
    for(const bad of [{...details(),access:{...row(),id:otherId}},{...details(),phoneMasked:'091***678'},{...details(),canViewContact:true,phoneMasked:'0912345678'},{...details(),siblings:{items:[],hasMore:true,total:0}},{...details(),siblings:{items:[{id:accessId,status:'ACTIVE'}],hasMore:false,total:1}}]){vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope(bad)));await expect(repo.access(ctx,schoolId,accessId)).rejects.toMatchObject({code:'READ_ERROR'});}
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope({...details(),canViewContact:true,phoneMasked:'091***678'})));expect((await repo.access(ctx,schoolId,accessId)).guardian.phoneMasked).toBe('091***678');
  });
  it('keeps explicit null event fields and pages by the selected link cursor, without inventing unique people or devices',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope([event()],pageInfo(11,true,'next-history'))).mockResolvedValueOnce(envelope([event(guardianId)],pageInfo(11)));vi.stubGlobal('fetch',fetcher);
    const first=await repo.accessEvents(ctx,schoolId,accessId,{page:1,pageSize:10}),second=await repo.accessEvents(ctx,schoolId,accessId,{page:2,pageSize:10});expect(first.items[0]).toMatchObject({at:stamp,module:null,device:null,accessId});expect(second.total).toBe(11);expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[1][0]).toContain('cursor=next-history');expect(fetcher.mock.calls[1][0]).toContain('sort=occurredAt&dir=desc');
  });
  it('rejects a foreign event, absent nullable fields and private IP metadata',async()=>{
    const missing:Record<string,unknown>={...event()};delete missing.deviceSummary;for(const bad of [{...event(),accessLinkId:otherId},missing,{...event(),ipDailyHash:'private'}]){vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope([bad],pageInfo())));await expect(repo.accessEvents(ctx,schoolId,accessId,{})).rejects.toMatchObject({code:'READ_ERROR'});}
  });
});
describe('Native parent-link revocation acknowledgement',()=>{
  it('sends the displayed version and human reason directly; missing versions and reasons perform no HTTP',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope(receipt()));vi.stubGlobal('fetch',fetcher);expect(await repo.revokeAccess(ctx,schoolId,accessId,' Đề nghị thu hồi ',source())).toEqual({id:accessId,version:5,revokedAt:stamp,revokeReason:'Đề nghị thu hồi'});expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe(`${base}/parent-access/${accessId}/revoke`);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({expectedVersion:4,reason:'Đề nghị thu hồi'});
    fetcher.mockClear();await expect(repo.revokeAccess(ctx,schoolId,accessId,'Đề nghị thu hồi',{...source(),version:undefined as unknown as number})).rejects.toMatchObject({code:'CONFLICT'});await expect(repo.revokeAccess(ctx,schoolId,accessId,'',source())).rejects.toMatchObject({code:'VALIDATION'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('retains the same uncertain key and emits mutation only after validating source, advanced version, date and exact reason',async()=>{
    const bad=[{...receipt(),id:otherId},{...receipt(),version:4},{...receipt(),yearId:otherId},{...receipt(),studentId:otherId},{...receipt(),relationshipId:otherId},{...receipt(),revokeReason:null},{...receipt(),revokedAt:'invalid'},{...receipt(),token:'secret'}];
    const fetcher=vi.fn();for(const value of bad)fetcher.mockResolvedValueOnce(envelope(value));fetcher.mockResolvedValueOnce(envelope(receipt()));vi.stubGlobal('fetch',fetcher);let changes=0;const stop=onStaffMutationAcknowledged(()=>changes++);
    try{for(let index=0;index<bad.length;index++){await expect(repo.revokeAccess(ctx,schoolId,accessId,'Đề nghị thu hồi',source())).rejects.toMatchObject({code:'NETWORK'});expect(changes).toBe(0);}await repo.revokeAccess(ctx,schoolId,accessId,'Đề nghị thu hồi',source());expect(changes).toBe(1);expect(new Set(fetcher.mock.calls.map(call=>call[1].headers['Idempotency-Key'])).size).toBe(1);}finally{stop();}
  });
  it('does not refresh a conflict version and refuses a command owned by revoked authorization',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'VERSION_CONFLICT'}),{status:409}));vi.stubGlobal('fetch',fetcher);await expect(repo.revokeAccess(ctx,schoolId,accessId,'Đề nghị thu hồi',source())).rejects.toMatchObject({code:'CONFLICT'});expect(fetcher).toHaveBeenCalledTimes(1);
    const old={staffOwner:captureStaffAccess()} as Ctx;authorizationChanged();await expect(repo.revokeAccess(old,schoolId,accessId,'Đề nghị thu hồi',source())).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
