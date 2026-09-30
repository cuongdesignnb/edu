import {describe,it,expect,vi,afterEach} from 'vitest';
import {apiList,apiPage} from '@/lib/api/lists';
import {authenticationChanged,authorizationChanged,setStaffCsrf,http} from '@/lib/api/client';
import {invitationCredential,consumeInvitation,resetCredential,consumeResetCredential} from '@/lib/api/fragments';

const schoolId='00000000-0000-4000-8000-000000000001';
function page(data:unknown[],total:number,nextCursor:string|null){return new Response(JSON.stringify({data,requestId:'fixture',page:{total,nextCursor,hasMore:nextCursor!==null,limit:10}}));}
afterEach(()=>{vi.unstubAllGlobals();authenticationChanged();});
describe('server keysets and one-use link fragments',()=>{
  it('reuses only an opaque cursor for subsequent pages and always fetches row data again',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(page([{id:'first'}],30,'page-2')).mockResolvedValueOnce(page([{id:'second'}],30,'page-3')).mockResolvedValueOnce(page([{id:'updated-second'}],30,'page-3'));vi.stubGlobal('fetch',fetcher);
    const options={params:{schoolId}},map=(row:{id?:string|null})=>({id:row.id!});await apiPage('listClasss',options,{page:1,pageSize:10},map);await apiPage('listClasss',options,{page:2,pageSize:10},map);const result=await apiPage('listClasss',options,{page:2,pageSize:10},map);
    expect(result.items).toEqual([{id:'updated-second'}]);expect(fetcher).toHaveBeenCalledTimes(3);expect(fetcher.mock.calls[1][0]).toContain('cursor=page-2');expect(fetcher.mock.calls[2][0]).toContain('cursor=page-2');
  });
  it('separates filters and clears opaque keysets after current permission changes',async()=>{
    const fetcher=vi.fn().mockImplementation((url:string)=>Promise.resolve(url.includes('cursor=')?page([{id:'second'}],20,null):page([{id:'first'}],20,'page-2')));vi.stubGlobal('fetch',fetcher);
    const options={params:{schoolId},query:{q:'one'}},map=(row:{id?:string|null})=>({id:row.id!});await apiPage('listClasss',options,{page:1,pageSize:10},map);await apiPage('listClasss',{...options,query:{q:'two'}},{page:2,pageSize:10},map);expect(fetcher.mock.calls[1][0]).not.toContain('cursor=');authorizationChanged();await apiPage('listClasss',options,{page:2,pageSize:10},map);expect(fetcher.mock.calls[3][0]).not.toContain('cursor=');
  });
  it('clears keysets after a confirmed staff save',async()=>{
    const fetcher=vi.fn().mockImplementation((url:string,init:RequestInit)=>{if(init.method==='POST')return Promise.resolve(new Response(JSON.stringify({data:{id:'saved'},requestId:'ack'})));return Promise.resolve(url.includes('cursor=')?page([{id:'second'}],20,null):page([{id:'first'}],20,'page-2'));});vi.stubGlobal('fetch',fetcher);setStaffCsrf('current-csrf');
    const options={params:{schoolId}},map=(row:{id?:string|null})=>({id:row.id!});await apiPage('listClasss',options,{page:1,pageSize:10},map);await http('createClass',{params:{schoolId},body:{code:'ACK',name:'Lớp API',yearId:schoolId,gradeLevelId:schoolId,capacity:40}});await apiPage('listClasss',options,{page:2,pageSize:10},map);expect(fetcher.mock.calls[2][0]).not.toContain('cursor=');expect(fetcher.mock.calls[3][0]).toContain('cursor=page-2');
  });
  it('rebases a cached page when the full SQL total has shrunk to an earlier page',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(page([{id:'first'}],20,'page-2')).mockResolvedValueOnce(page([],0,null)).mockResolvedValueOnce(page([],0,null));vi.stubGlobal('fetch',fetcher);
    const options={params:{schoolId}},map=(row:{id?:string|null})=>({id:row.id!});await apiPage('listClasss',options,{page:1,pageSize:10},map);const result=await apiPage('listClasss',options,{page:2,pageSize:10},map);expect(result).toMatchObject({items:[],total:0,page:1,pageCount:1});expect(fetcher.mock.calls[2][0]).not.toContain('cursor=');
  });
  it('advances the server cursor without downloading or filtering the full tenant',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(page([{id:'first',name:'Trang 1'}],21,'signed-server-cursor')).mockResolvedValueOnce(page([{id:'second',name:'Trang 2'}],21,'next-server-cursor'));vi.stubGlobal('fetch',fetcher);
    const result=await apiPage('listClasss',{params:{schoolId},query:{q:'Lớp 10',yearId:schoolId}},{page:2,pageSize:10},row=>({id:row.id!,name:row.name}));
    expect(result.items).toEqual([{id:'second',name:'Trang 2'}]);expect(result.total).toBe(21);expect(result.pageCount).toBe(3);expect(result.allIds).toEqual([]);expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls[1][0]).toContain('cursor=signed-server-cursor');expect(fetcher.mock.calls[1][0]).toContain('q=L%E1%BB%9Bp+10');
  });
  it('fails visibly on oversized or broken paginated responses',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(page([{id:'actual'}],5000,'next')));await expect(apiList('listClasss',{params:{schoolId}},1000)).rejects.toMatchObject({code:'VALIDATION',details:{maximum:1000}});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(page([{id:'actual'}],2,'repeated')));await expect(apiList('listClasss',{params:{schoolId}},1000)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('does not treat a truncated response without page metadata as a complete empty list',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:[],requestId:'truncated-list'})));vi.stubGlobal('fetch',fetcher);
    await expect(apiList('listClasss',{params:{schoolId}})).rejects.toMatchObject({code:'READ_ERROR'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('stops between keyset pages when the staff identity changes',async()=>{
    const first=page([{id:'old-user-row'}],2,'next'),original=first.json.bind(first);first.json=async()=>{const value=await original();queueMicrotask(()=>authenticationChanged());return value;};
    const fetcher=vi.fn().mockResolvedValueOnce(first);vi.stubGlobal('fetch',fetcher);
    await expect(apiList('listClasss',{params:{schoolId}})).rejects.toMatchObject({code:'NO_SESSION'});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('removes invitation credentials from URL history and never persists them',()=>{
    const id='unique-invitation-fixture',location={pathname:`/invitations/${id}`,search:'',hash:'#token=secret-fixture&school=truong-test'},replaceState=vi.fn().mockImplementation(()=>{location.hash='';}),setItem=vi.fn();
    vi.stubGlobal('window',{location,history:{state:null,replaceState},localStorage:{setItem},sessionStorage:{setItem}});
    expect(invitationCredential(id)).toEqual({token:'secret-fixture',schoolSlug:'truong-test'});expect(replaceState).toHaveBeenCalledWith(null,'',`/invitations/${id}`);expect(invitationCredential(id).token).toBe('secret-fixture');expect(setItem).not.toHaveBeenCalled();consumeInvitation(id);expect(()=>invitationCredential(id)).toThrow();
  });
  it('does not consume a reset token on a different route and clears it after acknowledgement',()=>{
    const location={pathname:'/login',search:'',hash:'#token=reset-fixture'},replaceState=vi.fn().mockImplementation(()=>{location.hash='';});vi.stubGlobal('window',{location,history:{state:null,replaceState}});
    consumeResetCredential();expect(resetCredential()).toBeNull();expect(replaceState).not.toHaveBeenCalled();location.pathname='/reset-password';expect(resetCredential()).toBe('reset-fixture');expect(replaceState).toHaveBeenCalledWith(null,'','/reset-password');consumeResetCredential();expect(resetCredential()).toBeNull();
  });
});
