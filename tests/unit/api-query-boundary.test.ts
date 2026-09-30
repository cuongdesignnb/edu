import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {QueryClient} from '@tanstack/react-query';
import {authenticationChanged,authorizationChanged,http,setStaffCsrf,staffAccessRevision} from '@/lib/api/client';
import {bindStaffQueries,STAFF_QUERY_DOMAIN} from '@/lib/api/query-boundary';
import {RepoError} from '@/lib/repositories/errors';

const schoolId='00000000-0000-4000-8000-000000000001';
const envelope=(data:unknown)=>new Response(JSON.stringify({data,requestId:'query-boundary'}));
beforeEach(()=>{authenticationChanged();setStaffCsrf('query-csrf');});
afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();vi.useRealTimers();});

describe('native staff query boundary',()=>{
  it('cancels private queries and removes their cache immediately while leaving parent/public partitions intact',async()=>{
    const client=new QueryClient(),cancel=vi.spyOn(client,'cancelQueries'),bridge=bindStaffQueries(client,{onReady:vi.fn(),onError:vi.fn(),restore:async()=>null});
    try{client.setQueryData([STAFF_QUERY_DOMAIN,staffAccessRevision(),'class'],{private:true});client.setQueryData(['parent-api','view-id'],{ownChild:true});client.setQueryData(['public-api','school'],{published:true});
      authorizationChanged();expect(cancel).toHaveBeenCalledWith({queryKey:[STAFF_QUERY_DOMAIN]});expect(client.getQueriesData({queryKey:[STAFF_QUERY_DOMAIN]})).toEqual([]);expect(client.getQueryData(['parent-api','view-id'])).toEqual({ownChild:true});expect(client.getQueryData(['public-api','school'])).toEqual({published:true});
    }finally{bridge.dispose();client.clear();}
  });
  it('reauthorizes before invalidating reads after a confirmed mutation and does not refresh after a read-only preview',async()=>{
    const client=new QueryClient(),order:string[]=[],restore=vi.fn(async()=>{order.push('restore');return null;}),ready=vi.fn(),error=vi.fn(),invalidate=vi.spyOn(client,'invalidateQueries').mockImplementation(async()=>{order.push('invalidate');});
    const bridge=bindStaffQueries(client,{onReady:ready,onError:error,restore});vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>envelope({actual:true})));
    try{await http('previewStaffAssignment',{params:{schoolId},body:{memberId:schoolId,classId:schoolId,kind:'HOMEROOM',startsOn:'2026-10-01'}});expect(restore).not.toHaveBeenCalled();
      await http('updateRole',{params:{schoolId,roleId:schoolId},body:{expectedVersion:1,reason:'Lý do thật',permissions:[]}});await vi.waitFor(()=>expect(invalidate).toHaveBeenCalledTimes(1));expect(order).toEqual(['restore','invalidate']);expect(ready).toHaveBeenCalledTimes(1);expect(error).not.toHaveBeenCalled();
    }finally{bridge.dispose();client.clear();}
  });
  it('deduplicates refreshes, reports a real refresh error and prevents an unmounted bridge from touching cache or UI',async()=>{
    const client=new QueryClient(),gate=Promise.withResolvers<unknown>(),restore=vi.fn(()=>gate.promise),ready=vi.fn(),error=vi.fn(),invalidate=vi.spyOn(client,'invalidateQueries');
    const bridge=bindStaffQueries(client,{onReady:ready,onError:error,restore});const first=bridge.refresh(),second=bridge.refresh();expect(first).toBe(second);expect(restore).toHaveBeenCalledTimes(1);bridge.dispose();gate.resolve(null);expect(await first).toBe(false);expect(ready).not.toHaveBeenCalled();expect(invalidate).not.toHaveBeenCalled();
    const failure=new RepoError('READ_ERROR','Máy chủ không trả phiên thật'),other=bindStaffQueries(client,{onReady:ready,onError:error,restore:async()=>{throw failure;}});
    try{expect(await other.refresh()).toBe(false);expect(error).toHaveBeenCalledWith(failure);expect(ready).not.toHaveBeenCalled();expect(invalidate).not.toHaveBeenCalled();}finally{other.dispose();client.clear();}
  });
  it('physically aborts staff transport on access change while an independent parent request can finish',async()=>{
    const begun=Promise.withResolvers<void>(),parent=Promise.withResolvers<Response>();let parentSignal:AbortSignal|undefined;
    vi.stubGlobal('fetch',vi.fn().mockImplementation((url:string,init:RequestInit)=>{
      if(url.includes('/parent/')){parentSignal=init.signal!;return parent.promise;}
      return new Promise<Response>((_resolve,reject)=>{init.signal!.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});begun.resolve();});
    }));
    const staff=http('getMyContext'),staffFailure=expect(staff).rejects.toMatchObject({code:'FORBIDDEN'}),parentWork=http('getParentOverview',{params:{schoolSlug:'synthetic-school'},parentViewId:'independent-view'});await begun.promise;authorizationChanged();await staffFailure;expect(parentSignal!.aborted).toBe(false);parent.resolve(envelope({ownChild:true}));expect((await parentWork).data).toEqual({ownChild:true});
  });
  it('combines a caller abort signal with the deadline and retains explicit read errors on cancelled requests',async()=>{
    const controller=new AbortController(),begun=Promise.withResolvers<void>();
    vi.stubGlobal('fetch',vi.fn().mockImplementation((_url:string,init:RequestInit)=>new Promise<Response>((_resolve,reject)=>{init.signal!.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true});begun.resolve();})));
    const work=http('getMyContext',{signal:controller.signal}),failure=expect(work).rejects.toMatchObject({code:'READ_ERROR'});await begun.promise;controller.abort();await failure;
  });
});
