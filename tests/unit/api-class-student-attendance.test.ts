import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {ApiSchemas} from '@/lib/api/generated';
import type {Ctx} from '@/lib/repositories/core';
import {authenticationChanged,authorizationChanged,captureStaffAccess,setStaffCsrf} from '@/lib/api/client';
import {connectedTeacherExtraRepo} from '@/lib/repositories/connected/classroom';
import {nativeClassStudentAttendance} from '@/lib/repositories/connected/class-student-attendance';
const schoolId='7c000000-0000-4000-8000-000000000001',yearId='7c000000-0000-4000-8000-000000000002',classId='7c000000-0000-4000-8000-000000000003',studentId='7c000000-0000-4000-8000-000000000004';
const source=():ApiSchemas['ClassStudentAttendance']=>({schoolId,yearId,classId,studentId,today:'2026-10-02',referenceDate:'2026-10-02',className:'Lớp chuyên cần API',sessions:3,published:1,tally:{PRESENT:1,LATE:1,EXCUSED:0,UNEXCUSED:0,UNMARKED:1},notable:[{date:'2026-10-02',status:'UNMARKED',note:null,published:false},{date:'2026-10-01',status:'LATE',note:'',published:true}]});
const ctx=():Ctx=>({actor:{kind:'staff',userId:studentId},today:'2026-10-02',now:'2026-10-02T01:00:00Z',staffOwner:captureStaffAccess()});
const response=(data:unknown)=>new Response(JSON.stringify({data,requestId:'student-attendance-unit'}),{headers:{'Content-Type':'application/json'}});
beforeEach(()=>{authenticationChanged();setStaffCsrf('student-attendance-unit-csrf');});afterEach(()=>vi.unstubAllGlobals());
it('preserves actual saved-session counts unmarked records publication counts and nullable or empty public notes',()=>{
 const v=nativeClassStudentAttendance(source(),schoolId,yearId,classId,studentId);expect(v.tally).toEqual({present:1,late:1,excused:0,unexcused:0,unmarked:1});expect(v.notable).toMatchObject([{status:'unmarked',note:undefined,published:false},{status:'late',note:'',published:true}]);
});
it('rejects private foreign duplicate contradictory or partial student attendance receipts',()=>{
 const v=source();for(const bad of [{...v,studentId:classId},{...v,yearId:classId},{...v,internalNote:'PRIVATE'},{...v,sessions:2},{...v,published:0},{...v,notable:[...v.notable,v.notable[0]]},{...v,notable:[{...v.notable[0],date:'2026-10-03'}]},{...v,notable:[{...v.notable[0],internalNote:'PRIVATE'}]},{...v,tally:{...v.tally,UNMARKED:-1}}])expect(()=>nativeClassStudentAttendance(bad as ApiSchemas['ClassStudentAttendance'],schoolId,yearId,classId,studentId)).toThrow();
});
it('reads only the exact native student class purpose and never turns an API failure into zero attendance',async()=>{
 const requested:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL)=>{requested.push(String(url));return response(source());}));await connectedTeacherExtraRepo.studentAttendance(ctx(),schoolId,yearId,classId,studentId);expect(requested).toEqual([`/api/v1/schools/${schoolId}/academic-years/${yearId}/classes/${classId}/students/${studentId}/attendance`]);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({code:'DEPENDENCY_UNAVAILABLE',requestId:'student-attendance-outage'}),{status:503,headers:{'Content-Type':'application/problem+json'}})));await expect(connectedTeacherExtraRepo.studentAttendance(ctx(),schoolId,yearId,classId,studentId)).rejects.toThrow();
});
it('discards a pending student summary when current authorization changes',async()=>{
 let resolve!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(done=>{resolve=done;})));const pending=connectedTeacherExtraRepo.studentAttendance(ctx(),schoolId,yearId,classId,studentId);await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));authorizationChanged();resolve(response(source()));await expect(pending).rejects.toThrow();
});
