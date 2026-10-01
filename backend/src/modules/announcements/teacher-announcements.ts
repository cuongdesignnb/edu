import type {Database,Row,Transaction} from '../../database/database';
import {one,iso} from '../../database/database';
import {listResource,type Resource} from '../../database/resources';
import {audit,type Commands} from '../../common/commands';
import {Problem,notFound} from '../../common/problem';
import type {RequestContext,Result} from '../../api.router';
import type {AnnouncementsService} from './announcements.service';
import {announcementHtmlToBlocks} from './announcement-blocks';

type Source={id:string;rootId:string;yearId:string;classId:string|null;version:number;dataVersion:number;publicationId:string};
const teacherContext=(c:RequestContext):RequestContext=>({...c,operation:{...c.operation,id:'listTeacherAnnouncements'}});
const source=(a:Row,p:Row):Source=>({id:String(a.id),rootId:String(a.root_id),yearId:String(a.year_id),classId:a.class_id?String(a.class_id):null,version:Number(a.version),dataVersion:Number(a.data_version),publicationId:String(p.id)});
const cohort:Resource={table:"(SELECT a.*,p.published_at FROM app.announcements a JOIN app.publication_revisions p ON p.school_id=a.school_id AND p.announcement_id=a.id AND p.kind='ANNOUNCEMENT' AND p.status='PUBLISHED' WHERE a.status='PUBLISHED')",fields:{id:'id',publishedAt:'published_at'},writeFields:[],search:[],filters:{}};

export async function teacherAnnouncementFeed(db:Database,service:AnnouncementsService,c:RequestContext):Promise<Result>{return db.transaction(async tx=>{
 const schoolId=c.params.schoolId!,read=await service.readPredicate(tx,teacherContext(c)),page=await listResource(tx,cohort,schoolId,{...c.query,sort:'publishedAt',dir:'desc'},read.predicate,c.principal!.userId),ids=page.data.map(a=>a.id);
 const rows=(await tx.query<Row>(`SELECT a.*,p.id AS publication_id,p.published_at,cls.name AS class_name,m.work_display_name AS author_name,r.read_at
  FROM app.announcements a JOIN app.publication_revisions p ON p.school_id=a.school_id AND p.announcement_id=a.id AND p.kind='ANNOUNCEMENT' AND p.status='PUBLISHED'
  LEFT JOIN app.classes cls ON cls.school_id=a.school_id AND cls.id=a.class_id LEFT JOIN app.memberships m ON m.school_id=a.school_id AND m.user_id=a.created_by
  LEFT JOIN app.announcement_read_receipts r ON r.school_id=p.school_id AND r.publication_id=p.id AND r.member_id=$3
  WHERE a.school_id=$1 AND a.id=ANY($2::uuid[]) ORDER BY p.published_at DESC,a.id DESC`,[schoolId,ids,read.memberId])).rows;
 const attachments=(await tx.query<Row>(`SELECT l.announcement_id,f.id,f.original_name FROM app.file_links l JOIN app.files f ON f.school_id=l.school_id AND f.id=l.file_id WHERE l.school_id=$1 AND l.announcement_id=ANY($2::uuid[]) AND f.status='READY' AND (f.expires_at IS NULL OR f.expires_at>now()) ORDER BY l.announcement_id,l.id`,[schoolId,ids])).rows;
 const items=[];
 for(const row of rows){const view=await service.readView(tx,row,read),targets=view.targets as {kind:string}[],scopeLabel=targets.some(t=>['PUBLIC','SCHOOL'].includes(t.kind))?'Toàn trường':targets.some(t=>t.kind==='STUDENT')?'Riêng học sinh được chỉ định':targets.some(t=>t.kind==='STAFF')?'Nhân sự được chỉ định':targets.some(t=>t.kind==='GRADE')?'Khối tôi phụ trách':'Lớp tôi phụ trách';
  const files=attachments.filter(f=>f.announcement_id===row.id);if(files.length>100)throw new Problem(422,'ANNOUNCEMENT_WORKSPACE_LIMIT');
  items.push({id:row.id,rootId:row.root_id,origin:row.class_id?'class':'school',className:row.class_name??null,title:row.title,summary:row.summary,body:announcementHtmlToBlocks(String(row.sanitized_html)),scopeLabel,audienceLabel:row.audience==='STAFF'?'Nội bộ nhân sự':row.audience==='FAMILIES'?'Gia đình học sinh':'Nhân sự và gia đình',publishedAt:iso(row.published_at as Date),createdByName:row.author_name??null,attachments:files.map(f=>({id:f.id,name:f.original_name})),source:source(row,{id:row.publication_id}),read:row.read_at!==null,readAt:row.read_at?iso(row.read_at as Date):null});
 }
 return {data:{schoolId,memberId:read.memberId,items},page:page.page};
},{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});}

export async function markTeacherAnnouncementsRead(commands:Commands,service:AnnouncementsService,c:RequestContext):Promise<Result>{
 const schoolId=c.params.schoolId!,sources=c.body.sources as Source[];let memberId='';
 const authorize=async(tx:Transaction)=>{const read=await service.readPredicate(tx,teacherContext(c));memberId=read.memberId;
  // Each displayed revision is checked before idempotent replay, with current teacher/class/subject/date grants.
  for(const expected of sources){const offset=read.predicate.values.length,a=await one<Row>(tx,`SELECT t.*,p.id AS publication_id FROM app.announcements t JOIN app.publication_revisions p ON p.school_id=t.school_id AND p.announcement_id=t.id AND p.kind='ANNOUNCEMENT' AND p.status='PUBLISHED'
    WHERE (${read.predicate.sql}) AND t.school_id=$${offset+1} AND t.id=$${offset+2} AND t.status='PUBLISHED'`,[...read.predicate.values,schoolId,expected.id]);if(!a)notFound();
   const actual=source(a,{id:a.publication_id});if(Object.keys(actual).some(k=>actual[k as keyof Source]!==expected[k as keyof Source]))throw new Problem(409,'STALE_SOURCE');
  }
 };
 return commands.execute(c,authorize,async tx=>{const items=[];
  for(const expected of sources){await tx.query('INSERT INTO app.announcement_read_receipts(school_id,member_id,publication_id) VALUES($1,$2,$3) ON CONFLICT(school_id,member_id,publication_id) DO NOTHING',[schoolId,memberId,expected.publicationId]);const r=await one<Row>(tx,'SELECT id,read_at FROM app.announcement_read_receipts WHERE school_id=$1 AND member_id=$2 AND publication_id=$3',[schoolId,memberId,expected.publicationId]);if(!r)throw new Problem(500,'READ_RECEIPT_UNAVAILABLE');items.push({source:expected,receiptId:r.id,readAt:iso(r.read_at as Date)});}
  await audit(tx,c,'announcement_read',memberId,{count:items.length,publicationIds:sources.map(s=>s.publicationId)});return {data:{schoolId,memberId,items}};
 });
}
