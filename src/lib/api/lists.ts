import {http,type ApiOptions,type ApiEnvelope} from './client';
import type {ApiData,ApiItem,ApiListId} from './generated';
import type {ListQuery,Page} from '../repositories/core';
import {RepoError} from '../repositories/errors';

function rows<K extends ApiListId>(result:ApiEnvelope<ApiData<K>>):Array<ApiItem<K>>{
  if(!Array.isArray(result.data))throw new RepoError('READ_ERROR','Danh sách API không đúng hợp đồng.');
  const page=result.page;
  if(!page||typeof page.hasMore!=='boolean'||!Number.isInteger(page.limit)||page.limit<1||page.limit>100||
    (page.nextCursor!==null&&typeof page.nextCursor!=='string')||(!page.hasMore&&page.nextCursor!==null)||
    (page.total!==undefined&&(!Number.isInteger(page.total)||page.total<0))||result.data.length>page.limit)throw new RepoError('READ_ERROR','API chưa trả thông tin phân trang hợp lệ.');
  return result.data as Array<ApiItem<K>>;
}
/** Lists are already scoped and filtered in SQL. Never filter an unscoped tenant dataset here. */
export async function apiList<K extends ApiListId>(id:K,options:ApiOptions<K>={},maximum=1000):Promise<Array<ApiItem<K>>>{
  const items:Array<ApiItem<K>>=[];let cursor:string|undefined;const visited=new Set<string>();
  do{
    const result=await http(id,{...options,query:{...options.query,limit:100,cursor}}),batch=rows(result);
    if((result.page?.total??0)>maximum||items.length+batch.length>maximum)throw new RepoError('VALIDATION','Danh sách vượt giới hạn đọc. Hãy thu hẹp bộ lọc.',{details:{maximum}});
    items.push(...batch);
    if(!result.page?.hasMore)return items;
    cursor=result.page.nextCursor??undefined;
    if(!cursor||visited.has(cursor))throw new RepoError('READ_ERROR','Con trỏ danh sách API không hợp lệ.');visited.add(cursor);
  }while(cursor);
  throw new RepoError('READ_ERROR','Danh sách chưa được tải đầy đủ.');
}
/** Numbered UI pages advance server keysets; the server applies every filter and sort. */
export async function apiPage<K extends ApiListId,T extends {id:string}>(id:K,options:ApiOptions<K>,q:ListQuery,map:(item:ApiItem<K>)=>T):Promise<Page<T>>{
  const pageSize=q.pageSize??10,target=q.page??1;
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||!Number.isInteger(target)||target<1||target>1000)throw new RepoError('VALIDATION','Trang dữ liệu không hợp lệ.');
  let cursor:string|undefined,page=1;
  const visited=new Set<string>();
  while(true){
    const result=await http(id,{...options,query:{...options.query,limit:pageSize,cursor}}),batch=rows(result);
    const total=result.page?.total;
    if(!result.page||typeof total!=='number')throw new RepoError('READ_ERROR','API chưa trả tổng số kết quả của danh sách.');
    if(page===target||!result.page.hasMore){
      const items=batch.map(map),allIds=result.page.total!<=items.length?items.map(x=>x.id):[];
      return {items,total,page,pageSize,pageCount:Math.max(1,Math.ceil(total/pageSize)),allIds};
    }
    cursor=result.page.nextCursor??undefined;if(!cursor||visited.has(cursor))throw new RepoError('READ_ERROR','Con trỏ trang không hợp lệ.');visited.add(cursor);page++;
  }
}
