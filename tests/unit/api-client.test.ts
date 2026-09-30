import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {http,download,setStaffCsrf,authenticationChanged,authorizationChanged,captureStaffAccess,staffAccessRevision} from '@/lib/api/client';

const schoolId='00000000-0000-4000-8000-000000000001';
const envelope=(data:unknown,status=200)=>new Response(JSON.stringify({data,requestId:'test-request'}),{status,headers:{'content-type':'application/json'}});
beforeEach(()=>{authenticationChanged();setStaffCsrf('memory-only-csrf');});
afterEach(()=>{vi.unstubAllGlobals();authenticationChanged();});

describe('connected HTTP transport',()=>{
  it('does not reuse or install an old bootstrap CSRF after identity change',async()=>{
    const gate=Promise.withResolvers<Response>(),begun=Promise.withResolvers<void>();let bootstrapCalls=0;
    const fetcher=vi.fn().mockImplementation((url:string)=>{if(url==='/api/v1/auth/csrf'){bootstrapCalls++;if(bootstrapCalls===1){begun.resolve();return gate.promise;}return Promise.resolve(envelope({csrfToken:'new-bootstrap'}));}return Promise.resolve(envelope({accepted:true}));});vi.stubGlobal('fetch',fetcher);
    const old=http('forgotPassword',{body:{email:'prior@example.invalid'}});await begun.promise;authenticationChanged();await http('forgotPassword',{body:{email:'current@example.invalid'}});gate.resolve(envelope({csrfToken:'old-bootstrap'}));await expect(old).rejects.toMatchObject({code:'NO_SESSION'});
    await http('forgotPassword',{body:{email:'current2@example.invalid'}});const writes=fetcher.mock.calls.filter(([,init])=>init.method==='POST');expect(writes).toHaveLength(2);expect(writes.every(([,init])=>init.headers['X-CSRF-Token']==='new-bootstrap')).toBe(true);expect(bootstrapCalls).toBe(2);
  });
  it('reads relative API URLs with cookie credentials, no-store and server query filters',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope([{id:'actual-api-row'}]));vi.stubGlobal('fetch',fetcher);
    const result=await http('listClasss',{params:{schoolId},query:{q:'Lớp 10',yearId:schoolId,limit:25}});
    expect(result.data).toEqual([{id:'actual-api-row'}]);const [url,init]=fetcher.mock.calls[0];expect(url).toContain('/api/v1/schools/'+schoolId+'/classes?');expect(url).toContain('q=L%E1%BB%9Bp+10');expect(init.credentials).toBe('include');expect(init.cache).toBe('no-store');expect(init.redirect).toBe('error');
  });
  it('denies missing references before fetching and never returns fallback data for server failures',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({code:'DEPENDENCY_UNAVAILABLE'}),{status:503}));vi.stubGlobal('fetch',fetcher);
    await expect(http('getClass')).rejects.toMatchObject({code:'VALIDATION'});expect(fetcher).not.toHaveBeenCalled();
    await expect(http('listClasss',{params:{schoolId}})).rejects.toMatchObject({code:'READ_ERROR',details:{httpStatus:503}});
  });
  it('keeps a logical mutation idempotency key through network loss and only replaces it after acknowledgement',async()=>{
    const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('connection lost')).mockResolvedValueOnce(envelope({id:'created'},201)).mockResolvedValueOnce(envelope({id:'next'},201));vi.stubGlobal('fetch',fetcher);
    const options={params:{schoolId},body:{code:'NEW',name:'Lớp thật',yearId:schoolId,gradeLevelId:schoolId,capacity:40}};
    await expect(http('createClass',options)).rejects.toMatchObject({code:'NETWORK'});await http('createClass',options);await http('createClass',options);
    const headers=fetcher.mock.calls.map(c=>c[1].headers);expect(headers[0]['Idempotency-Key']).toBe(headers[1]['Idempotency-Key']);expect(headers[1]['Idempotency-Key']).not.toBe(headers[2]['Idempotency-Key']);expect(headers[0]['X-CSRF-Token']).toBe('memory-only-csrf');expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty('actor');
  });
  it('keeps the key when a successful write response is cut off before its JSON acknowledgement',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('cut off',{status:201})).mockResolvedValueOnce(envelope({id:'created'},201));vi.stubGlobal('fetch',fetcher);
    const options={params:{schoolId},body:{code:'NEW',name:'Lớp thật',yearId:schoolId,gradeLevelId:schoolId,capacity:40}};
    await expect(http('createClass',options)).rejects.toMatchObject({code:'NETWORK'});await http('createClass',options);expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);
  });
  it('surfaces version conflicts and field errors without retries or overwrites',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:'VERSION_CONFLICT',currentVersion:9}),{status:409})).mockResolvedValueOnce(new Response(JSON.stringify({code:'VALIDATION_ERROR',fieldErrors:[{path:'capacity',message:'Sức chứa không hợp lệ'}]}),{status:422}));vi.stubGlobal('fetch',fetcher);
    await expect(http('updateClass',{params:{schoolId,classId:schoolId},body:{expectedVersion:1,name:'Lớp sửa'}})).rejects.toMatchObject({code:'CONFLICT',details:{currentVersion:9}});
    await expect(http('updateClass',{params:{schoolId,classId:schoolId},body:{expectedVersion:9,capacity:1}})).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{capacity:'Sức chứa không hợp lệ'}});expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('forwards an explicit parent view on private binary reads and does not need a staff token',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('private bytes',{headers:{'content-type':'application/pdf','content-disposition':"attachment; filename*=UTF-8''Bao%20cao.pdf"}}));vi.stubGlobal('fetch',fetcher);setStaffCsrf(null);
    const result=await download('downloadParentDocument',{params:{schoolSlug:'truong-thu-a',documentId:schoolId},parentViewId:'explicit-view'});expect(await result.blob.text()).toBe('private bytes');expect(result.filename).toBe('Bao cao.pdf');expect(fetcher.mock.calls[0][1].headers['X-Parent-View']).toBe('explicit-view');expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('X-CSRF-Token');
  });
  it('rejects a response body that completes after the staff cookie context changes',async()=>{
    let release!:(value:unknown)=>void,start!:()=>void;const begun=new Promise<void>(resolve=>{start=resolve;});
    const response=envelope({id:'old-private-data'});vi.spyOn(response,'json').mockImplementation(()=>{start();return new Promise(resolve=>{release=resolve;});});vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response));
    const reading=http('getMyProfile');await begun;authenticationChanged();release({data:{id:'old-private-data'},requestId:'old-request'});await expect(reading).rejects.toMatchObject({code:'NO_SESSION'});
  });
  it('rejects a completed private body after same-identity permission changes',async()=>{
    let release!:(value:unknown)=>void,start!:()=>void;const begun=new Promise<void>(resolve=>{start=resolve;}),response=envelope({id:'old-private-data'});
    vi.spyOn(response,'json').mockImplementation(()=>{start();return new Promise(resolve=>{release=resolve;});});vi.stubGlobal('fetch',vi.fn().mockResolvedValue(response));const reading=http('getMyProfile');await begun;const access=captureStaffAccess();authorizationChanged();release({data:{id:'old-private-data'},requestId:'old-request'});
    expect(()=>access.assertCurrent()).toThrow();await expect(reading).rejects.toMatchObject({code:'FORBIDDEN',details:{scopeChanged:true}});
  });
  it('keeps an uncertain command key and current CSRF after a permission refresh for the same identity',async()=>{
    const fetcher=vi.fn().mockRejectedValueOnce(new TypeError('lost response')).mockResolvedValueOnce(envelope({id:'created'},201));vi.stubGlobal('fetch',fetcher);const options={params:{schoolId},body:{code:'KEY',name:'Lớp thật',yearId:schoolId,gradeLevelId:schoolId,capacity:40}};
    await expect(http('createClass',options)).rejects.toMatchObject({code:'NETWORK'});authorizationChanged();await http('createClass',options);expect(fetcher.mock.calls[1][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[0][1].headers['Idempotency-Key']);expect(fetcher.mock.calls[1][1].headers['X-CSRF-Token']).toBe('memory-only-csrf');
  });
  it('does not let an old unauthorized response clear a newer authenticated context',async()=>{
    let release!:(response:Response)=>void;vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>new Promise<Response>(resolve=>{release=resolve;})));const reading=http('getMyProfile');authenticationChanged();setStaffCsrf('new-csrf');const revision=staffAccessRevision();release(new Response(JSON.stringify({code:'UNAUTHENTICATED'}),{status:401}));
    await expect(reading).rejects.toMatchObject({code:'NO_SESSION'});expect(staffAccessRevision()).toBe(revision);
  });
});
