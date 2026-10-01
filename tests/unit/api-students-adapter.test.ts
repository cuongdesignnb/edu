import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedStudentsRepo,nativeStudent} from '@/lib/repositories/connected/students';
import {connectedStudentsExtraRepo} from '@/lib/repositories/connected/students-extra';
import {authenticationChanged,authorizationChanged,captureStaffAccess,onStaffMutationAcknowledged,setStaffCsrf} from '@/lib/api/client';
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

const year={id,version:2,name:'Năm nguồn thật',status:'ACTIVE',startsOn:'2026-01-01',endsOn:'2027-01-01'};
const summary=()=>({year,referenceDate:'2026-10-01',today:'2026-10-01',years:[year],classes:[{id:classId,version:3,yearId:id,name:'Lớp nguồn thật',status:'ACTIVE'}],kpi:{students:2,studying:1,unverified:null,activeLinks:null},canSeeGuardians:false,canSeeLinks:false,canCreate:false,canTransfer:false,canExport:false});
const dirRow=()=>({...meta,studentCode:'SOURCE',fullName:'Tên nguồn thật',dateOfBirth:null,gender:null,status:'LEFT',enrollmentId:guardianId,enrollmentVersion:3,classId,className:'Lớp nguồn thật',yearId:id,yearName:year.name,enrollmentInEffect:false,guardianCount:null,verifiedGuardians:null,activeLinks:null});
const pageEnvelope=(data:unknown[],total:number)=>new Response(JSON.stringify({data,requestId:'directory-unit',page:{limit:10,nextCursor:null,hasMore:false,total}}));
const profile=()=>({student:{...row(),dateOfBirth:null,gender:null,initialGuardian:undefined,initialRelationship:undefined,initialEnrollment:undefined},level:'FULL',today:'2026-10-01',year,referenceDate:'2026-10-01',selectedEnrollment:null,history:[],group:null,positions:[],relationships:null,links:null,accessLog:null,accessLogHasMore:null,internalNote:null,
  perms:{edit:false,transfer:false,seeGuardians:false,editGuardians:false,verifyGuardians:false,manageLinks:false,issueLinks:false,revokeLinks:false,seeInternalNote:false,seeBirthDate:true}});
