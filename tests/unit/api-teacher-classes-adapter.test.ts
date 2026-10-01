import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {connectedClassroomRepo,connectedTeacherExtraRepo,nativeTeacherClass} from '@/lib/repositories/connected/classroom';
import {authenticationChanged,authorizationChanged,captureStaffAccess} from '@/lib/api/client';
import type {ApiSchemas} from '@/lib/api/generated';
import type {Ctx} from '@/lib/repositories/core';
const schoolId='68000000-0000-4000-8000-000000000001',id='68000000-0000-4000-8000-000000000002',other='68000000-0000-4000-8000-000000000003',assignment='68000000-0000-4000-8000-000000000004';
const card=():ApiSchemas['TeacherClassCard']=>({id,schoolId,yearId:other,name:'6A API',yearLabel:'2026–2027',status:'ACTIVE',today:'2026-10-01',referenceDate:'2026-10-01',live:true,motto:null,studentCount:2,roomLabel:null,homeroomName:'GVCN công tác',assignments:[{id:assignment,kind:'SUBJECT',subjectName:'Toán',startsOn:'2026-09-01',endsOn:'2027-06-01',live:true,status:'ACTIVE'}],actions:['class.read','schedule.read','student.read'],nextLesson:{date:'2026-10-02',startsAtLocal:'08:30',endsAtLocal:'09:15',periodNumber:null,subjectName:'Toán'}});
const ctx=():Ctx=>({actor:{kind:'staff',userId:other},today:'2026-10-01',now:'2026-10-01T01:00:00Z',staffOwner:captureStaffAccess()});
const response=(data:unknown,hasMore=false,cursor:string|null=null,total=1)=>new Response(JSON.stringify({data,page:{hasMore,nextCursor:cursor,limit:100,total},requestId:'teacher-class-unit'}),{status:200,headers:{'Content-Type':'application/json'}});
beforeEach(()=>authenticationChanged());afterEach(()=>vi.unstubAllGlobals());
describe('Native own class cards and exact current staff scope',()=>{
 it('maps actual nullable period/room and exclusive assignment dates without inventing metadata or family access',()=>{
  const c=nativeTeacherClass(card(),schoolId);expect(c.nextLesson).toEqual({date:'2026-10-02',start:'08:30',end:'09:15',period:null,subject:'Toán'});expect(c.room).toBeNull();expect(c.duties[0].validTo).toBe('2027-05-31');expect(c.actions).toContain('roster.view');expect(c.actions).not.toContain('guardian.view');
  const hidden=card();hidden.actions=['class.read'];hidden.studentCount=null;hidden.nextLesson=null;expect(nativeTeacherClass(hidden,schoolId).size).toBeNull();
 });
 it('represents ended history without current class panels or actions and rejects field leakage and contradictory scope',()=>{
  const ended=card();ended.live=false;ended.assignments[0].live=false;ended.assignments[0].status='REVOKED';ended.actions=[];ended.studentCount=null;ended.roomLabel=null;ended.homeroomName=null;ended.nextLesson=null;expect(nativeTeacherClass(ended,schoolId).live).toBe(false);
  for(const value of [{...card(),schoolId:other},{...card(),workPhone:'private'},{...card(),studentCount:null},{...card(),actions:['schedule.read']},{...card(),assignments:[{...card().assignments[0],startsOn:'2026-10-02'}]},{...card(),nextLesson:{...card().nextLesson!,date:'2026-10-08'}},{...ended,studentCount:2},{...ended,actions:['class.read']},{...card(),assignments:[{...card().assignments[0],userId:other}]}])expect(()=>nativeTeacherClass(value as ApiSchemas['TeacherClassCard'],schoolId)).toThrow();
 });
 it('both facade methods read only the purpose keyset and request ended history explicitly',async()=>{
  const fetcher=vi.fn(async()=>response([card()]));vi.stubGlobal('fetch',fetcher);expect((await connectedClassroomRepo.teacherClasses(ctx(),schoolId,true))[0].name).toBe('6A API');expect((await connectedTeacherExtraRepo.myClassActions(ctx(),schoolId))[id]).toContain('class.view');
  const urls=fetcher.mock.calls as unknown as Array<[string,RequestInit]>;expect(urls[0][0]).toContain(`/schools/${schoolId}/me/class-directory?`);expect(new URL(urls[0][0],'http://local').searchParams.get('includeEnded')).toBe('true');expect(new URL(urls[1][0],'http://local').searchParams.get('includeEnded')).toBe('false');expect(urls.every(([u])=>!u.includes('/students')&&!u.includes('/members'))).toBe(true);
 });
 it('rejects an incomplete legacy list, foreign rows, duplicate cards and oversized keysets without partial success',async()=>{
  for(const value of [{data:[card()],requestId:'old'}, {data:[{...card(),schoolId:other}],page:{hasMore:false,nextCursor:null,limit:100,total:1},requestId:'foreign'}, {data:[card(),card()],page:{hasMore:false,nextCursor:null,limit:100,total:2},requestId:'duplicate'}, {data:[card()],page:{hasMore:true,nextCursor:'next',limit:100,total:501},requestId:'large'}]){
   vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})));await expect(connectedClassroomRepo.teacherClasses(ctx(),schoolId)).rejects.toMatchObject({code:value.requestId==='large'?'VALIDATION':'READ_ERROR'});
  }
 });
 it('permission errors and a slow old receipt cannot become empty success or lend the previous identity authority',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({code:'FORBIDDEN',requestId:'denied'}),{status:403,headers:{'Content-Type':'application/json'}})));await expect(connectedTeacherExtraRepo.myClassActions(ctx(),schoolId)).rejects.toMatchObject({code:'FORBIDDEN'});
  let finish:(r:Response)=>void=()=>{};let started=()=>{};const waiting=new Promise<void>(r=>{started=r;});vi.stubGlobal('fetch',vi.fn(async()=>new Promise<Response>(r=>{finish=r;started();})));const pending=connectedClassroomRepo.teacherClasses(ctx(),schoolId);await waiting;authorizationChanged();finish(response([card()]));await expect(pending).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('keeps one owner across every page and propagates a later page outage without returning the first page',async()=>{
  let n=0;vi.stubGlobal('fetch',vi.fn(async()=>++n===1?response([card()],true,'cursor',2):new Response(JSON.stringify({code:'UNAVAILABLE',requestId:'page2'}),{status:503,headers:{'Content-Type':'application/json'}})));await expect(connectedClassroomRepo.teacherClasses(ctx(),schoolId)).rejects.toMatchObject({code:'READ_ERROR'});expect(n).toBe(2);
 });
});
