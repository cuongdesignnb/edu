import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {QueryClient} from '@tanstack/react-query';
import {connectedParentRepo as repo,connectedParentExtraRepo as extra} from '@/lib/repositories/connected/parent';
import {beginParentExchange,captureParentSession,clearParentSession,readParentView,readParentFault} from '@/lib/api/parent-session';
import {authenticationChanged,authorizationChanged,captureStaffAccess} from '@/lib/api/client';
import {bindParentQueries} from '@/lib/api/parent-query-boundary';
import type {ApiSchemas} from '@/lib/api/generated';
import type {Ctx} from '@/lib/repositories/core';

const slug='native-parent-intake',first='62000000-0000-4000-8000-000000000001',second='62000000-0000-4000-8000-000000000002',accessId='62000000-0000-4000-8000-000000000003',schoolId='62000000-0000-4000-8000-000000000004';
const wire=(viewId=first):ApiSchemas['ParentContext']=>({viewId,school:{name:'Trường API',slug,publicContactPhone:null,shortName:null,motto:null,publicContactEmail:null,publicAddress:null},student:{displayName:'Con API',classLabel:'6A',schoolYearLabel:'2026–2027'},allowedSections:['overview','attendance'],allowDownload:false,csrfToken:'synthetic-parent-csrf',expiresAt:'2026-10-01T08:00:00Z',today:'2026-10-01',year:{label:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01'},relationshipLabel:'Mẹ',linkExpiresAt:'2026-11-01T00:00:00Z',lastPublishedAt:null});
const response=(data:unknown)=>new Response(JSON.stringify({data,requestId:'synthetic-parent-intake'}),{status:200,headers:{'Content-Type':'application/json'}});
const error=(status:number,code:string)=>new Response(JSON.stringify({code,status,requestId:'synthetic-parent-intake-error'}),{status,headers:{'Content-Type':'application/json'}});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
let stored:Map<string,string>;
beforeEach(()=>{clearParentSession();authenticationChanged();stored=new Map();vi.stubGlobal('window',{sessionStorage:{getItem:(k:string)=>stored.get(k)??null,setItem:(k:string,v:string)=>stored.set(k,v),removeItem:(k:string)=>stored.delete(k)}});});
afterEach(()=>{clearParentSession();vi.unstubAllGlobals();});
const adopt=(viewId=first)=>beginParentExchange().adopt(slug,viewId,'synthetic-owned-csrf');
describe('Native parent exchange/context ownership; remaining content facade methods remain unavailable',()=>{
  it('uses a fragment only in the exchange body and retains only a non-bearer pointer after a validated receipt',async()=>{
    const fetcher=vi.fn(async(input:string,options?:RequestInit)=>input.endsWith('/csrf')?response({csrfToken:'synthetic-bootstrap'}):(expect(JSON.parse(String(options?.body))).toEqual({token:'synthetic-fragment-secret'}),response(wire())));vi.stubGlobal('fetch',fetcher);
    const result=await repo.open({token:'synthetic-fragment-secret'},slug);expect(result).toMatchObject({ok:true,homeModule:'overview'});expect(readParentView(slug)).toBe(first);expect([...stored.values()]).toEqual([JSON.stringify({slug,viewId:first})]);expect(JSON.stringify(result)).not.toMatch(/synthetic-fragment|csrf|viewId/);
    const exchange=fetcher.mock.calls.find(([url])=>!url.endsWith('/csrf'))!;expect(exchange[0]).toBe(`/api/v1/parent/${slug}/access/exchange`);expect(exchange[1]).toMatchObject({credentials:'include',cache:'no-store'});expect(exchange[1]?.headers).toMatchObject({'X-CSRF-Token':'synthetic-bootstrap'});expect(exchange[0]).not.toContain('secret');
  });
  it('clears previous ownership and aborts reads before an exchange can return, and honors a link without overview',async()=>{
    adopt();const previous=captureParentSession(slug,first),pending=deferred<Response>();vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.endsWith('/csrf')?response({csrfToken:'bootstrap'}):pending.promise));
    const work=repo.open({token:'synthetic-next-fragment'},slug);expect(readParentView(slug)).toBeNull();expect(previous.signal.aborted).toBe(true);
    pending.resolve(response({...wire(second),allowedSections:['attendance']}));expect(await work).toMatchObject({homeModule:'attendance',overviewAllowed:false});expect(readParentView(slug)).toBe(second);
  });
  it('rejects a late old exchange receipt without clearing the newer child ownership',async()=>{
    const pending=deferred<Response>();let exchanges=0;vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.endsWith('/csrf')?response({csrfToken:'bootstrap'}):++exchanges===1?pending.promise:response(wire(second))));
    const old=repo.open({token:'old-fragment'},slug);await vi.waitFor(()=>expect(exchanges).toBe(1));await repo.open({token:'new-fragment'},slug);pending.resolve(response(wire(first)));await expect(old).rejects.toMatchObject({code:'CONFLICT',details:{problemCode:'PARENT_CONTEXT_CHANGED'}});expect(readParentView(slug)).toBe(second);
  });
  it('reads through the exact parent view header and returns display without CSRF or other credentials',async()=>{
    adopt();const fetcher=vi.fn(async()=>response(wire()));vi.stubGlobal('fetch',fetcher);const display=await repo.context({viewId:first},slug);expect(display.student.fullName).toBe('Con API');expect(fetcher.mock.calls[0]).toMatchObject([`/api/v1/parent/${slug}/context`,{headers:{'X-Parent-View':first},credentials:'include'}]);expect(JSON.stringify(display)).not.toMatch(/csrf|viewId|synthetic-owned/);expect(captureParentSession(slug,first).csrfToken).toBe('synthetic-parent-csrf');
    await expect(repo.context({viewId:second},slug)).rejects.toMatchObject({code:'CONFLICT'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects wrong-view and private-field context receipts before a child can enter cache',async()=>{
    adopt();vi.stubGlobal('fetch',vi.fn(async()=>response(wire(second))));await expect(repo.context({viewId:first},slug)).rejects.toMatchObject({code:'CONFLICT'});expect(readParentView(slug)).toBeNull();expect(readParentFault(slug)).toBe('changed');
    adopt();vi.stubGlobal('fetch',vi.fn(async()=>response({...wire(),student:{...wire().student,dateOfBirth:'2013-01-01'}})));await expect(repo.context({viewId:first},slug)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('clears only the owned view for an invalid server session and exposes a nonsecret terminal reason',async()=>{
    adopt();const owner=captureParentSession(slug,first);vi.stubGlobal('fetch',vi.fn(async()=>error(401,'PARENT_ACCESS_INVALID')));await expect(repo.context({viewId:first},slug)).rejects.toMatchObject({details:{problemCode:'PARENT_ACCESS_INVALID'}});expect(readParentView(slug)).toBeNull();expect(readParentFault(slug)).toBe('invalid');expect(stored.size).toBe(0);expect(owner.signal.aborted).toBe(true);
  });
  it('does not invalidate a still-owned view for transport or section-denial errors',async()=>{
    adopt();vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));await expect(repo.context({viewId:first},slug)).rejects.toMatchObject({code:'READ_ERROR'});expect(readParentView(slug)).toBe(first);
    vi.stubGlobal('fetch',vi.fn(async()=>error(403,'PARENT_SECTION_DENIED')));await expect(repo.context({viewId:first},slug)).rejects.toMatchObject({code:'FORBIDDEN'});expect(readParentFault(slug)).toBeNull();expect(readParentView(slug)).toBe(first);
  });
  it('rejects a slow old read after a new child is adopted without invalidating that child',async()=>{
    adopt();const pending=deferred<Response>();vi.stubGlobal('fetch',vi.fn(async()=>pending.promise));const read=repo.context({viewId:first},slug);adopt(second);pending.resolve(error(401,'PARENT_ACCESS_INVALID'));await expect(read).rejects.toMatchObject({code:'CONFLICT'});expect(readParentView(slug)).toBe(second);expect(readParentFault(slug)).toBeNull();
  });
  it('previews through independent current staff ownership, without replacing a public parent view',async()=>{
    adopt();const ctx={staffOwner:captureStaffAccess()} as Ctx,fetcher=vi.fn(async(_input:string)=>response(wire(second)));vi.stubGlobal('fetch',fetcher);expect(await repo.context({preview:{ctx,schoolId,accessId}},slug)).toMatchObject({isPreview:true});expect(readParentView(slug)).toBe(first);expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview/context`);
    authorizationChanged();await expect(repo.context({preview:{ctx,schoolId,accessId}},slug)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('derives only the actual inclusive year navigation bound and actual nullable public school contact',async()=>{
    adopt();vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.includes('/public/')?response({name:'Trường công khai',slug,announcements:[]}):response(wire())));expect(await extra.grantedYear({viewId:first},slug)).toEqual({label:'2026–2027',startDate:'2026-09-01',endDate:'2027-05-31'});expect(await repo.publicSchool(slug)).toEqual({school:{name:'Trường công khai',slug,address:null,publicPhone:null,publicEmail:null}});
    vi.stubGlobal('fetch',vi.fn(async()=>response({name:'Wrong school',slug:'foreign',announcements:[]})));await expect(repo.publicSchool(slug)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('rejects the old overview envelope on the context-only preview purpose',async()=>{
    adopt();const ctx={staffOwner:captureStaffAccess()} as Ctx;vi.stubGlobal('fetch',vi.fn(async()=>response({context:wire(second),attendance:[]})));await expect(repo.context({preview:{ctx,schoolId,accessId}},slug)).rejects.toMatchObject({code:'READ_ERROR'});expect(readParentView(slug)).toBe(first);expect(readParentFault(slug)).toBeNull();
  });
  it('rejects a slow preview context after its independent staff authority changes',async()=>{
    adopt();const pending=deferred<Response>(),ctx={staffOwner:captureStaffAccess()} as Ctx;vi.stubGlobal('fetch',vi.fn(async()=>pending.promise));const read=repo.context({preview:{ctx,schoolId,accessId}},slug);authorizationChanged();pending.resolve(response(wire(second)));await expect(read).rejects.toMatchObject({code:'FORBIDDEN'});expect(readParentView(slug)).toBe(first);expect(readParentFault(slug)).toBeNull();
  });
  it('a denied preview context does not terminate or replace the public child session',async()=>{
    adopt();const ctx={staffOwner:captureStaffAccess()} as Ctx;vi.stubGlobal('fetch',vi.fn(async()=>error(401,'PARENT_ACCESS_INVALID')));await expect(repo.context({preview:{ctx,schoolId,accessId}},slug)).rejects.toMatchObject({code:'NO_SESSION'});expect(readParentView(slug)).toBe(first);expect(readParentFault(slug)).toBeNull();
  });
});
describe('Private parent query cache ownership',()=>{
  it('purges public child/file results on a new link, purges staff previews on staff changes and retains unrelated queries',()=>{
    const client=new QueryClient(),dispose=bindParentQueries(client);client.setQueryData(['parent',1,null,slug,'context'],{private:'child'});client.setQueryData(['parent',1,accessId,slug,'context'],{private:'preview'});client.setQueryData(['parent-file','view',slug],{private:'file'});client.setQueryData(['staff-api','retained'],{owned:'staff'});
    beginParentExchange();expect(client.getQueryData(['parent',1,null,slug,'context'])).toBeUndefined();expect(client.getQueryData(['parent-file','view',slug])).toBeUndefined();expect(client.getQueryData(['parent',1,accessId,slug,'context'])).toEqual({private:'preview'});client.setQueryData(['parent',2,null,slug,'context'],{private:'current-child'});
    authorizationChanged();expect(client.getQueryData(['parent',1,accessId,slug,'context'])).toBeUndefined();expect(client.getQueryData(['parent',2,null,slug,'context'])).toEqual({private:'current-child'});expect(client.getQueryData(['staff-api','retained'])).toEqual({owned:'staff'});dispose();client.clear();
  });
});
