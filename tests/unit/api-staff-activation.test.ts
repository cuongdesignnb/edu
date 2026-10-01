import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {staffRepo} from '@/lib/repositories';
import {authenticationChanged,authorizationChanged,captureStaffAccess,onStaffMutationAcknowledged,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

const ctx={} as Ctx,schoolId='00000000-0000-4000-8000-000000000001',memberId='00000000-0000-4000-8000-000000000002',roleId='00000000-0000-4000-8000-000000000003',classId='00000000-0000-4000-8000-000000000004';
const now='2026-10-01T00:00:00Z';
const member={id:memberId,version:8,userId:memberId,status:'SUSPENDED',workDisplayName:'Nhân sự API',shareWorkContact:false,schoolRoleGrants:[],grants:[],joinedAt:now,endedAt:null,statusReason:'Lý do thật'};
const role={id:roleId,version:3,createdAt:now,updatedAt:now,code:'CUSTOM',label:'Vai trò API',systemRole:false,status:'ACTIVE',scopes:['CLASS','SUBJECT'],memberCount:0,assignmentCount:0,permissions:[{action:'student.read',scopes:['CLASS','SUBJECT']}]};
const envelope=(data:unknown,page?:unknown)=>new Response(JSON.stringify({data,requestId:'staff-activation',...(page?{page}:{})}));
beforeEach(()=>{authenticationChanged();setStaffCsrf('staff-csrf');});
afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});

it('activates purpose-bound invitation choices without reading the role catalog or reconstructing delegation',async()=>{
  const choices={roles:[{id:roleId,version:4,label:'Vai trò API',code:'CUSTOM',systemRole:false,canDelegate:true,delegationUntil:now}]};
  const fetcher=vi.fn().mockResolvedValue(envelope(choices));vi.stubGlobal('fetch',fetcher);
  expect(await staffRepo.invitationOptions(ctx,schoolId)).toEqual(choices);expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toContain('/staff-invitation-options');
});
it('uses assignment write authority to select classes and requires an explicit year',async()=>{
  const fetcher=vi.fn().mockResolvedValue(envelope([{id:classId,version:1,name:'Lớp API',status:'DRAFT'}],{limit:100,total:1,nextCursor:null,hasMore:false}));vi.stubGlobal('fetch',fetcher);
  await expect(staffRepo.assignmentClasses(ctx,schoolId,'')).rejects.toMatchObject({code:'VALIDATION'});expect(fetcher).not.toHaveBeenCalled();
  expect(await staffRepo.assignmentClasses(ctx,schoolId,classId)).toEqual([{id:classId,name:'Lớp API',status:'draft'}]);const url=new URL(fetcher.mock.calls[0][0],'http://example.invalid');expect(url.searchParams.get('purpose')).toBe('assignment-picker');expect(url.searchParams.get('yearId')).toBe(classId);
});
it('reads the bounded staff-only history projection and keeps an unavailable count explicit',async()=>{
  const fetcher=vi.fn().mockResolvedValue(envelope([{id:roleId,actorLabel:'Tác giả API',createdAt:now,action:'approveHandover',targetType:'handover',changes:[],reason:'Lý do'}]));vi.stubGlobal('fetch',fetcher);
  const data=await staffRepo.staffActivity(ctx,schoolId,{limit:10,handover:true});expect(data.total).toBeNull();expect(data.items[0].action).toBe('Bàn giao chủ nhiệm');expect(fetcher.mock.calls[0][0]).toContain('/staff-activity?');expect(fetcher.mock.calls[0][0]).toContain('action=approveHandover');
});
it.each([{...member,status:'ACTIVE'},{...member,version:7},{...member,id:roleId}])('does not clear a form or consume its retry key after an unconfirmed member lifecycle ACK',async bad=>{
  const fetcher=vi.fn().mockResolvedValueOnce(envelope(bad)).mockResolvedValueOnce(envelope(member)),ack=vi.fn(),off=onStaffMutationAcknowledged(ack);vi.stubGlobal('fetch',fetcher);
  try{await expect(staffRepo.setMembershipStatus(ctx,schoolId,memberId,'suspended','Lý do thật',7)).rejects.toMatchObject({code:'NETWORK'});expect(ack).not.toHaveBeenCalled();
    expect((await staffRepo.setMembershipStatus(ctx,schoolId,memberId,'suspended','Lý do thật',7)).status).toBe('suspended');expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);expect(ack).toHaveBeenCalledTimes(1);
  }finally{off();}
});
it('requires the role ACK to preserve every reviewed action scope, then retries the same command',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(envelope({...role,permissions:[{action:'student.read',scopes:['SCHOOL']}]})).mockResolvedValueOnce(envelope(role)),ack=vi.fn(),off=onStaffMutationAcknowledged(ack);vi.stubGlobal('fetch',fetcher);
  try{await expect(staffRepo.saveRole(ctx,schoolId,roleId,[{action:'student.read',scopes:['CLASS','SUBJECT']}],2,'Giữ phạm vi')).rejects.toMatchObject({code:'NETWORK'});expect(ack).not.toHaveBeenCalled();
    const saved=await staffRepo.saveRole(ctx,schoolId,roleId,[{action:'student.read',scopes:['CLASS','SUBJECT']}],2,'Giữ phạm vi');expect(saved.permissions).toEqual(role.permissions);expect(ack).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);
  }finally{off();}
});
it('rejects extension reads captured before a permission change without sending a request',async()=>{
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const stale={staffOwner:captureStaffAccess()} as Ctx;authorizationChanged();
  for(const work of [()=>staffRepo.invitationOptions(stale,schoolId),()=>staffRepo.assignmentClasses(stale,schoolId,classId),()=>staffRepo.staffActivity(stale,schoolId,{limit:10})])await expect(work()).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).not.toHaveBeenCalled();
});
