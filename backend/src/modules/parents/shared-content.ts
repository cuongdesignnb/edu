import {iso,type Transaction,type Row} from '../../database/database';
import {validateSchema} from '../../common/contract';
import {Problem} from '../../common/problem';
import type {ParentPrincipal} from './parent.service';

export async function parentSharedContent(tx:Transaction,p:ParentPrincipal,section:'activities'|'announcements',id?:string,previewLimit?:3){
 if(previewLimit!==undefined&&(previewLimit!==3||id))throw new Problem(500,'PARENT_PURPOSE_QUERY_INVALID');
 const rows=(await tx.query<Row>(`SELECT i.payload,app.parent_publication_time(i.school_id,i.student_id,i.year_id,i.section,i.publication_id) AS published_at,
   app.parent_content_meta(i.school_id,i.student_id,i.year_id,i.section,i.publication_id) AS metadata
   FROM app.parent_publication_items i WHERE i.school_id=$1 AND i.student_id=$2 AND i.year_id=$3 AND i.section=$4
   AND app.parent_content_meta(i.school_id,i.student_id,i.year_id,i.section,i.publication_id) IS NOT NULL
   ${id?"AND i.payload->>'id'=$5":''} ORDER BY published_at DESC,i.created_at DESC,i.id LIMIT ${previewLimit??1001}`,[p.schoolId,p.studentId,p.yearId,section,...(id?[id]:[])])).rows;
 if(rows.length>1000)throw new Problem(422,'PARENT_CONTENT_TOO_LARGE');
 const items=rows.map(row=>{
   const item:Row={...row.payload as Row,publishedAt:iso(row.published_at as Date)};
   validateSchema(section==='activities'?'ParentActivity':'ParentAnnouncement',item,true);
   return {item,metadata:row.metadata as Row,docs:Array.isArray(item.documents)?item.documents as {id:string}[]:[]};
 });
 const ids=[...new Set(items.flatMap(({docs})=>docs.map(doc=>doc.id)))];
 const available=ids.length?(await tx.query<{info:Row}>(`SELECT app.parent_document_access(d.school_id,d.id) AS info
     FROM app.parent_document_items d WHERE d.school_id=$1 AND d.student_id=$2 AND d.year_id=$3 AND d.id=ANY($4::uuid[])
       AND app.parent_document_access(d.school_id,d.id) IS NOT NULL`,[p.schoolId,p.studentId,p.yearId,ids])).rows.map(doc=>doc.info):[];
 const documentsById=new Map(available.map(info=>[String(info.id),info]));
 const result=items.map(({item,metadata,docs})=>{
   const documents=docs.flatMap(doc=>{const info=documentsById.get(doc.id);return info?[info]:[];});
   const value={...item,...(section==='activities'?{description:item.description??null,publicReviewNote:item.publicReviewNote??null}:{}),...metadata,documents};validateSchema(section==='activities'?'ParentSharedActivity':'ParentSharedAnnouncement',value,true);return value;
 });
 if(id&&!result.length)throw new Problem(404,'RESOURCE_NOT_FOUND');return id?result[0]:result;
}