describe('native student directory and profile candidates',()=>{
  it('keeps an active enrollment through its inclusive last day and distinguishes future and cancelled history at the actual reference',async()=>{
    const history={...meta,studentId:id,classId,yearId:id,className:'Lớp nguồn thật',yearName:year.name,yearStatus:'ACTIVE',homeroomName:null,startsOn:'2026-09-01',endsOn:'2026-10-02',status:'ACTIVE'};
    const fetcher=vi.fn().mockResolvedValueOnce(envelope({...profile(),history:[{...history,referenceDate:'2026-10-01'},{...history,referenceDate:'2026-10-02'},{...history,startsOn:'2026-10-03',endsOn:'2026-10-10',referenceDate:'2026-10-01'},{...history,status:'CANCELLED',referenceDate:'2026-10-01'}]}));vi.stubGlobal('fetch',fetcher);
    const value=await connectedStudentsRepo.profile(ctx,schoolId,id);expect(value.history.map(h=>({viewStatus:h.viewStatus,endDate:h.endDate,referenceDate:h.referenceDate}))).toEqual([{viewStatus:'in-effect',endDate:'2026-10-01',referenceDate:'2026-10-01'},{viewStatus:'ended',endDate:'2026-10-01',referenceDate:'2026-10-02'},{viewStatus:'planned',endDate:'2026-10-09',referenceDate:'2026-10-01'},{viewStatus:'cancelled',endDate:'2026-10-01',referenceDate:'2026-10-01'}]);
  });

  it('sends filters to the SQL directory and retrieves only identifiers for selection across pages',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope(summary())).mockResolvedValueOnce(pageEnvelope([dirRow()],2)).mockResolvedValueOnce(new Response(JSON.stringify({data:[{id},{id:guardianId}],requestId:'ids-unit',page:{limit:100,nextCursor:null,hasMore:false,total:2}})));vi.stubGlobal('fetch',fetcher);
    const result=await connectedStudentsRepo.list(ctx,schoolId,{page:1,pageSize:10,q:'dang',sort:'name',dir:'desc',filters:{status:'left',classId}});
    expect(result.items[0]).toMatchObject({code:'SOURCE',dob:null,gender:null,status:'left',nativeStatus:'LEFT',guardianCount:null,activeLinks:null,enrollmentVersion:3,enrollmentInEffect:false});expect(result.allIds).toEqual([id,guardianId]);expect(result.kpi.unverified).toBeNull();expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[1][0])).toContain('student-directory?');const url=new URL(String(fetcher.mock.calls[1][0]),'http://localhost');expect(Object.fromEntries(url.searchParams)).toMatchObject({yearId:id,classId,status:'LEFT',q:'dang',sort:'fullName',dir:'desc'});expect(String(fetcher.mock.calls[2][0])).toContain('student-directory/ids?');
  });
  it('retains nullable source fields and distinguishes an ended class from an effective current enrollment',async()=>{
    const ended={...row().initialEnrollment,status:'ENDED',startsOn:'2026-01-01',endsOn:'2026-09-01',className:'Lớp đã rời thật',yearName:year.name,yearStatus:'ACTIVE',referenceDate:'2026-10-01',inEffect:false,homeroomName:null};
    const fetcher=vi.fn().mockResolvedValue(envelope({...profile(),selectedEnrollment:ended,history:[ended]}));vi.stubGlobal('fetch',fetcher);const result=await connectedStudentsRepo.profile(ctx,schoolId,id,classId,year.id);
    expect(result.currentClass).toBeNull();expect(result.lastClass).toMatchObject({name:'Lớp đã rời thật',homeroom:null,enrollmentVersion:1});expect(result.student).toMatchObject({dob:null,gender:null});expect(result.student).not.toHaveProperty('internalNote');expect(result.relationships).toBeNull();expect(result.accessLog).toBeNull();expect(result.history[0].endDate).toBe('2026-08-31');expect(result.history[0].endsOn).toBe('2026-09-01');expect(String(fetcher.mock.calls[0][0])).toContain('yearId='+id);
  });
  it('keeps link metadata and native event names without creating a readable existing token',async()=>{
    const v=profile(),link={...meta,studentId:id,yearId:id,relationshipId:guardianId,allowedSections:['overview','teachers'],allowDownload:false,expiresAt:'2026-10-02T00:00:00Z',revokedAt:null,revokeReason:null,issuedBy:id,issuedByName:null,guardianName:'Giám hộ thật',relationshipLabel:'Mẹ',yearName:year.name,status:'ACTIVE',opens:4,lastOpenedAt:'2026-10-01T00:00:00Z'};
    const fetcher=vi.fn().mockResolvedValue(envelope({...v,perms:{...v.perms,manageLinks:true},links:[link],accessLog:[{id,accessLinkId:id,eventKind:'READ',occurredAt:'2026-10-01T00:00:00Z',deviceSummary:null,section:'teachers',guardianName:'Giám hộ thật',relationshipLabel:'Mẹ'}],accessLogHasMore:true}));vi.stubGlobal('fetch',fetcher);const result=await connectedStudentsRepo.profile(ctx,schoolId,id);
    expect(result.links?.[0]).toMatchObject({status:'active',opens:4,modules:['teachers'],issuedByName:null});expect(result.links?.[0]).not.toHaveProperty('token');expect(result.links?.[0]).not.toHaveProperty('link');expect(result.accessLog?.[0]).toMatchObject({event:'READ',device:null});expect(result.accessLogHasMore).toBe(true);
  });
  it('rejects a foreign link or a raw credential in stored metadata before exposing the projection',async()=>{
    const link={...meta,studentId:id,yearId:id,relationshipId:guardianId,allowedSections:['overview'],allowDownload:false,expiresAt:'2026-10-02T00:00:00Z',revokedAt:null,revokeReason:null,issuedBy:id,issuedByName:null,guardianName:'Giám hộ thật',relationshipLabel:'Mẹ',yearName:year.name,status:'ACTIVE',opens:0,lastOpenedAt:null};
    const fetcher=vi.fn();for(const wrong of [{...link,studentId:guardianId},{...link,token:'must-not-enter-cache'},{...link,tokenHash:'must-not-enter-cache'},{...link,link:'must-not-enter-cache'}])fetcher.mockResolvedValueOnce(envelope({...profile(),perms:{...profile().perms,manageLinks:true},links:[wrong],accessLog:[],accessLogHasMore:false}));vi.stubGlobal('fetch',fetcher);
    for(let i=0;i<4;i++)await expect(connectedStudentsRepo.profile(ctx,schoolId,id)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('rejects mismatched or incomplete projections and denied private panels instead of fabricating data',async()=>{
    const v=profile(),fetcher=vi.fn().mockResolvedValueOnce(envelope({...v,student:{...v.student,id:guardianId}})).mockResolvedValueOnce(envelope({...v,student:{...v.student,gender:undefined}})).mockResolvedValueOnce(envelope({...v,relationships:[]})).mockResolvedValueOnce(envelope({...v,perms:{...v.perms,seeGuardians:true}})).mockResolvedValueOnce(envelope({...v,student:{...v.student,internalNote:'Nội dung ngoài quyền'}}));vi.stubGlobal('fetch',fetcher);
    for(let i=0;i<5;i++)await expect(connectedStudentsRepo.profile(ctx,schoolId,id)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('propagates API failures and stops composite reads owned by revoked access before the next request',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:'DEPENDENCY_UNAVAILABLE'}),{status:503})).mockImplementationOnce(async()=>{authorizationChanged();return envelope(summary());});vi.stubGlobal('fetch',fetcher);
    await expect(connectedStudentsRepo.list(ctx,schoolId,{})).rejects.toMatchObject({code:'READ_ERROR'});await expect(connectedStudentsRepo.list(ctx,schoolId,{})).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(2);
    const old={staffOwner:captureStaffAccess()} as Ctx;authorizationChanged();await expect(connectedStudentsRepo.profile(old,schoolId,id)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(2);
  });
});


