import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {connectedParentRepo as repo} from '@/lib/repositories/connected/parent';
import {nativeParentTeachers} from '@/lib/repositories/connected/parent-teachers';
import {nativeParentContext} from '@/lib/repositories/connected/parent-context';
import {beginParentExchange,clearParentSession,readParentView} from '@/lib/api/parent-session';
import {authenticationChanged,authorizationChanged,captureStaffAccess} from '@/lib/api/client';
import type {ApiSchemas} from '@/lib/api/generated';
import type {Ctx} from '@/lib/repositories/core';
const slug='parent-teachers-unit',viewId='66000000-0000-4000-8000-000000000001',other='66000000-0000-4000-8000-000000000002',schoolId='66000000-0000-4000-8000-000000000003',accessId='66000000-0000-4000-8000-000000000004';
const context=():ApiSchemas['ParentContext']=>({viewId,school:{name:'Trường giáo viên API',slug,publicContactPhone:null,shortName:null,motto:null,publicContactEmail:null,publicAddress:null},student:{displayName:'Con API',classLabel:'6A',schoolYearLabel:'2026–2027'},allowedSections:['teachers'],allowDownload:false,csrfToken:'owned-teacher-csrf',expiresAt:'2026-10-05T08:00:00Z',today:'2026-10-05',year:{label:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01'},relationshipLabel:'Mẹ',linkExpiresAt:'2026-11-01T00:00:00Z',lastPublishedAt:null});
const directory=():ApiSchemas['ParentTeacherDirectory']=>({today:'2026-10-05',classLabel:'6A',contactHours:null,teachers:[{kind:'HOMEROOM',displayName:'Chủ nhiệm công tác',subjectName:null,workEmail:null,workPhone:null,weekdays:[]},{kind:'SUBJECT',displayName:'Bộ môn công tác',subjectName:'Toán',workEmail:'work@example.invalid',workPhone:null,weekdays:[1,3,7]}]});
const response=(data:unknown)=>new Response(JSON.stringify({data,requestId:'parent-teacher-unit'}),{status:200,headers:{'Content-Type':'application/json'}});
const adopt=(id=viewId)=>beginParentExchange().adopt(slug,id,'owned-teacher-csrf');
beforeEach(()=>{clearParentSession();authenticationChanged();});afterEach(()=>{clearParentSession();vi.unstubAllGlobals();});
describe('Native parent teacher minimal display and current owner',()=>{
 it('retains only actual work contacts and published weekdays; absent school contacts/hours remain absent',()=>{
  const result=nativeParentTeachers(directory(),nativeParentContext(context(),slug).display);expect(result.homeroom).toMatchObject({name:'Chủ nhiệm công tác',className:'6A',phone:undefined,email:undefined});expect(result.subjects[0]).toMatchObject({subject:'Toán',email:'work@example.invalid',days:'Thứ 2, Thứ 4, CN'});expect(result.contactHours).toBeUndefined();expect(result.school.publicPhone).toBeNull();expect(JSON.stringify(result)).not.toMatch(/viewId|csrf|studentId|memberId/);
  const empty=nativeParentTeachers({...directory(),classLabel:null,teachers:[]},nativeParentContext(context(),slug).display);expect(empty.homeroom).toBeNull();expect(empty.subjects).toEqual([]);
 });
 it('rejects private fields, another class/date, invalid or unordered weekdays and invented assignment shape',()=>{
  const base=directory(),ctx=nativeParentContext(context(),slug).display;for(const value of [{...base,studentId:other},{...base,classLabel:'6B'},{...base,classLabel:null},{...base,today:'2026-10-06'},{...base,teachers:[{...base.teachers[1],userId:other}]},{...base,teachers:[{...base.teachers[1],weekdays:[7,1]}]},{...base,teachers:[{...base.teachers[1],weekdays:[1,1]}]},{...base,teachers:[{...base.teachers[1],subjectName:null}]},{...base,teachers:[base.teachers[0],base.teachers[0]]}])expect(()=>nativeParentTeachers(value as ApiSchemas['ParentTeacherDirectory'],ctx)).toThrow();
 });
 it('public composite context and teacher reads carry only their exact view header and accept real contact suppression',async()=>{
  adopt();let shared=true;const fetcher=vi.fn(async(input:string)=>{const data=directory();if(!shared)data.teachers[1].workEmail=null;return response(input.includes('teacher-directory')?data:context());});vi.stubGlobal('fetch',fetcher);
  expect((await repo.teachers({viewId},slug)).subjects[0].email).toBe('work@example.invalid');shared=false;expect((await repo.teachers({viewId},slug)).subjects[0].email).toBeUndefined();const calls=fetcher.mock.calls as unknown as Array<[string,RequestInit]>;for(const [url,options] of calls){expect(url).toMatch(new RegExp(`/parent/${slug}/(context|teacher-directory)$`));expect((options.headers as Record<string,string>)['X-Parent-View']).toBe(viewId);expect(options.body).toBeUndefined();}
 });
 it('slow older public teacher receipts cannot expose old contacts or clear a newly adopted child',async()=>{
  adopt();let resolve:(value:Response)=>void=()=>{throw new Error('not waiting');};let signal=()=>{};const waiting=new Promise<void>(r=>{signal=r;});vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.includes('teacher-directory')?new Promise<Response>(r=>{resolve=r;signal();}):response(context())));
  const pending=repo.teachers({viewId},slug);await waiting;adopt(other);resolve(response(directory()));await expect(pending).rejects.toMatchObject({code:'CONFLICT',details:{problemCode:'PARENT_CONTEXT_CHANGED'}});expect(readParentView(slug)).toBe(other);
 });
 it('section denial retains its view; invalid current session clears it',async()=>{
  adopt();let invalid=false;vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.includes('teacher-directory')?new Response(JSON.stringify({code:invalid?'PARENT_ACCESS_INVALID':'PARENT_SECTION_DENIED',requestId:'teacher-denied'}),{status:invalid?401:403,headers:{'Content-Type':'application/json'}}):response(context())));
  await expect(repo.teachers({viewId},slug)).rejects.toMatchObject({code:'FORBIDDEN'});expect(readParentView(slug)).toBe(viewId);invalid=true;await expect(repo.teachers({viewId},slug)).rejects.toMatchObject({code:'REVOKED'});expect(readParentView(slug)).toBeNull();
 });
 it('preview uses current independent staff/access scope without adopting or borrowing public view credentials',async()=>{
  adopt();const ctx:Ctx={actor:{kind:'staff',userId:other},today:'2026-10-05',now:'2026-10-05T01:00:00Z',staffOwner:captureStaffAccess()};const fetcher=vi.fn(async(input:string)=>response(input.endsWith('teacher-directory')?directory():context()));vi.stubGlobal('fetch',fetcher);expect((await repo.teachers({preview:{ctx,schoolId,accessId}},slug)).subjects).toHaveLength(1);expect(fetcher.mock.calls.map(([url])=>url)).toEqual([`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview/context`,`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview/teacher-directory`]);expect(readParentView(slug)).toBe(viewId);authorizationChanged();await expect(repo.teachers({preview:{ctx,schoolId,accessId}},slug)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(2);
 });
});
