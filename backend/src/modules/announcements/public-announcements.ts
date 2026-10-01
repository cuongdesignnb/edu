import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import type {Database,Row,Transaction} from '../../database/database';
import {one,iso} from '../../database/database';
import {listResource,type Resource} from '../../database/resources';
import {notFound,Problem} from '../../common/problem';
import type {RequestContext,Result} from '../../api.router';
import {announcementHtmlToBlocks} from './announcement-blocks';
import {objectPath} from '../files/storage';

const cohort:Resource={table:"(SELECT p.id,p.school_id,p.announcement_root_id,p.published_at FROM app.publication_revisions p JOIN platform.schools s ON s.id=p.school_id AND s.status='ACTIVE' JOIN app.announcements a ON a.school_id=p.school_id AND a.id=p.announcement_id AND a.status='PUBLISHED' WHERE p.kind='ANNOUNCEMENT' AND p.status='PUBLISHED' AND p.public_payload IS NOT NULL)",fields:{id:'id',rootId:'announcement_root_id',publishedAt:'published_at'},writeFields:[],search:[],filters:{}};
const card=(s:Row)=>({name:s.name,shortName:s.short_name??null,slug:s.slug,address:s.public_address??null,publicPhone:s.public_contact_phone??null,publicEmail:s.public_contact_email??null,website:s.public_website??null,motto:s.motto,publicIntro:s.public_intro,accentColor:s.accent_color,status:String(s.status).toLowerCase(),level:s.level??null});
const summary=(p:Row)=>({id:p.announcement_root_id,title:(p.public_payload as Row).title,summary:p.summary,publishedAt:iso(p.published_at as Date)});
async function current(tx:Transaction,schoolId:string,id:string,publicationId?:string){
 const p=await one<Row>(tx,`SELECT p.*,a.summary FROM app.publication_revisions p JOIN app.announcements a ON a.school_id=p.school_id AND a.id=p.announcement_id AND a.status='PUBLISHED' JOIN platform.schools s ON s.id=p.school_id AND s.status='ACTIVE'
  WHERE p.school_id=$1 AND p.kind='ANNOUNCEMENT' AND p.status='PUBLISHED' AND p.public_payload IS NOT NULL AND (p.announcement_root_id=$2 OR p.announcement_id=$2)${publicationId?' AND p.id=$3':''}`,publicationId?[schoolId,id,publicationId]:[schoolId,id]);if(!p)notFound();return p;
}
async function publicFiles(tx:Transaction,schoolId:string,p:Row){
 const docs=(p.public_payload as Row).documents as {id:string}[];if(!Array.isArray(docs)||docs.length>100)throw new Problem(500,'RESPONSE_CONTRACT_ERROR');
 return (await tx.query<Row>(`SELECT f.* FROM app.files f WHERE f.school_id=$1 AND f.id=ANY($2::uuid[]) AND f.purpose='CLASS_DOCUMENT' AND f.status='READY' AND (f.expires_at IS NULL OR f.expires_at>now())
  AND EXISTS(SELECT 1 FROM app.file_links l WHERE l.school_id=f.school_id AND l.file_id=f.id AND l.announcement_id=$3)
  AND NOT EXISTS(SELECT 1 FROM app.file_links l WHERE l.school_id=f.school_id AND l.file_id=f.id AND l.student_id IS NOT NULL) ORDER BY f.id`,[schoolId,docs.map(d=>d.id),p.announcement_id])).rows;
}
export async function publicAnnouncementWorkspace(db:Database,c:RequestContext):Promise<Result>{
 const allowed=c.operation.id==='getPublicSchoolWorkspace'?['limit','cursor']:[];
 if(Object.entries(c.query).some(([key,value])=>!allowed.includes(key)||typeof value!=='string')||c.query.cursor!==undefined&&(!c.query.cursor||c.query.cursor.length>4096))throw new Problem(422,'INVALID_QUERY');
 const s=(await db.app.query<Row>("SELECT id FROM platform.schools WHERE slug=$1 AND status<>'DRAFT'",[c.params.schoolSlug])).rows[0];if(!s)notFound();
 return db.transaction(async tx=>{
  const school=await one<Row>(tx,"SELECT name,short_name,slug,public_address,public_contact_phone,public_contact_email,public_website,motto,public_intro,accent_color,status,level FROM platform.schools WHERE id=$1 AND slug=$2 AND status<>'DRAFT'",[s.id,c.params.schoolSlug]);if(!school)notFound();
  if(c.operation.id==='getPublicSchoolWorkspace'){
   const page=await listResource(tx,cohort,String(s.id),{...c.query,sort:'publishedAt',dir:'desc'},undefined,c.params.schoolSlug);
   const rows=(await tx.query<Row>(`SELECT p.announcement_root_id,p.public_payload,p.published_at,a.summary FROM app.publication_revisions p JOIN app.announcements a ON a.school_id=p.school_id AND a.id=p.announcement_id WHERE p.school_id=$1 AND p.id=ANY($2::uuid[]) ORDER BY p.published_at DESC,p.id DESC`,[s.id,page.data.map(p=>p.id)])).rows;
   return {data:{school:card(school),news:rows.map(summary)},page:page.page};
  }
  const p=await current(tx,String(s.id),c.params.announcementId!,c.params.publicationId),files=await publicFiles(tx,String(s.id),p);
  if(c.operation.id==='downloadPublicNewsFile'){
   const file=files.find(f=>f.id===c.params.fileId);if(!file)notFound();const filename=objectPath(String(s.id),String(file.object_key));await fs.access(filename);
   return {data:null,binary:{stream:createReadStream(filename),contentType:String(file.content_type),filename:String(file.original_name),byteSize:Number(file.byte_size)}};
  }
  const payload=p.public_payload as Row;
  return {data:{school:{name:school.name,slug:school.slug},news:{...summary(p),body:announcementHtmlToBlocks(String(payload.sanitizedHtml)),source:{rootId:p.announcement_root_id,publicationId:p.id},attachments:files.map(f=>({id:f.id,name:f.original_name,mime:f.content_type,size:Number(f.byte_size)}))}}};
 },{schoolId:String(s.id),readOnly:true});
}
