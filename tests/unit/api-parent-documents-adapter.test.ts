import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {connectedParentRepo as repo} from '@/lib/repositories/connected/parent';
import {nativeParentDocuments,nativeParentDocument} from '@/lib/repositories/connected/parent-documents';
import {nativeParentContext} from '@/lib/repositories/connected/parent-context';
import {getOwnedBlob,releaseOwnedBlob} from '@/lib/api/owned-blobs';
import {beginParentExchange,clearParentSession,readParentView} from '@/lib/api/parent-session';
import {authenticationChanged,authorizationChanged,captureStaffAccess} from '@/lib/api/client';
import type {ApiSchemas} from '@/lib/api/generated';
import type {Ctx} from '@/lib/repositories/core';
const slug='parent-documents-unit',viewId='6b000000-0000-4000-8000-000000000001',other='6b000000-0000-4000-8000-000000000002',schoolId='6b000000-0000-4000-8000-000000000003',accessId='6b000000-0000-4000-8000-000000000004',id='6b000000-0000-4000-8000-000000000005';
const context=():ApiSchemas['ParentContext']=>({viewId,school:{name:'Trường API',slug,publicContactPhone:null,shortName:null,motto:null,publicContactEmail:null,publicAddress:null},student:{displayName:'Con API',classLabel:'6A',schoolYearLabel:'2026–2027'},allowedSections:['documents','conduct'],allowDownload:true,csrfToken:'owned-document-csrf',expiresAt:'2026-10-05T08:00:00Z',today:'2026-10-05',year:{label:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01'},relationshipLabel:'Mẹ',linkExpiresAt:'2026-11-01T00:00:00Z',lastPublishedAt:null});
const file=():ApiSchemas['ParentDocumentEntry']=>({id,title:'Tài liệu công bố',contentType:'image/png',byteSize:3,downloadAllowed:false,viewAllowed:true,publishedAt:'2026-10-01T01:00:00Z'});
const directory=():ApiSchemas['ParentDocumentDirectory']=>({files:[file()],reports:[{periodId:other,title:'Kết quả thi đua Tuần 5',publishedAt:'2026-10-01T01:00:00Z',total:'80.10',grade:null,revision:1}]});
const response=(data:unknown)=>new Response(JSON.stringify({data,requestId:'parent-document-unit'}),{status:200,headers:{'Content-Type':'application/json'}});
const bytes=(contentType='image/png')=>new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':contentType,'Content-Disposition':"attachment;filename*=UTF-8''ten-thuc.png"}});
const display=()=>nativeParentContext(context(),slug).display;
const adopt=(value=viewId)=>beginParentExchange().adopt(slug,value,'owned-document-csrf');
beforeEach(()=>{clearParentSession();authenticationChanged();});afterEach(()=>{clearParentSession();vi.unstubAllGlobals();});
describe('Native parent private documents and independent download rights',()=>{
 it('keeps published metadata and nullable actual report grade, without guessing source audience or storage IDs',()=>{
  const data=nativeParentDocuments(directory(),display());expect(data.files[0]).toMatchObject({id,name:'Tài liệu công bố',size:3,viewAllowed:true,downloadAllowed:false});expect(data.reports[0]).toMatchObject({total:'80.10',grade:null,revision:1});expect(JSON.stringify(data)).not.toMatch(/studentId|objectKey|filename|csrf|viewId|fileId|kind/);
 });
 it('rejects private fields, contradictory capabilities, wrong IDs, duplicates and conduct without its own grant',()=>{
  const base=file();for(const data of [{...base,fileId:other},{...base,objectKey:'private/path'},{...base,id:null},{...base,id:other},{...base,byteSize:-1},{...base,contentType:'image/svg+xml',viewAllowed:true},{...base,downloadAllowed:'yes'}])expect(()=>nativeParentDocument(data as ApiSchemas['ParentDocumentEntry'],display(),id)).toThrow();
  expect(()=>nativeParentDocument({...base,downloadAllowed:true},{...display(),allowDownload:false})).toThrow();expect(()=>nativeParentDocuments({...directory(),files:[base,base]},display())).toThrow();expect(()=>nativeParentDocuments(directory(),{...display(),modules:['documents']})).toThrow();expect(()=>nativeParentDocuments({...directory(),files:Array.from({length:1001},file)},display())).toThrow();
 });
 it('reads the complete document purpose with exact current view and no borrowed staff file endpoint',async()=>{
  adopt();const fetcher=vi.fn(async(input:string)=>response(input.endsWith('document-directory')?directory():context()));vi.stubGlobal('fetch',fetcher);expect((await repo.documents({viewId},slug)).files).toHaveLength(1);const calls=fetcher.mock.calls as unknown as Array<[string,RequestInit]>;expect(calls.map(([url])=>url)).toEqual([`/api/v1/parent/${slug}/context`,`/api/v1/parent/${slug}/document-directory`]);for(const [,opts]of calls)expect((opts.headers as Record<string,string>)['X-Parent-View']).toBe(viewId);
 });
 it('view permission produces only actual owned API bytes and never permits download from a cached preview',async()=>{
  adopt();const fetcher=vi.fn(async(input:string)=>input.endsWith('/view')?bytes():response(input.endsWith('/'+id)?file():context()));vi.stubGlobal('fetch',fetcher);const asset=await repo.file({viewId},slug,id);expect((await getOwnedBlob(asset.source.blobKey)).size).toBe(3);await expect(repo.downloadFile({viewId},slug,id)).rejects.toMatchObject({code:'FORBIDDEN',details:{problemCode:'DOWNLOAD_DENIED'}});expect(fetcher.mock.calls.some(([url])=>url.endsWith('/download'))).toBe(false);releaseOwnedBlob(asset.source.blobKey);await expect(getOwnedBlob(asset.source.blobKey)).rejects.toMatchObject({code:'READ_ERROR'});
 });
 it('each permitted download checks metadata and requests fresh bytes using the original safe server filename',async()=>{
  adopt();const fetcher=vi.fn(async(input:string)=>input.endsWith('/download')?bytes('image/png; charset=utf-8'):response(input.endsWith('/'+id)?{...file(),downloadAllowed:true}:context()));vi.stubGlobal('fetch',fetcher);for(let i=0;i<2;i++){const result=await repo.downloadFile({viewId},slug,id);expect(result.filename).toBe('ten-thuc.png');expect(result.blob.size).toBe(3);result.assertCurrent();}expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/download'))).toHaveLength(2);
 });
 it('rejects incomplete/mismatched binary bytes instead of returning preview metadata as content',async()=>{
  adopt();vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.endsWith('/view')?new Response('x',{headers:{'Content-Type':'text/html'}}):response(input.endsWith('/'+id)?file():context())));await expect(repo.file({viewId},slug,id)).rejects.toMatchObject({code:'READ_ERROR'});
 });
 it('a delayed previous file cannot escape or clear the newly adopted child, and old memory handles are purged',async()=>{
  adopt();let resolve:(r:Response)=>void=()=>{},started=()=>{};const ready=new Promise<void>(r=>{started=r;});vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.endsWith('/view')?new Promise<Response>(r=>{resolve=r;started();}):response(input.endsWith('/'+id)?file():context())));const pending=repo.file({viewId},slug,id);await ready;adopt(other);resolve(bytes());await expect(pending).rejects.toMatchObject({code:'CONFLICT'});expect(readParentView(slug)).toBe(other);
  adopt();vi.stubGlobal('fetch',vi.fn(async(input:string)=>input.endsWith('/view')?bytes():response(input.endsWith('/'+id)?file():context())));const asset=await repo.file({viewId},slug,id);adopt(other);await expect(getOwnedBlob(asset.source.blobKey)).rejects.toMatchObject({code:'READ_ERROR'});
 });
 it('staff preview uses the same metadata/binary purposes with independent authority and no public cookie/view adoption',async()=>{
  adopt();const ctx:Ctx={actor:{kind:'staff',userId:other},today:'2026-10-05',now:'2026-10-05T01:00:00Z',staffOwner:captureStaffAccess()},fetcher=vi.fn(async(input:string)=>input.endsWith('/view')?bytes():response(input.endsWith('/'+id)?file():context()));vi.stubGlobal('fetch',fetcher);const asset=await repo.file({preview:{ctx,schoolId,accessId}},slug,id);expect(fetcher.mock.calls.map(([url])=>url)).toEqual([`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview/context`,`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview/documents/${id}`,`/api/v1/schools/${schoolId}/parent-access/${accessId}/preview/documents/${id}/view`]);expect(readParentView(slug)).toBe(viewId);authorizationChanged();await expect(getOwnedBlob(asset.source.blobKey)).rejects.toMatchObject({code:'READ_ERROR'});await expect(repo.file({preview:{ctx,schoolId,accessId}},slug,id)).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).toHaveBeenCalledTimes(3);
 });
});
