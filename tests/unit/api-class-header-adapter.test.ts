import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {connectedClassroomRepo} from '@/lib/repositories/connected/classroom';
import {nativeClassHeader} from '@/lib/repositories/connected/classroom-header';
import {authenticationChanged,authorizationChanged,captureStaffAccess} from '@/lib/api/client';
import type {ApiSchemas} from '@/lib/api/generated';
import type {Ctx} from '@/lib/repositories/core';
const schoolId='72000000-0000-4000-8000-000000000001',yearId='72000000-0000-4000-8000-000000000002',classId='72000000-0000-4000-8000-000000000003',gradeId='72000000-0000-4000-8000-000000000004';
const header=():ApiSchemas['ClassWorkspaceHeader']=>({school:{id:schoolId,name:'Trường API',shortName:'API',slug:'header-api'},class:{id:classId,yearId,gradeLevelId:gradeId,name:'6A API',capacity:40,status:'ACTIVE',version:2,roomId:null,motto:null,createdAt:'2026-09-01T00:00:00Z'},year:{id:yearId,version:1,code:'Y26',name:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01',status:'ACTIVE'},grade:'Khối 6',today:'2026-10-01',referenceDate:'2026-10-01',homeroom:{name:'Tên công tác',contactVisible:false,workEmail:null,workPhone:null},studentCount:null,maleCount:null,femaleCount:null,myDuties:[],viaSchoolRole:false,workspaceKind:'CLASS',actions:['class.read'],tabs:[{key:'overview',label:'Tổng quan',path:''}],summary:{weekIndex:null,weekStatus:null,pending:null,links:null,lastPublishedAt:null},readOnly:false});
const ctx=():Ctx=>({actor:{kind:'staff',userId:gradeId},today:'2026-10-01',now:'2026-10-01T01:00:00Z',staffOwner:captureStaffAccess()});
const response=(data:unknown)=>new Response(JSON.stringify({data,requestId:'native-header-unit'}),{headers:{'Content-Type':'application/json'}});
beforeEach(()=>authenticationChanged());afterEach(()=>vi.unstubAllGlobals());
describe('Exact native class header purpose and nullable independent fields',()=>{
 it('retains actual null panels and half-open year dates without inventing OPEN counts or teacher membership',()=>{
  const h=nativeClassHeader(header(),schoolId,yearId,classId);expect(h.summary.weekStatus).toBeNull();expect(h.summary.pending).toBeNull();expect(h.size).toBeNull();expect(h.year.endDate).toBe('2027-05-31');expect(h.homeroom?.email).toBeNull();expect(h.workspaceKind).toBe('CLASS');expect(h.actions).toEqual(['class.view']);
 });
 it('allows link counts without borrowing a roster denominator and subject counts without gender totals',()=>{
  const value=header();value.actions.push('parent_access.manage');value.summary.links={studentsWithLink:2,opened:1};expect(nativeClassHeader(value,schoolId,yearId,classId).size).toBeNull();
  value.actions.push('student.read');value.studentCount=2;value.tabs.push({key:'students',label:'Học sinh',path:'/students'});const h=nativeClassHeader(value,schoolId,yearId,classId);expect(h.size).toBe(2);expect(h.male).toBeNull();expect(h.female).toBeNull();
 });
 it('rejects foreign context extra family fields unsafe tabs malformed dates and contradictory summary capability',()=>{
  const base=header();for(const bad of [{...base,studentId:gradeId},{...base,school:{...base.school,id:gradeId}},{...base,class:{...base.class,yearId:gradeId}},{...base,year:{...base.year,id:gradeId}},{...base,referenceDate:'2026-10-02'},{...base,homeroom:{...base.homeroom!,workEmail:'private@example.invalid'}},{...base,summary:{...base.summary,weekStatus:'OPEN'}},{...base,summary:{...base.summary,pending:0}},{...base,tabs:[...base.tabs,{key:'groups',label:'Tổ & sơ đồ',path:'/groups'}]},{...base,tabs:[{...base.tabs[0],path:'https://example.invalid'}]},{...base,readOnly:true},{...base,studentCount:1,maleCount:2,femaleCount:0},{...base,workspaceKind:'TEACHER'}])expect(()=>nativeClassHeader(bad as ApiSchemas['ClassWorkspaceHeader'],schoolId,yearId,classId)).toThrow();
 });
 it('represents archived facts with exact clipped reference date and current delegated authority',()=>{
  const value=header();value.year={...value.year,startsOn:'2025-09-01',endsOn:'2026-06-01',status:'ARCHIVED'};value.class.status='ARCHIVED';value.referenceDate='2026-05-31';value.readOnly=true;expect(nativeClassHeader(value,schoolId,yearId,classId).readOnly).toBe(true);
 });
 it('uses only the exact school year class purpose and propagates permission loss',async()=>{
  const fetcher=vi.fn(async()=>response(header()));vi.stubGlobal('fetch',fetcher);expect((await connectedClassroomRepo.header(ctx(),schoolId,yearId,classId)).class.version).toBe(2);expect((fetcher.mock.calls as unknown as Array<[string]>)[0][0]).toContain(`/schools/${schoolId}/academic-years/${yearId}/classes/${classId}/workspace-header`);expect(fetcher).toHaveBeenCalledTimes(1);
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({code:'RESOURCE_NOT_FOUND',requestId:'header-denied'}),{status:404,headers:{'Content-Type':'application/json'}})));await expect(connectedClassroomRepo.header(ctx(),schoolId,yearId,classId)).rejects.toMatchObject({code:'NOT_FOUND'});
 });
 it('rejects an old owner receipt and an outage instead of successful invented header panels',async()=>{
  let finish:(r:Response)=>void=()=>{};let started=()=>{};const waiting=new Promise<void>(r=>{started=r;});vi.stubGlobal('fetch',vi.fn(async()=>new Promise<Response>(r=>{finish=r;started();})));const pending=connectedClassroomRepo.header(ctx(),schoolId,yearId,classId);await waiting;authorizationChanged();finish(response(header()));await expect(pending).rejects.toMatchObject({code:'FORBIDDEN'});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({code:'UNAVAILABLE',requestId:'header-outage'}),{status:503,headers:{'Content-Type':'application/json'}})));await expect(connectedClassroomRepo.header(ctx(),schoolId,yearId,classId)).rejects.toMatchObject({code:'READ_ERROR'});
 });
});
