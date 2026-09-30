import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedStaffRepo} from '@/lib/repositories/connected/staff';
import {authenticationChanged,authorizationChanged,captureStaffAccess,setStaffCsrf} from '@/lib/api/client';
import {nativeActionLabel} from '@/lib/api/action-labels';
import type {ApiSchemas} from '@/lib/api/generated';
import type {Ctx} from '@/lib/repositories/core';

const ctx={} as Ctx,schoolId='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const permissions:ApiSchemas['Role']['permissions']=[{action:'student.read',scopes:['CLASS','SUBJECT']},{action:'native.future.action',scopes:['SCHOOL']}];
const row={id,version:4,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T01:00:00Z',code:'NATIVE',label:'Mẫu quyền thật',systemRole:false,status:'ACTIVE',permissions,scopes:['CLASS','SCHOOL','SUBJECT'],memberCount:17,assignmentCount:9};
const details={role:row,canEdit:false,ownRole:false,systemRole:false,canViewMembers:false,canViewHistory:false,actions:[{action:'student.read',canGrant:true},{action:'native.future.action',canGrant:false}],members:null,history:null};
const envelope=(data:unknown,page?:unknown)=>new Response(JSON.stringify({data,requestId:'role-adapter',...(page?{page}:{})}));
beforeEach(()=>{authenticationChanged();setStaffCsrf('role-csrf');});
afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});

describe('native role adapters',()=>{
  it('keeps SQL counts, mixed scopes and every native action instead of converting permissions to lossy legacy keys',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope([row],{limit:100,total:1,hasMore:false,nextCursor:null})));
    const [role]=await connectedStaffRepo.roles(ctx,schoolId);expect(role).toMatchObject({memberCount:17,assignmentCount:9,description:null,level:'mixed',version:4});expect(role.actions).toEqual(['student.read','native.future.action']);expect(role.permissions).toEqual(permissions);expect(role.scopes).toEqual(row.scopes);
  });
  it('retains denied holder/history panels and exact server edit flags without borrowing staff or audit reads',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope(details));vi.stubGlobal('fetch',fetcher);
    const view=await connectedStaffRepo.role(ctx,schoolId,id);expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toContain('/roles/'+id+'/details');expect(view).toMatchObject({canEdit:false,ownRole:false,members:null,history:null});expect(view.myActions).toEqual(['student.read']);expect(view.all.map(a=>a.key)).toEqual(['student.read','native.future.action']);expect(view.all[0].label).toBe('Xem học sinh');
  });
  it('submits explicit reviewed native scopes and version and returns actual saved counts/metadata',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({...row,version:5}));vi.stubGlobal('fetch',fetcher);
    const saved=await connectedStaffRepo.saveRole(ctx,schoolId,id,permissions,4,'  Lý do thật  ');expect(saved.version).toBe(5);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({permissions,expectedVersion:4,reason:'Lý do thật'});expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBeTruthy();
  });
  it('rejects unspecified scopes, duplicated actions, missing reviewed versions and unavailable counts before inventing results',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({...details,role:{...row,memberCount:undefined}}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedStaffRepo.saveRole(ctx,schoolId,id,['student.read'] as unknown as ApiSchemas['Role']['permissions'],4,'Lý do')).rejects.toMatchObject({code:'VALIDATION'});
    await expect(connectedStaffRepo.saveRole(ctx,schoolId,id,[{action:'student.read',scopes:[]}],4,'Lý do')).rejects.toMatchObject({code:'VALIDATION'});
    await expect(connectedStaffRepo.saveRole(ctx,schoolId,id,[permissions[0],permissions[0]],4,'Lý do')).rejects.toMatchObject({code:'VALIDATION'});
    await expect(connectedStaffRepo.saveRole(ctx,schoolId,id,permissions,undefined as unknown as number,'Lý do')).rejects.toMatchObject({code:'CONFLICT'});expect(fetcher).not.toHaveBeenCalled();
    await expect(connectedStaffRepo.role(ctx,schoolId,id)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('blocks stale render ownership for role reads and saves and labels native multi-part actions without aliasing them',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const stale={staffOwner:captureStaffAccess()} as Ctx;authorizationChanged();
    for(const work of [()=>connectedStaffRepo.roles(stale,schoolId),()=>connectedStaffRepo.role(stale,schoolId,id),()=>connectedStaffRepo.saveRole(stale,schoolId,id,permissions,4,'Lý do')])await expect(work()).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).not.toHaveBeenCalled();expect(nativeActionLabel('conduct.adjust.approve').label).toBe('Duyệt điều chỉnh thi đua');
  });
});
