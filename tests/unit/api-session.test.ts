import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {authenticationChanged,setStaffCsrf,http} from '@/lib/api/client';
import {refreshStaffContext,readStaffSession,readStaffContext,adoptAuthenticatedSession,logoutStaff,restoreStaffSession,serverToday} from '@/lib/api/session';
import {uiActions} from '@/lib/api/permissions';
import type {ApiSchemas} from '@/lib/api/generated';

const userId='00000000-0000-4000-8000-000000000001',schoolId='00000000-0000-4000-8000-000000000002',classA='00000000-0000-4000-8000-000000000003',classB='00000000-0000-4000-8000-000000000004';
function fixture():ApiSchemas['Context']{
  const now=new Date().toISOString();return {user:{id:userId,displayName:'Người dùng từ API',email:'synthetic@example.invalid',status:'ACTIVE',version:2,createdAt:now,updatedAt:now,workPhone:null,bio:null},platformActions:[],csrfToken:'only-memory',serverNow:now,mode:'connected',memberships:[{schoolId,schoolName:'Trường từ API',schoolSlug:'truong-test',schoolShortName:'Test',schoolStatus:'ACTIVE',department:'',timezone:'Asia/Ho_Chi_Minh',today:'2026-09-30',memberId:userId,status:'ACTIVE',duties:[],schoolWorkspace:false,teacherWorkspace:true,grants:[{id:classA,roleId:classA,roleLabel:'Chủ nhiệm',roleCode:'HOMEROOM',version:1,scopeType:'CLASS',classId:classA,actions:['class.read','seating.manage','guardian.read'],validFrom:'2020-01-01T00:00:00Z',validUntil:null,assignmentStartsOn:'2026-09-01',assignmentEndsOn:'2027-06-01'},{id:classB,roleId:classB,roleLabel:'Bộ môn',roleCode:'SUBJECT_TEACHER',version:1,scopeType:'SUBJECT',classId:classB,subjectId:schoolId,actions:['class.read','student.read'],validFrom:'2020-01-01T00:00:00Z',validUntil:null,assignmentStartsOn:'2026-09-01',assignmentEndsOn:'2027-06-01'}]}]};
}
const reply=(data:unknown)=>new Response(JSON.stringify({data,requestId:'fixture'}),{headers:{'content-type':'application/json'}});
beforeEach(()=>authenticationChanged());afterEach(()=>{vi.unstubAllGlobals();authenticationChanged();});
describe('cookie session and advisory permissions',()=>{
  it('cannot sign in from an actor supplied by the browser and does not persist a credential',async()=>{
    const setItem=vi.fn();vi.stubGlobal('window',{localStorage:{setItem},sessionStorage:{setItem}});
    expect(()=>adoptAuthenticatedSession({kind:'staff',userId})).toThrow();
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply(fixture())));await refreshStaffContext();
    expect(readStaffSession()?.actor).toEqual({kind:'staff',userId});expect(()=>adoptAuthenticatedSession({kind:'staff',userId:schoolId})).toThrow();expect(setItem).not.toHaveBeenCalled();expect(serverToday(schoolId)).toMatch(/^\d{4}-\d\d-\d\d$/);
  });
  it('deduplicates bootstrap and discards an in-flight read after authentication changes',async()=>{
    let resolve!:(response:Response)=>void;const fetcher=vi.fn().mockImplementation(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal('fetch',fetcher);
    const first=refreshStaffContext(),second=refreshStaffContext();expect(fetcher).toHaveBeenCalledTimes(1);
    authenticationChanged();resolve(reply(fixture()));await expect(first).rejects.toMatchObject({code:'NO_SESSION'});await expect(second).rejects.toMatchObject({code:'NO_SESSION'});expect(readStaffSession()).toBeNull();expect(readStaffContext()).toBeNull();
  });
  it('revokes current memory context on 401 while a network error remains visible',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(reply(fixture())).mockResolvedValueOnce(new Response(JSON.stringify({code:'UNAUTHENTICATED'}),{status:401})).mockRejectedValueOnce(new TypeError('offline'));vi.stubGlobal('fetch',fetcher);
    await refreshStaffContext();await expect(http('getMyProfile')).rejects.toMatchObject({code:'NO_SESSION'});expect(readStaffSession()).toBeNull();await expect(restoreStaffSession()).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('only clears a local session after the logout acknowledgement',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(reply(fixture())).mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(reply({id:userId,status:'REVOKED'}));vi.stubGlobal('fetch',fetcher);
    await refreshStaffContext();setStaffCsrf('only-memory');await expect(logoutStaff()).rejects.toMatchObject({code:'NETWORK'});expect(readStaffSession()?.actor).toEqual({kind:'staff',userId});await logoutStaff();expect(readStaffSession()).toBeNull();
  });
  it('shows invalid current password as a form error without treating it as a revoked session',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(reply(fixture())).mockResolvedValueOnce(new Response(JSON.stringify({code:'INVALID_CREDENTIALS'}),{status:401}));vi.stubGlobal('fetch',fetcher);await refreshStaffContext();
    await expect(http('changePassword',{body:{currentPassword:'wrong',newPassword:'valid-but-not-sent'}})).rejects.toMatchObject({code:'VALIDATION'});expect(readStaffSession()?.actor).toEqual({kind:'staff',userId});
  });
  it('keeps class, subject and event dates on the same grant and hides ended assignments',()=>{
    const ctx=fixture();expect(uiActions(ctx,{schoolId,classId:classA}).has('seating.manage')).toBe(true);expect(uiActions(ctx,{schoolId,classId:classB}).has('seating.manage')).toBe(false);expect(uiActions(ctx,{schoolId,classId:classB}).has('guardian.view')).toBe(false);expect(uiActions(ctx,{schoolId}).size).toBe(0);expect(uiActions(ctx,{schoolId,classId:classB,subjectId:userId}).size).toBe(0);expect(uiActions(ctx,{schoolId,classId:classA,date:'2027-06-01'}).size).toBe(0);
    ctx.memberships[0].status='SUSPENDED';expect(uiActions(ctx,{schoolId,classId:classA}).size).toBe(0);
  });
});
