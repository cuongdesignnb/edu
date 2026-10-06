import {describe,expect,it} from 'vitest';
import {QueryClient,QueryObserver} from '@tanstack/react-query';
import type {ApiSchemas} from '@/lib/api/generated';
import {canQuickCreate} from '@/lib/domain/form-permissions';
import {refreshFormOptions,pickerStatusAllowed,validPickerValue} from '@/lib/query/form-options';
import {visibleTabScroll} from '@/features/classroom/tab-scroll';
const schoolId='school-a',classId='class-a';
function context(actions:string[],patch:Record<string,unknown>={}){return {serverNow:'2026-10-06T03:00:00Z',memberships:[{schoolId,status:'ACTIVE',schoolStatus:'ACTIVE',today:'2026-10-06',grants:[{scopeType:'SCHOOL',validFrom:'2026-10-01T00:00:00Z',validUntil:null,revokedAt:null,actions,...patch}]}]} as unknown as ApiSchemas['Context'];}
describe('form picker semantics and native quick creation authority',()=>{
 it('assignment choices include DRAFT/ACTIVE while runtime schedule choices exclude DRAFT/ARCHIVED',()=>{const fixture=[{id:'draft',status:'DRAFT'},{id:'active',status:'ACTIVE'},{id:'archived',status:'ARCHIVED'}];expect(fixture.filter(c=>pickerStatusAllowed(c.status,'assignment')).map(c=>c.id)).toEqual(['draft','active']);expect(fixture.filter(c=>pickerStatusAllowed(c.status,'runtime')).map(c=>c.id)).toEqual(['active']);expect(validPickerValue('draft',fixture.filter(c=>c.id==='active'))).toBe(false);});
 it('rejects anonymous, foreign, suspended, expired, revoked and incomplete creation rights',()=>{
  expect(canQuickCreate(null,'teacher',schoolId)).toBe(false);expect(canQuickCreate(context(['member.create_direct']),'teacher',schoolId)).toBe(false);
  const full=context(['member.create_direct','role.manage']);expect(canQuickCreate(full,'teacher',schoolId)).toBe(true);expect(canQuickCreate(full,'teacher','school-b')).toBe(false);
  for(const patch of [{revokedAt:'2026-10-05T00:00:00Z'},{validUntil:'2026-10-06T03:00:00Z'},{validFrom:'2026-10-07T00:00:00Z'},{scopeType:'CLASS',classId}])expect(canQuickCreate(context(['member.create_direct','role.manage'],patch),'teacher',schoolId,classId)).toBe(false);
  full.memberships[0].status='SUSPENDED';expect(canQuickCreate(full,'teacher',schoolId)).toBe(false);
 });
 it('does not combine split grants and respects the homeroom effective date for student quick creation',()=>{const split=context(['member.create_direct']);split.memberships[0].grants.push({...split.memberships[0].grants[0],actions:['role.manage']});expect(canQuickCreate(split,'teacher',schoolId)).toBe(false);
  const grant={scopeType:'CLASS',classId,roleCode:'HOMEROOM',assignmentStartsOn:'2026-10-06',assignmentEndsOn:'2026-10-07'};expect(canQuickCreate(context(['student.manage'],grant),'student',schoolId,classId)).toBe(true);expect(canQuickCreate(context(['student.manage'],grant),'student',schoolId,'class-b')).toBe(false);expect(canQuickCreate(context(['student.manage'],{...grant,assignmentStartsOn:'2026-10-07'}),'student',schoolId,classId)).toBe(false);expect(canQuickCreate(context(['student.manage'],{...grant,assignmentEndsOn:'2026-10-06'}),'student',schoolId,classId)).toBe(false);
 });
 it('refreshes mounted options after creation without touching parent/public/foreign caches',async()=>{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});let rows=[{id:'old'}],reads=0;
  const observer=new QueryObserver(client,{queryKey:['staff-api',1,'school-form-options',schoolId],queryFn:async()=>{reads++;return rows;}}),off=observer.subscribe(()=>{});
  try{await observer.refetch();client.setQueryData(['parent',1,'view'],{published:true});client.setQueryData(['staff-api',1,'school-form-options','school-b'],{foreign:true});rows=[...rows,{id:'new'}];await refreshFormOptions(client,schoolId);expect(observer.getCurrentResult().data?.map(x=>x.id)).toEqual(['old','new']);expect(reads).toBeGreaterThanOrEqual(2);expect(client.getQueryState(['staff-api',1,'school-form-options','school-b'])?.isInvalidated).toBe(false);expect(client.getQueryData(['parent',1,'view'])).toEqual({published:true});}finally{off();client.clear();}
 });
 it('retries an observed failed options read after a successful creation',async()=>{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});let available=false;
  const observer=new QueryObserver(client,{queryKey:['staff-api',1,'school-form-options',schoolId],queryFn:async()=>{if(!available)throw new Error('temporary options failure');return [{id:'created'}];}}),off=observer.subscribe(()=>{});
  try{await observer.refetch();expect(observer.getCurrentResult().isError).toBe(true);available=true;await refreshFormOptions(client,schoolId);expect(observer.getCurrentResult().isError).toBe(false);expect(observer.getCurrentResult().data).toEqual([{id:'created'}]);}finally{off();client.clear();}
 });
});
describe('class tab horizontal restoration',()=>{
 it('preserves a visible tab and centers tabs outside either edge',()=>{expect(visibleTabScroll(400,300,1800,{left:450,width:100})).toBe(400);expect(visibleTabScroll(0,300,1800,{left:1200,width:100})).toBe(1100);expect(visibleTabScroll(1200,300,1800,{left:400,width:100})).toBe(300);});
 it('clamps persisted offsets across resized layouts and short tab rows',()=>{expect(visibleTabScroll(1900,300,1800,null)).toBe(1500);expect(visibleTabScroll(-90,300,1800,{left:0,width:100})).toBe(0);expect(visibleTabScroll(400,900,500,{left:200,width:100})).toBe(0);});
});
