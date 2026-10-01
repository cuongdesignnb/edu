import {http,captureStaffAccess,onStaffAccessChanged,onStaffMutationAcknowledged,type ApiOptions,type ApiEnvelope} from './client';
import {apiOperations,type ApiData,type ApiItem,type ApiListId,type OperationId} from './generated';
import type {ListQuery,Page} from '../repositories/core';
import {RepoError} from '../repositories/errors';

// Opaque keysets only: never cache row payloads, tokens, CSRF or parent contexts.
const cursorPages=new Map<string,Map<number,string>>();
onStaffAccessChanged(()=>cursorPages.clear());onStaffMutationAcknowledged(()=>cursorPages.clear());
function cursorKey<K extends OperationId>(id:K,options:ApiOptions<K>,size:number,epoch:number){
  const entries=(value:Record<string,unknown>|undefined)=>Object.entries(value??{}).filter(([key,v])=>v!==undefined&&key!=='cursor'&&key!=='limit').sort(([a],[b])=>a.localeCompare(b));
  return JSON.stringify([epoch,id,size,entries(options.params),entries(options.query),options.supportAccessId??null]);
}
function remember(cursors:Map<number,string>,page:number,cursor:string){
  cursors.set(page,cursor);if(cursors.size>64)cursors.delete(cursors.keys().next().value!);
}

function rows<K extends OperationId,R=ApiItem<K>>(result:ApiEnvelope<ApiData<K>>,extract?:(data:ApiData<K>)=>R[]):R[]{
  const data=extract?extract(result.data):result.data;
  if(!Array.isArray(data))throw new RepoError('READ_ERROR','Danh sách API không đúng hợp đồng.');
  const page=result.page;
  if(!page||typeof page.hasMore!=='boolean'||!Number.isInteger(page.limit)||page.limit<1||page.limit>100||
    (page.nextCursor!==null&&typeof page.nextCursor!=='string')||(!page.hasMore&&page.nextCursor!==null)||
    (page.total!==undefined&&(!Number.isInteger(page.total)||page.total<0))||data.length>page.limit)throw new RepoError('READ_ERROR','API chưa trả thông tin phân trang hợp lệ.');
  return data as R[];
}
/** Lists are already scoped and filtered in SQL. Never filter an unscoped tenant dataset here. */
export async function apiList<K extends ApiListId>(id:K,options:ApiOptions<K>={},maximum=1000):Promise<Array<ApiItem<K>>>{
  const access=apiOperations[id].auth==='staff'?captureStaffAccess():undefined;
  const items:Array<ApiItem<K>>=[];let cursor:string|undefined;const visited=new Set<string>();
  do{
    access?.assertCurrent();
    const result=await http(id,{...options,query:{...options.query,limit:100,cursor}}),batch=rows(result);
    access?.assertCurrent();
    if((result.page?.total??0)>maximum||items.length+batch.length>maximum)throw new RepoError('VALIDATION','Danh sách vượt giới hạn đọc. Hãy thu hẹp bộ lọc.',{details:{maximum}});
    items.push(...batch);
    if(!result.page?.hasMore)return items;
    cursor=result.page.nextCursor??undefined;
    if(!cursor||visited.has(cursor))throw new RepoError('READ_ERROR','Con trỏ danh sách API không hợp lệ.');visited.add(cursor);
  }while(cursor);
  throw new RepoError('READ_ERROR','Danh sách chưa được tải đầy đủ.');
}
/** Numbered UI pages advance server keysets; the server applies every filter and sort. */
export async function apiPage<K extends OperationId,T extends {id:string},R=ApiItem<K>>(id:K,options:ApiOptions<K>,q:ListQuery,map:(item:R)=>T,extract?:(data:ApiData<K>)=>R[]):Promise<Page<T>>{
  const access=apiOperations[id].auth==='staff'?captureStaffAccess():undefined;
  const pageSize=q.pageSize??10,target=q.page??1;
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(target)||target<1||target>1000)throw new RepoError('VALIDATION','Trang dữ liệu không hợp lệ.');
  const key=access?cursorKey(id,options,pageSize,access.epoch):undefined;
  let cursors=key?cursorPages.get(key):undefined;if(key&&!cursors){cursors=new Map();cursorPages.set(key,cursors);if(cursorPages.size>32)cursorPages.delete(cursorPages.keys().next().value!);}
  let cursor:string|undefined,page=1,restarted=false;
  if(cursors)for(const [candidate,value]of cursors)if(candidate<=target&&candidate>page){page=candidate;cursor=value;}
  const visited=new Set<string>();
  if(cursor)visited.add(cursor);
  try{while(true){
    access?.assertCurrent();
    const result=await http(id,{...options,query:{...options.query,limit:pageSize,cursor}}),batch=rows(result,extract);
    access?.assertCurrent();
    const total=result.page?.total;
    if(!result.page||typeof total!=='number')throw new RepoError('READ_ERROR','API chưa trả tổng số kết quả của danh sách.');
    if(page>Math.max(1,Math.ceil(total/pageSize))||page>1&&!batch.length){
      if(restarted)throw new RepoError('READ_ERROR','Danh sách đã thay đổi. Hãy tải lại trang.');
      restarted=true;cursors?.clear();page=1;cursor=undefined;visited.clear();continue;
    }
    if(result.page.hasMore){const next=result.page.nextCursor;if(!next||visited.has(next))throw new RepoError('READ_ERROR','Con trỏ trang không hợp lệ.');if(cursors)remember(cursors,page+1,next);}
    if(page===target||!result.page.hasMore){
      const items=batch.map(map),allIds=result.page.total!<=items.length?items.map(x=>x.id):[];
      return {items,total,page,pageSize,pageCount:Math.max(1,Math.ceil(total/pageSize)),allIds};
    }
    cursor=result.page.nextCursor??undefined;if(!cursor||visited.has(cursor))throw new RepoError('READ_ERROR','Con trỏ trang không hợp lệ.');visited.add(cursor);page++;
  }}catch(error){if(key)cursorPages.delete(key);throw error;}
}
