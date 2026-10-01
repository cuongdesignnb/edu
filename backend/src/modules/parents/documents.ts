import fs from 'node:fs/promises';
import {Database,iso,type Transaction,type Row} from '../../database/database';
import {validateSchema} from '../../common/contract';
import {Problem} from '../../common/problem';
import {objectPath} from '../files/storage';
import type {ParentPrincipal} from './parent.service';
import type {Result} from '../../api.router';

export async function parentDocument(tx:Transaction,p:ParentPrincipal,id:string){
 const info=(await tx.query<{info:Row|null}>('SELECT app.parent_document_access($1,$2) AS info',[p.schoolId,id])).rows[0]?.info;
 if(!info)throw new Problem(404,'RESOURCE_NOT_FOUND');validateSchema('ParentDocumentEntry',info,true);return info;
}
export async function parentDocuments(tx:Transaction,p:ParentPrincipal){
 const files=(await tx.query<{info:Row}>(`SELECT app.parent_document_access(d.school_id,d.id) AS info FROM app.parent_document_items d
   WHERE d.school_id=$1 AND d.student_id=$2 AND d.year_id=$3 AND app.parent_document_access(d.school_id,d.id) IS NOT NULL
   ORDER BY d.published_at DESC,d.id LIMIT 1001`,[p.schoolId,p.studentId,p.yearId])).rows.map(r=>r.info);
 // The other section has its own live SQL guard; no conduct privilege is borrowed.
 const reports=(await tx.query<Row>(`SELECT payload,app.parent_publication_time(school_id,student_id,year_id,section,publication_id) AS published_at
   FROM app.parent_publication_items WHERE school_id=$1 AND student_id=$2 AND year_id=$3 AND section='conduct'
   ORDER BY created_at DESC,id LIMIT 1001`,[p.schoolId,p.studentId,p.yearId])).rows.map(row=>{
   const value:Row={...row.payload as Row,publishedAt:iso(row.published_at as Date)};validateSchema('ParentConduct',value,true);
   return {periodId:value.periodId,title:`Kết quả thi đua ${value.periodLabel}`,publishedAt:value.publishedAt,total:value.finalPoints,grade:value.classification,revision:value.revision};
 });
 if(files.length>1000||reports.length>1000)throw new Problem(422,'PARENT_DOCUMENTS_TOO_LARGE');
 const result={files,reports};validateSchema('ParentDocumentDirectory',result,true);return result;
}
/** Open first, then recheck current link, relationship, publication and both rights
 * in a fresh statement just before constructing the private file stream. */
export async function parentDocumentStream(db:Database,p:ParentPrincipal,id:string,download:boolean,beforeStream?:(tx:Transaction)=>Promise<unknown>):Promise<Result>{
 const options={schoolId:p.schoolId,parentSessionId:p.sessionId};
 const lookup=()=>db.transaction(async tx=>(await tx.query<{info:Row|null}>('SELECT app.parent_document_file($1,$2) AS info',[p.schoolId,id])).rows[0]?.info,options);
 const permitted=(info:Row|null|undefined)=>{
   if(!info)throw new Problem(404,'RESOURCE_NOT_FOUND');
   const metadata=Object.fromEntries(Object.entries(info).filter(([key])=>!['objectKey','filename'].includes(key)));validateSchema('ParentDocumentEntry',metadata,true);
   if(!(download?info.downloadAllowed:info.viewAllowed))throw new Problem(403,download?'DOWNLOAD_DENIED':'FILE_PREVIEW_DENIED');return info;
 };
 const first=permitted(await lookup());let handle:Awaited<ReturnType<typeof fs.open>>;
 try{handle=await fs.open(objectPath(p.schoolId,String(first.objectKey)),'r');}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new Problem(404,'RESOURCE_NOT_FOUND');throw error;}
 try{
   const stat=await handle.stat(),current=await db.transaction(async tx=>{
     // The completion event rolls back when the final current guard refuses.
     await beforeStream?.(tx);
     const info=permitted((await tx.query<{info:Row|null}>('SELECT app.parent_document_file($1,$2) AS info',[p.schoolId,id])).rows[0]?.info);
     if(!stat.isFile()||info.objectKey!==first.objectKey||info.contentType!==first.contentType||Number(info.byteSize)!==stat.size)throw new Problem(409,'FILE_UNAVAILABLE');
     return info;
   },options);
   return {data:null,binary:{stream:handle.createReadStream({autoClose:true}),contentType:String(current.contentType),filename:String(current.filename),byteSize:stat.size}};
 }catch(error){await handle.close();throw error;}
}
