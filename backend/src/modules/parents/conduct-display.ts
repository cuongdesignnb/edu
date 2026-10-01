import {iso,type Transaction,type Row} from '../../database/database';
import {validateSchema} from '../../common/contract';
import {Problem} from '../../common/problem';
import type {ParentPrincipal} from './parent.service';

function dateAt(at:string,timezone:string){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));
 const part=(name:string)=>parts.find(part=>part.type===name)!.value;return `${part('year')}-${part('month')}-${part('day')}`;
}
export async function parentConductDisplay(tx:Transaction,p:ParentPrincipal,id?:string,latest=false){
 if(id&&latest)throw new Problem(500,'PARENT_PURPOSE_QUERY_INVALID');
 const rows=(await tx.query<Row>(`SELECT i.payload,app.parent_publication_time(i.school_id,i.student_id,i.year_id,i.section,i.publication_id) AS published_at,
   app.parent_conduct_display(i.school_id,i.student_id,i.year_id,i.publication_id) AS metadata,
   app.parent_conduct_history(i.school_id,i.student_id,i.year_id,i.publication_id) AS history
   FROM app.parent_publication_items i WHERE i.school_id=$1 AND i.student_id=$2 AND i.year_id=$3 AND i.section='conduct'
     AND app.parent_conduct_display(i.school_id,i.student_id,i.year_id,i.publication_id) IS NOT NULL
     ${id?"AND i.payload->>'periodId'=$4":''} ORDER BY published_at DESC,i.created_at DESC,i.id LIMIT ${latest?1:1001}`,[p.schoolId,p.studentId,p.yearId,...(id?[id]:[])])).rows;
 if(rows.length>1000)throw new Problem(422,'PARENT_CONDUCT_TOO_LARGE');
 const items=rows.map(row=>{
   const item:Row={...row.payload as Row,publishedAt:iso(row.published_at as Date)};validateSchema('ParentConduct',item,true);
   const metadata=row.metadata as Row,history=row.history as Row[];
   if(!Array.isArray(history)||history.length>1000||(item.lines as Row[]).length>1000)throw new Problem(422,'PARENT_CONDUCT_TOO_LARGE');
   const lines=(item.lines as Row[]).map(line=>({...line,date:dateAt(String(line.occurredAt),String(metadata.timezone))}));
   const result={...item,...metadata,lines,history};validateSchema('ParentSharedConduct',result,true);return result;
 });
 if(id&&!items.length)throw new Problem(404,'RESOURCE_NOT_FOUND');return id?items[0]:items;
}
