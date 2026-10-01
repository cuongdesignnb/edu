import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {connectedAuthRepo} from '@/lib/repositories/connected/auth';
import {connectedSessionRepo} from '@/lib/repositories/connected/session';
import {authenticationChanged,captureStaffAccess,setStaffCsrf} from '@/lib/api/client';
import {invitationCredential,consumeInvitation,resetCredential,consumeResetCredential} from '@/lib/api/fragments';
import {readStaffSession,refreshStaffContext,logoutStaff,changeStaffPassword} from '@/lib/api/session';
import type {Ctx} from '@/lib/repositories/core';

const id='native-auth-invite',userId='00000000-0000-4000-8000-000000000001';
const envelope=(data:unknown)=>new Response(JSON.stringify({data,requestId:'native-auth-unit'}));
const context=()=>({user:{id:userId,displayName:'Nhân sự API',email:'synthetic@example.invalid',status:'ACTIVE',version:2,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},memberships:[],platformActions:[],csrfToken:'unit-csrf',serverNow:new Date().toISOString(),mode:'connected'});
function fragment(pathname:string,hash:string){
  const location={pathname,hash,search:''},setItem=vi.fn(),replaceState=vi.fn().mockImplementation(()=>{location.hash='';});
  vi.stubGlobal('window',{location,history:{state:null,replaceState},localStorage:{setItem},sessionStorage:{setItem}});
  return {location,setItem,replaceState};
}
function fetchApi(reply:(url:string,init:RequestInit)=>Response|Promise<Response>){
  const fetcher=vi.fn().mockImplementation((url:string,init:RequestInit)=>url.endsWith('/csrf')?Promise.resolve(envelope({csrfToken:'unit-public-csrf'})):Promise.resolve(reply(url,init)));
  vi.stubGlobal('fetch',fetcher);return fetcher;
}
beforeEach(()=>{authenticationChanged();consumeInvitation(id);consumeResetCredential();setStaffCsrf('unit-csrf');});
afterEach(()=>{authenticationChanged();consumeInvitation(id);consumeResetCredential();vi.unstubAllGlobals();});
describe('native authentication acknowledgements',()=>{
  it('does not consume a challenge or change authentication on a mismatched invitation ACK and retries the same intent',async()=>{
    const browser=fragment(`/invitations/${id}`,'#token=unit-invitation-secret&school=synthetic-school');let attempt=0;
    const fetcher=fetchApi(()=>envelope(++attempt===1?{id:'wrong-id',status:'ACCEPTED'}:{id,status:'ACCEPTED'}));
    const ctx={staffOwner:captureStaffAccess()} as Ctx;
    await expect(connectedSessionRepo.respondInvitation(ctx,id,true,'Người mới','SyntheticPassword123')).rejects.toMatchObject({code:'NETWORK'});
    expect(invitationCredential(id).token).toBe('unit-invitation-secret');expect(readStaffSession()).toBeNull();
    expect(await connectedSessionRepo.respondInvitation(ctx,id,true,'Người mới','SyntheticPassword123')).toEqual({accepted:true,userId:undefined});
    const commands=fetcher.mock.calls.filter(([url])=>!url.endsWith('/csrf'));
    expect(commands).toHaveLength(2);expect(commands[0][1].headers['Idempotency-Key']).toBe(commands[1][1].headers['Idempotency-Key']);
    expect(JSON.parse(commands[0][1].body)).toEqual({token:'unit-invitation-secret',schoolSlug:'synthetic-school',displayName:'Người mới',newPassword:'SyntheticPassword123'});
    expect(()=>invitationCredential(id)).toThrow();expect(readStaffSession()).toBeNull();expect(browser.setItem).not.toHaveBeenCalled();expect(browser.location.hash).toBe('');
  });
  it('keeps the challenge after a lost response and confirms declining without creating a session',async()=>{
    fragment(`/invitations/${id}`,'#token=unit-decline-secret&school=synthetic-school');let first=true;
    const fetcher=fetchApi(()=>{if(first){first=false;return Promise.reject(new Error('offline'));}return envelope({id,status:'DECLINED'});});
    await expect(connectedSessionRepo.respondInvitation({} as Ctx,id,false)).rejects.toMatchObject({code:'NETWORK'});
    expect(await connectedSessionRepo.respondInvitation({} as Ctx,id,false)).toEqual({accepted:false,userId:undefined});
    const commands=fetcher.mock.calls.filter(([url])=>!url.endsWith('/csrf'));expect(commands[0][1].headers['Idempotency-Key']).toBe(commands[1][1].headers['Idempotency-Key']);expect(readStaffSession()).toBeNull();
  });
  it('accepts an existing identity without changing its name/password or requiring an unacknowledged context refresh',async()=>{
    fragment(`/invitations/${id}`,'#token=unit-existing-secret&school=synthetic-school');
    const fetcher=fetchApi(url=>url.endsWith('/context')?envelope(context()):envelope({id,status:'ACCEPTED'}));
    await refreshStaffContext();const ctx={staffOwner:captureStaffAccess()} as Ctx;
    expect(await connectedSessionRepo.respondInvitation(ctx,id,true)).toEqual({accepted:true,userId});
    const commands=fetcher.mock.calls.filter(([url])=>url.endsWith('/accept'));expect(commands).toHaveLength(1);expect(JSON.parse(commands[0][1].body)).toEqual({token:'unit-existing-secret',schoolSlug:'synthetic-school'});
    expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/context'))).toHaveLength(1);
  });
  it('refuses a delayed invitation callback from a previous identity before submitting its token',async()=>{
    fragment(`/invitations/${id}`,'#token=unit-old-secret&school=synthetic-school');const ctx={staffOwner:captureStaffAccess()} as Ctx;authenticationChanged();const fetcher=fetchApi(()=>envelope({id,status:'ACCEPTED'}));
    await expect(connectedSessionRepo.respondInvitation(ctx,id,true)).rejects.toMatchObject({code:'NO_SESSION'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('consumes a password challenge only after COMPLETED and retains the idempotency key on a malformed ACK',async()=>{
    const browser=fragment('/reset-password','#token=unit-reset-secret');let attempt=0;const fetcher=fetchApi(()=>envelope({id:'challenge-id',status:++attempt===1?'ACCEPTED':'COMPLETED'}));
    await expect(connectedAuthRepo.completePasswordReset('', 'SyntheticPassword123','SyntheticPassword123')).rejects.toMatchObject({code:'NETWORK'});expect(resetCredential()).toBe('unit-reset-secret');
    expect(await connectedAuthRepo.completePasswordReset('', 'SyntheticPassword123','SyntheticPassword123')).toEqual({done:true});expect(resetCredential()).toBeNull();expect(browser.setItem).not.toHaveBeenCalled();
    const commands=fetcher.mock.calls.filter(([url])=>!url.endsWith('/csrf'));expect(commands[0][1].headers['Idempotency-Key']).toBe(commands[1][1].headers['Idempotency-Key']);expect(JSON.parse(commands[1][1].body).token).toBe('unit-reset-secret');
  });
  it('does not report a password reset request as accepted after an invalid acknowledgement',async()=>{
    const fetcher=fetchApi(()=>envelope({id:null,status:'ACCEPTED'}));await expect(connectedAuthRepo.requestPasswordReset('synthetic@example.invalid')).rejects.toMatchObject({code:'NETWORK'});expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('preserves the actual session after invalid logout or password-change acknowledgements',async()=>{
    let phase='context';const fetcher=fetchApi(()=>phase==='context'?envelope(context()):phase==='logout'?envelope({id:userId,status:'ACTIVE'}):envelope({id:'other-user',status:'COMPLETED'}));
    await refreshStaffContext();phase='logout';await expect(logoutStaff()).rejects.toMatchObject({code:'NETWORK'});expect(readStaffSession()?.actor).toEqual({kind:'staff',userId});
    phase='password';await expect(changeStaffPassword('SyntheticOld123','SyntheticNew123')).rejects.toMatchObject({code:'NETWORK'});expect(readStaffSession()?.actor).toEqual({kind:'staff',userId});expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
