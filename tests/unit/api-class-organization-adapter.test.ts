import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import type {ApiSchemas} from '@/lib/api/generated';
import {nativeGroupWorkspace,nativeSeatingWorkspace} from '@/lib/repositories/connected/classroom-organization';
import {connectedClassroomRepo} from '@/lib/repositories/connected/classroom';
import {authenticationChanged,authorizationChanged,captureStaffAccess,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

const schoolId='76000000-0000-4000-8000-000000000001',yearId='76000000-0000-4000-8000-000000000002',classId='76000000-0000-4000-8000-000000000003',studentId='76000000-0000-4000-8000-000000000004',enrollmentId='76000000-0000-4000-8000-000000000005',groupId='76000000-0000-4000-8000-000000000006',positionId='76000000-0000-4000-8000-000000000007',assignmentId='76000000-0000-4000-8000-000000000008',planId='76000000-0000-4000-8000-000000000009';
const base=()=>({schoolId,yearId,classId,today:'2026-10-01',referenceDate:'2026-10-01',classVersion:3,readOnly:false,canEdit:true,groupsVisible:true,students:[{id:studentId,enrollmentId,studentCode:'P1',fullName:'Học sinh nguồn tổ chức',groupId}]});
const group=():ApiSchemas['ClassGroupWorkspace']=>({...base(),groups:[{id:groupId,version:2,name:'Tổ nguồn',sortOrder:1}],positionDefinitions:[{id:positionId,version:1,code:'chosen',name:'Chức vụ cấu hình thực',singleHolder:true,groupId}],holders:[{id:assignmentId,version:1,positionId,enrollmentId,startsOn:'2026-09-01',endsOn:'2027-06-01'}]});
const seating=():ApiSchemas['ClassSeatingWorkspace']=>({...base(),latestRevision:2,groupNames:[{id:groupId,name:'Tổ nguồn'}],plan:{id:planId,version:4,revision:1,effectiveOn:'2026-09-01',endsOn:'2026-10-03',rows:1,cols:2,note:null,seats:[{key:'Actual-key',row:0,column:0,enrollmentId},{key:'Empty-native-key',row:0,column:1,enrollmentId:null}]},history:[{id:positionId,version:2,revision:2,effectiveOn:'2026-10-03',endsOn:'2027-06-01',status:'ACTIVE',createdAt:'2026-10-01T01:00:00Z',createdByName:null},{id:planId,version:4,revision:1,effectiveOn:'2026-09-01',endsOn:'2026-10-03',status:'ACTIVE',createdAt:'2026-09-01T01:00:00Z',createdByName:'Tên công tác nguồn'}]});
const ctx=():Ctx=>({actor:{kind:'staff',userId:studentId},today:'2026-10-01',now:'2026-10-01T01:00:00Z',staffOwner:captureStaffAccess()});
const response=(data:unknown)=>new Response(JSON.stringify({data,requestId:'native-organization-unit'}),{headers:{'Content-Type':'application/json'}});
beforeEach(()=>{authenticationChanged();setStaffCsrf('organization-unit-csrf');});afterEach(()=>vi.unstubAllGlobals());
describe('native class organization receipts',()=>{
 it('retains actual enrollment IDs dates displayed class version and configured position labels',()=>{
  const v=nativeGroupWorkspace(group(),schoolId,yearId,classId);expect(v.classVersion).toBe(3);expect(v.groups[0].members[0].enrollmentId).toBe(enrollmentId);expect(v.groups[0].members[0].positions).toEqual(['Chức vụ cấu hình thực']);expect(v.positions[0].id).toBe(assignmentId);expect(v.positions[0].studentId).toBe(studentId);
 });
 it('rejects wrong scope private source fields foreign holders and impossible dated group leaders',()=>{
  const v=group();for(const bad of [{...v,schoolId:planId},{...v,guardianPhone:'0912345678'},{...v,holders:[{...v.holders[0],enrollmentId:planId}]},{...v,holders:[{...v.holders[0],endsOn:v.referenceDate}]},{...v,students:[{...v.students[0],groupId:null}]},{...v,holders:[v.holders[0],{...v.holders[0],id:planId}]}])expect(()=>nativeGroupWorkspace(bad as typeof v,schoolId,yearId,classId)).toThrow();
 });
 it('keeps current and future active revisions distinct and maps actual coordinates without guessing source dimensions',()=>{
  const v=nativeSeatingWorkspace(seating(),schoolId,yearId,classId);expect(v.plan?.version).toBe(1);expect(v.latestRevision).toBe(2);expect(v.plan?.sourceVersion).toBe(4);expect(v.plan?.rows).toBe(1);expect(v.plan?.seats).toEqual([{seat:'r1c1',studentId},{seat:'r1c2',studentId:null}]);expect(v.history[0].createdByName).toBeNull();
  const empty=seating();empty.plan={...empty.plan!,rows:null,cols:null,seats:[]};expect(nativeSeatingWorkspace(empty,schoolId,yearId,classId).plan?.rows).toBeNull();
 });
 it('denies unauthorized group metadata and rejects malformed seating history identities or duplicate seats',()=>{
  const v=seating(),privateGroups={...v,groupsVisible:false,groupNames:null};expect(()=>nativeSeatingWorkspace(privateGroups,schoolId,yearId,classId)).toThrow();privateGroups.students=[{...v.students[0],groupId:null}];expect(nativeSeatingWorkspace(privateGroups,schoolId,yearId,classId).groupsVisible).toBe(false);
  for(const bad of [{...v,studentContact:'private'},{...v,history:[{...v.history[0],revision:1},v.history[1]]},{...v,plan:{...v.plan!,version:3}},{...v,plan:{...v.plan!,rows:6}},{...v,plan:{...v.plan!,seats:[v.plan!.seats[0],v.plan!.seats[0]]}}])expect(()=>nativeSeatingWorkspace(bad as typeof v,schoolId,yearId,classId)).toThrow();
 });
 it('resolves actual dated enrollment choices while retaining the displayed class version in a group command',async()=>{
  const bodies:unknown[]=[];vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const p=new URL(String(input),'http://localhost');if(p.pathname.endsWith('/group-workspace'))return response({...group(),classVersion:9});bodies.push(JSON.parse(String(init?.body)));return response({id:classId,status:'APPLIED',version:10});}));
  await connectedClassroomRepo.setGroup(ctx(),schoolId,classId,{yearId,studentIds:[studentId],groupId:null,effectiveDate:'2026-10-01',expectedClassVersion:3});expect(bodies).toEqual([{groupId:null,enrollmentIds:[enrollmentId],effectiveOn:'2026-10-01',expectedClassVersion:3}]);
 });
 it('ends the exact displayed position assignment version without refreshing it to a newer holder',async()=>{
  const bodies:unknown[]=[];const fetcher=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{bodies.push(JSON.parse(String(init?.body)));return response({id:assignmentId,version:2,positionId,enrollmentId,startsOn:'2026-09-01',endsOn:'2026-10-01'});});vi.stubGlobal('fetch',fetcher);
  await connectedClassroomRepo.setPosition(ctx(),schoolId,classId,{yearId,studentId,positionId,effectiveDate:'2026-10-01',remove:true,assignmentId,expectedVersion:1});expect(fetcher).toHaveBeenCalledTimes(1);expect(bodies[0]).toMatchObject({expectedVersion:1,endsOn:'2026-10-01'});expect(bodies[0]).not.toHaveProperty('actorId');
 });
 it('saves one atomic revision with actual enrollment IDs and preserves the displayed revision despite newer history',async()=>{
  const calls:{path:string;body:unknown}[]=[];vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const p=new URL(String(input),'http://localhost');if(p.pathname.endsWith('/seating-workspace'))return response(seating());calls.push({path:p.pathname,body:JSON.parse(String(init?.body))});return response({id:planId,classId,revision:2,status:'ACTIVE',effectiveOn:'2026-10-01'});}));
  const receipt=await connectedClassroomRepo.saveSeating(ctx(),schoolId,classId,{yearId,rows:1,cols:2,seats:[{seat:'r1c1',studentId},{seat:'r1c2',studentId:null}],effectiveDate:'2026-10-01',basedOnVersion:1,note:'Nguồn ghi chú'});expect(receipt.version).toBe(2);expect(calls).toHaveLength(1);expect(calls[0].path).toBe(`/api/v1/schools/${schoolId}/academic-years/${yearId}/classes/${classId}/seating-revisions`);expect(calls[0].body).toEqual({effectiveOn:'2026-10-01',expectedRevision:1,note:'Nguồn ghi chú',seats:[{key:'r1c1',row:0,column:0,enrollmentId},{key:'r1c2',row:0,column:1,enrollmentId:null}]});
 });
 it('rejects an incorrect requested date or revoked composite owner before sending any organization write',async()=>{
  let mutate=false;const fetcher=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{if(init?.method==='POST')mutate=true;return response({...group(),referenceDate:'2026-10-02'});});vi.stubGlobal('fetch',fetcher);await expect(connectedClassroomRepo.setGroup(ctx(),schoolId,classId,{yearId,studentIds:[studentId],groupId:null,effectiveDate:'2026-10-01',expectedClassVersion:3})).rejects.toMatchObject({code:'READ_ERROR'});expect(mutate).toBe(false);
  vi.stubGlobal('fetch',vi.fn(async()=>{authorizationChanged();return response(group());}));await expect(connectedClassroomRepo.setGroup(ctx(),schoolId,classId,{yearId,studentIds:[studentId],groupId:null,effectiveDate:'2026-10-01',expectedClassVersion:3})).rejects.toMatchObject({code:'FORBIDDEN'});expect(mutate).toBe(false);
 });
});
