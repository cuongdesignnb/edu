import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedStudentsRepo} from '@/lib/repositories/connected/students';
import {connectedStudentsExtraRepo} from '@/lib/repositories/connected/students-extra';
import {authenticationChanged,authorizationChanged,captureStaffAccess,onStaffMutationAcknowledged,setStaffCsrf} from '@/lib/api/client';
import type {ParentIssueInput,ParentIssueSource} from '@/lib/repositories/connected/parent-access-issue';
import type {Ctx} from '@/lib/repositories/core';

const schoolId='50000000-0000-4000-8000-000000000001',yearId='50000000-0000-4000-8000-000000000002',studentId='50000000-0000-4000-8000-000000000003',classId='50000000-0000-4000-8000-000000000004',relationshipId='50000000-0000-4000-8000-000000000005',guardianId='50000000-0000-4000-8000-000000000006',enrollmentId='50000000-0000-4000-8000-000000000007',accessId='50000000-0000-4000-8000-000000000008';
const ctx={} as Ctx,source=():ParentIssueSource=>({context:{schoolId,schoolVersion:3,schoolName:'Trường API',schoolSlug:'parent-api',timezone:'America/Los_Angeles',today:'2026-10-01',ttlDays:30,defaultSections:['overview','teachers'],year:{id:yearId,version:4,name:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01',lastDay:'2027-05-31',suggestedExpiryOn:'2026-10-31'}},student:{id:studentId,version:5,fullName:'Học sinh API',studentCode:'HS001',status:'ACTIVE'},enrollment:{id:enrollmentId,version:6,inEffect:true},class:{id:classId,version:7,name:'Lớp API'},relationships:[{id:relationshipId,version:8,guardianId,guardianVersion:9,guardianName:'Giám hộ API',relationshipLabel:'Mẹ',status:'VERIFIED',isPrimary:true,canReceiveInfo:true,canIssue:true,activeLinkIds:[]}]}),
  input=():ParentIssueInput=>({source:source(),relationshipId,modules:['teachers','documents'],allowDownload:false,expiresOn:'2026-10-31'});
const receipt=()=>({access:{id:accessId,version:1,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',studentId,yearId,relationshipId,allowedSections:['overview','teachers','documents'],allowDownload:false,expiresAt:'2026-11-01T07:00:00Z',revokedAt:null,issuedToGuardianName:'Giám hộ API'},link:`http://127.0.0.1:18763/p/parent-api/access#token=${'A'.repeat(43)}`,displayOnce:true});
const envelope=(data:unknown,page?:unknown)=>new Response(JSON.stringify({data,requestId:'parent-issue-unit',...(page?{page}:{})}));
beforeEach(()=>{authenticationChanged();setStaffCsrf('unit-csrf');});afterEach(()=>vi.unstubAllGlobals());

describe('Native purpose readers for parent-link issuance',()=>{
  it('uses issue-purpose context/source readers with the selected year and keeps absent active year explicit',async()=>{
    const value=source(),fetcher=vi.fn().mockResolvedValueOnce(envelope(value.context)).mockResolvedValueOnce(envelope(value)).mockResolvedValueOnce(envelope({...value.context,year:null}));vi.stubGlobal('fetch',fetcher);
    expect((await connectedStudentsExtraRepo.issueContext(ctx,schoolId,yearId)).defaultModules).toEqual(['teachers']);expect(await connectedStudentsExtraRepo.issueCandidates(ctx,schoolId,studentId,yearId)).toEqual(value);expect((await connectedStudentsExtraRepo.issueContext(ctx,schoolId)).year).toBeNull();
    expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/schools/${schoolId}/parent-access/issue-context?yearId=${yearId}`);expect(fetcher.mock.calls[1][0]).toBe(`/api/v1/schools/${schoolId}/students/${studentId}/parent-access-issue-source?yearId=${yearId}`);expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('requests one server page for remote search, without fetching a roster or borrowing class, guardian or settings readers',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope([{id:studentId,version:5,fullName:'Học sinh API',studentCode:'HS001',classId,className:'Lớp API'}],{limit:100,total:1600,hasMore:true,nextCursor:'opaque-next'}));vi.stubGlobal('fetch',fetcher);
    const page=await connectedStudentsExtraRepo.issueStudents(ctx,schoolId,{q:'Minh Anh',page:1,pageSize:100},yearId);expect(page.total).toBe(1600);expect(page.items).toHaveLength(1);expect(fetcher).toHaveBeenCalledTimes(1);expect(String(fetcher.mock.calls[0][0])).toContain('issue-students?');expect(String(fetcher.mock.calls[0][0])).toContain('q=Minh+Anh');
  });
  it('rejects wrong school/student/year and missing reviewed versions without returning a partial source',async()=>{
    const values=[{...source(),student:{...source().student,id:guardianId}},{...source(),context:{...source().context,schoolId:guardianId}},{...source(),context:{...source().context,year:{...source().context.year!,id:guardianId}}},{...source(),enrollment:{id:enrollmentId,inEffect:true}}];
    for(const value of values){vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope(value)));await expect(connectedStudentsExtraRepo.issueCandidates(ctx,schoolId,studentId,yearId)).rejects.toMatchObject({code:expect.stringMatching(/READ_ERROR|CONFLICT/)});}
  });
});
describe('Reviewed parent-link commands and ephemeral receipts',()=>{
  it('sends only the frozen reviewed source, explicit sections/date/download and the old link version, without a pre-save GET',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope(receipt()));vi.stubGlobal('fetch',fetcher);const value=input();value.replace={accessId:guardianId,version:12};value.reason='Cấp lại theo đề nghị';
    const result=await connectedStudentsRepo.issueAccess(ctx,schoolId,value);expect(result.link).toContain('#token=');expect(result).not.toHaveProperty('token');expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/schools/${schoolId}/parent-access/reviewed-issue`);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({studentId,yearId,relationshipId,allowedSections:['overview','teachers','documents'],allowDownload:false,expiresOn:'2026-10-31',replace:{accessId:guardianId,expectedVersion:12},reason:'Cấp lại theo đề nghị',reviewedSource:{schoolVersion:3,yearVersion:4,studentVersion:5,enrollmentId,enrollmentVersion:6,classVersion:7,relationshipVersion:8,guardianVersion:9}});
  });
  it('blocks missing link version, unverified receiving authority, wrong download and invalid dates before HTTP',async()=>{
    const values=[{...input(),replace:{accessId},reason:'Cấp lại'},{...input(),modules:['teachers'] as ParentIssueInput['modules'],allowDownload:true},{...input(),expiresOn:'2027-06-01'},{...input(),allowDownload:undefined as unknown as boolean}];
    const unverified=input();unverified.source.relationships[0].canReceiveInfo=false;values.push(unverified);const stale=input();stale.source.relationships[0].version=undefined as unknown as number;values.push(stale);
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);for(const value of values)await expect(connectedStudentsRepo.issueAccess(ctx,schoolId,value)).rejects.toMatchObject({code:expect.stringMatching(/CONFLICT|VALIDATION|UNVERIFIED/)});expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps an uncertain command key through malformed acknowledgements and emits mutation only after complete confirmation',async()=>{
    const bad={...receipt(),access:{...receipt().access,allowDownload:true}},fetcher=vi.fn().mockResolvedValueOnce(envelope(bad)).mockResolvedValueOnce(envelope(receipt()));vi.stubGlobal('fetch',fetcher);let changes=0;const stop=onStaffMutationAcknowledged(()=>changes++);
    try{await expect(connectedStudentsRepo.issueAccess(ctx,schoolId,input())).rejects.toMatchObject({code:'NETWORK'});expect(changes).toBe(0);await connectedStudentsRepo.issueAccess(ctx,schoolId,input());expect(changes).toBe(1);expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);}finally{stop();}
  });
  it('rejects different student, section, query-token, wrong path and raw credential metadata before acknowledging issuance',async()=>{
    const values=[{...receipt(),access:{...receipt().access,studentId:guardianId}},{...receipt(),access:{...receipt().access,allowedSections:['overview']}},{...receipt(),link:`http://127.0.0.1:18763/p/parent-api/access?token=${'A'.repeat(43)}`},{...receipt(),link:`http://127.0.0.1:18763/p/other-school/access#token=${'A'.repeat(43)}`},{...receipt(),access:{...receipt().access,tokenHash:'secret'}},{...receipt(),displayOnce:false}];
    for(const value of values){vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope(value)));await expect(connectedStudentsRepo.issueAccess(ctx,schoolId,input())).rejects.toMatchObject({code:'NETWORK'});}
  });
  it('reports a lost one-time receipt using only its metadata id and preserves current ownership through retries',async()=>{
    const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('lost acknowledgement')).mockResolvedValueOnce(new Response(JSON.stringify({code:'LINK_ALREADY_ISSUED',resultId:accessId}),{status:409}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStudentsRepo.issueAccess(ctx,schoolId,input())).rejects.toMatchObject({code:'NETWORK'});await expect(connectedStudentsRepo.issueAccess(ctx,schoolId,input())).rejects.toMatchObject({code:'CONFLICT',details:{problemCode:'LINK_ALREADY_ISSUED',resultId:accessId}});expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);
    const old={staffOwner:captureStaffAccess()} as Ctx;authorizationChanged();await expect(connectedStudentsRepo.issueAccess(old,schoolId,input())).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
