import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedSessionRepo} from '@/lib/repositories/connected/session';
import {authenticationChanged,authorizationChanged,captureStaffAccess,onStaffMutationAcknowledged,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

beforeEach(()=>{authenticationChanged();setStaffCsrf('session-fixture');});
afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});
describe('native session command ownership',()=>{
  it('does not submit a prior-login profile or notification/session callback',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const ctx={staffOwner:captureStaffAccess()} as Ctx;authenticationChanged();
    await expect(connectedSessionRepo.updateProfile(ctx,{fullName:'Prior form',workPhone:'',version:2})).rejects.toMatchObject({code:'NO_SESSION'});await expect(connectedSessionRepo.markNotificationsRead(ctx,['prior-id'])).rejects.toMatchObject({code:'NO_SESSION'});await expect(connectedSessionRepo.revokeSession(ctx,'prior-id')).rejects.toMatchObject({code:'NO_SESSION'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('stops a multi-command notification batch between acknowledged steps after scope changes',async()=>{
    const fetcher=vi.fn().mockImplementation(()=>Promise.resolve(new Response(JSON.stringify({data:{read:true},requestId:'actual-ack'}))));vi.stubGlobal('fetch',fetcher);const ctx={staffOwner:captureStaffAccess()} as Ctx,unsubscribe=onStaffMutationAcknowledged(()=>authorizationChanged());
    try{await expect(connectedSessionRepo.markNotificationsRead(ctx,['first-id','second-id'])).rejects.toMatchObject({code:'FORBIDDEN',details:{scopeChanged:true}});expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toContain('/first-id/read');}finally{unsubscribe();}
  });
});
