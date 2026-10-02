import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {connectedTeacherWorkspaceRepo,nativeTeacherHome,nativeTeacherSchedule,nativeTeacherTasks} from '@/lib/repositories/connected/teacher-workspace';
import {authenticationChanged,authorizationChanged,captureStaffAccess} from '@/lib/api/client';
import type {ApiSchemas} from '@/lib/api/generated';
import type {Ctx} from '@/lib/repositories/core';
import {addDays} from '@/lib/calendar';
const schoolId='68100000-0000-4000-8000-000000000001',classId='68100000-0000-4000-8000-000000000002',yearId='68100000-0000-4000-8000-000000000003',memberId='68100000-0000-4000-8000-000000000004',lessonId='68100000-0000-4000-8000-000000000005';
const receipt={schoolId,today:'2026-10-02',asOf:'2026-10-02T02:00:00Z'};
const ctx=():Ctx=>({actor:{kind:'staff',userId:memberId},today:receipt.today,now:receipt.asOf,staffOwner:captureStaffAccess()});
const lesson=():ApiSchemas['TeacherWorkspaceLesson']=>({id:lessonId,classId,yearId,className:'6A API',date:'2026-10-02',periodNumber:null,startsAtLocal:'08:05',endsAtLocal:'08:50',subjectName:'Toán',roomName:null,status:'SCHEDULED',changeReason:null,canAttend:true});
const task=():ApiSchemas['TeacherWorkspaceTask']=>({id:'lesson-attendance:'+lessonId,kind:'attendance',title:'Điểm danh tiết',detail:'Tiết được phân công',classId,yearId,className:'6A API',targetType:'lesson',targetId:lessonId,status:'Chưa điểm danh',tone:'neutral',dueAt:receipt.asOf});
const home=():ApiSchemas['TeacherWorkspaceHome']=>({...receipt,membershipId:memberId,unread:3,classes:[{id:classId,yearId,name:'6A API',motto:null,isHomeroom:true,subjects:['Toán'],size:3,room:null,nextLesson:lesson(),attendance:{status:'saved',total:3,present:1,late:1,excused:0,unexcused:0,unmarked:1},pendingConduct:2}],tasks:[task()],feed:[{id:'attendance:test',action:'Cập nhật điểm danh',entityLabel:'Lớp 6A API',at:receipt.asOf}]});
const schedule=():ApiSchemas['TeacherWorkspaceSchedule']=>({...receipt,weekStart:'2026-09-28',days:Array.from({length:7},(_,i)=>({date:addDays('2026-09-28',i),holiday:null,lessons:i===4?[lesson()]:[]}))});
const response=(data:unknown,status=200)=>new Response(JSON.stringify(status===200?{data,requestId:'teacher-workspace-unit'}:{code:data,requestId:'teacher-workspace-unit'}),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>authenticationChanged());afterEach(()=>vi.unstubAllGlobals());
describe('teacher purpose workspaces retain actual PostgreSQL receipts and actor scope',()=>{
 it('maps actual attendance and nullable metadata without assuming every student is present',()=>{
  const mapped=nativeTeacherHome(home(),schoolId);expect(mapped.homeroom?.attendance).toMatchObject({presentAll:2,total:3,unmarked:1,status:'saved'});expect(mapped.kpi).toMatchObject({presentToday:2,pendingConduct:2,unread:3});expect(mapped.classes[0].nextLesson).toMatchObject({period:null,start:'08:05',end:'08:50',room:null});expect(mapped.tasks[0].href).toContain('slot=lesson-'+lessonId);
  const hidden=home();hidden.classes[0].attendance=null;hidden.classes[0].size=null;hidden.classes[0].pendingConduct=null;const limited=nativeTeacherHome(hidden,schoolId);expect(limited.kpi.presentToday).toBeNull();expect(limited.kpi.pendingConduct).toBeNull();expect(limited.classes[0].size).toBeNull();
 });
 it('renders an entire real week, including Sunday, actual time and cancellation metadata',()=>{
  const s=schedule();s.days[6].lessons=[{...lesson(),id:memberId,date:'2026-10-04',periodNumber:12,status:'CANCELLED',changeReason:'Nghỉ theo lịch trường',canAttend:false}];s.days[6].holiday='Lễ';const mapped=nativeTeacherSchedule(s,schoolId,s.weekStart);expect(mapped.days).toHaveLength(7);expect(mapped.days[4].lessons[0].period).toBeNull();expect(mapped.days[6]).toMatchObject({date:'2026-10-04',holiday:'Lễ',lessons:[{period:12,cancelled:true,changed:{reason:'Nghỉ theo lịch trường'},canAttend:false}]});expect(mapped.monthLessonDays).toEqual(['2026-10-02']);
 });
 it('rejects foreign/incomplete/internal fields, inconsistent counts and tasks outside owned classes',()=>{
  for(const value of [{...home(),schoolId:yearId},{...home(),password:'private'},{...home(),membershipId:'missing'},{...home(),classes:[{...home().classes[0],attendance:{...home().classes[0].attendance!,total:4}}]},{...home(),classes:[{...home().classes[0],nextLesson:{...lesson(),date:'2026-10-03'}}]},{...home(),classes:[home().classes[0],home().classes[0]]},{...home(),tasks:[{...task(),classId:memberId}]}])expect(()=>nativeTeacherHome(value as ApiSchemas['TeacherWorkspaceHome'],schoolId)).toThrow();
  const s=schedule();s.days[4].lessons[0].canAttend=true;s.days[4].lessons[0].status='CANCELLED';expect(()=>nativeTeacherSchedule(s,schoolId,s.weekStart)).toThrow();
  for(const value of [{...task(),kind:'conduct'},{...task(),targetType:'private-file'},{...task(),targetId:'bad'}])expect(()=>nativeTeacherTasks({...receipt,tasks:[value]} as ApiSchemas['TeacherWorkspaceTasks'],schoolId)).toThrow();
 });
 it('accepts authoritative empty workspaces while keeping denied/offline requests as errors',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response({...receipt,tasks:[]})));expect(await connectedTeacherWorkspaceRepo.teacherTasks(ctx(),schoolId)).toEqual([]);
  for(const [code,status] of [['FORBIDDEN',403],['UNAVAILABLE',503]] as const){vi.stubGlobal('fetch',vi.fn(async()=>response(code,status)));await expect(connectedTeacherWorkspaceRepo.teacherTasks(ctx(),schoolId)).rejects.toMatchObject({code:status===403?'FORBIDDEN':'READ_ERROR'});}
 });
 it('routes all three methods only to the purpose endpoints with the requested school and week',async()=>{
  const fetcher=vi.fn(async(url:string)=>response(url.includes('/schedule?')?schedule():url.includes('/tasks')?{...receipt,tasks:[task()]}:home()));vi.stubGlobal('fetch',fetcher);
  await connectedTeacherWorkspaceRepo.teacherHome(ctx(),schoolId);await connectedTeacherWorkspaceRepo.teacherTasks(ctx(),schoolId);await connectedTeacherWorkspaceRepo.teacherSchedule(ctx(),schoolId,'2026-09-28');
  expect(fetcher.mock.calls.map(c=>new URL(c[0],'http://local').pathname)).toEqual([`/api/v1/schools/${schoolId}/me/teacher-workspace`,`/api/v1/schools/${schoolId}/me/teacher-workspace/tasks`,`/api/v1/schools/${schoolId}/me/teacher-workspace/schedule`]);expect(new URL(fetcher.mock.calls[2][0],'http://local').searchParams.get('weekStart')).toBe('2026-09-28');
 });
 it('discards a slow receipt after authorization is revoked instead of displaying an old actor result',async()=>{
  let finish:(r:Response)=>void=()=>{};let started=()=>{};const waiting=new Promise<void>(r=>{started=r;});vi.stubGlobal('fetch',vi.fn(async()=>new Promise<Response>(r=>{finish=r;started();})));const pending=connectedTeacherWorkspaceRepo.teacherHome(ctx(),schoolId);await waiting;authorizationChanged();finish(response(home()));await expect(pending).rejects.toMatchObject({code:'FORBIDDEN'});
 });
});