it.each([{...row(),dateOfBirth:'2010-01-01'},{...row(),initialEnrollment:{...row().initialEnrollment,classId:guardianId}},{...row(),initialRelationship:{...row().initialRelationship,status:'VERIFIED',canReceiveInfo:true}}])('keeps an atomic student-create intent until the actual pupil, enrollment and unverified guardian are confirmed',async bad=>{
  const fetcher=vi.fn().mockResolvedValueOnce(envelope(bad)).mockResolvedValueOnce(envelope(row())),ack=vi.fn(),off=onStaffMutationAcknowledged(ack);vi.stubGlobal('fetch',fetcher);
  try{await expect(connectedStudentsRepo.create(ctx,schoolId,input)).rejects.toMatchObject({code:'NETWORK'});expect(ack).not.toHaveBeenCalled();await connectedStudentsRepo.create(ctx,schoolId,input);expect(ack).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);}finally{off();}
});
it('does not consume a student edit whose submitted private note is not acknowledged',async()=>{
  const patch={fullName:input.fullName,dob:input.dob,gender:input.gender,version:4,internalNote:null},fetcher=vi.fn().mockResolvedValueOnce(envelope({...row(),version:5,internalNote:'Nội dung sai'})).mockResolvedValueOnce(envelope({...row(),version:5,internalNote:null})),ack=vi.fn(),off=onStaffMutationAcknowledged(ack);vi.stubGlobal('fetch',fetcher);
  try{await expect(connectedStudentsRepo.update(ctx,schoolId,id,patch)).rejects.toMatchObject({code:'NETWORK'});expect(ack).not.toHaveBeenCalled();await connectedStudentsRepo.update(ctx,schoolId,id,patch);expect(ack).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);}finally{off();}
});


it('gets minimal student-create choices through write authority without reading a class or year catalog',async()=>{
  const value={today:'2026-10-01',classes:[{id:classId,version:7,name:'Lớp nguồn',status:'DRAFT',yearId:id,yearName:'Năm nguồn',yearStartsOn:'2026-01-01',yearEndsOn:'2027-01-01',canAddGuardian:false}]},fetcher=vi.fn().mockResolvedValue(envelope(value));vi.stubGlobal('fetch',fetcher);
  expect(await connectedStudentsExtraRepo.createOptions(ctx,schoolId,id)).toEqual(value);expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toContain(`/student-create-options?yearId=${id}`);
});
it('keeps unavailable guardian capability explicit and refuses stale ownership before sending creation-choice reads',async()=>{
  const value={today:'2026-10-01',classes:[{id:classId,version:7,name:'Lớp nguồn',status:'DRAFT',yearId:id,yearName:'Năm nguồn',yearStartsOn:'2026-01-01',yearEndsOn:'2027-01-01'}]},fetcher=vi.fn().mockResolvedValue(envelope(value));vi.stubGlobal('fetch',fetcher);
  await expect(connectedStudentsExtraRepo.createOptions(ctx,schoolId)).rejects.toMatchObject({code:'READ_ERROR'});const stale={staffOwner:captureStaffAccess()} as Ctx;authorizationChanged();await expect(connectedStudentsExtraRepo.createOptions(stale,schoolId)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(1);
});
