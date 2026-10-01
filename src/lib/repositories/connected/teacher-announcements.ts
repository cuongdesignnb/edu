import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import {RepoError} from '../errors';
import {announcementSource} from './announcements';

type Item=ApiSchemas['TeacherAnnouncementItem'];
export type TeacherAnnouncementSource=ApiSchemas['TeacherAnnouncementSource'];
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const stamp=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ thông báo dành cho giáo viên.');
function exact(v:unknown,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))throw invalid();}
export function teacherAnnouncement(v:Item){
 exact(v,['id','rootId','origin','className','title','summary','body','scopeLabel','audienceLabel','publishedAt','createdByName','attachments','source','read','readAt']);announcementSource(v.source);
 if(!uuid(v.source.publicationId)||v.id!==v.source.id||v.rootId!==v.source.rootId||!['school','class'].includes(v.origin)||(v.origin==='class')!==(v.source.classId!==null)||!(v.className===null||typeof v.className==='string')||![v.title,v.summary,v.scopeLabel,v.audienceLabel].every(x=>typeof x==='string')||!stamp(v.publishedAt)||!(v.createdByName===null||typeof v.createdByName==='string')||typeof v.read!=='boolean'||!(v.readAt===null||stamp(v.readAt))||v.read!==(v.readAt!==null))throw invalid();
 if(!Array.isArray(v.body)||!v.body.length||v.body.length>500||!Array.isArray(v.attachments)||v.attachments.length>100||new Set(v.attachments.map(f=>f.id)).size!==v.attachments.length)throw invalid();
 for(const b of v.body){exact(b,['type','text']);if(!['p','h','li'].includes(b.type)||typeof b.text!=='string'||!b.text.trim()||b.text.length>50000)throw invalid();}
 for(const f of v.attachments){exact(f,['id','name']);if(!uuid(f.id)||typeof f.name!=='string')throw invalid();}return v;
}
export async function teacherAnnouncements(schoolId:string){
 const items:Item[]=[],seen=new Set<string>(),cursors=new Set<string>();let memberId:string|undefined,cursor:string|undefined;
 for(let n=0;n<100;n++){const r=await http('getTeacherAnnouncementFeed',{params:{schoolId},query:{limit:100,cursor}}),v=r.data,p=r.page;exact(v,['schoolId','memberId','items']);
  if(v.schoolId!==schoolId||!uuid(v.memberId)||memberId!==undefined&&memberId!==v.memberId||!Array.isArray(v.items)||v.items.length>100||!p||!Number.isInteger(p.limit)||p.limit<1||p.limit>100||v.items.length>p.limit||typeof p.hasMore!=='boolean'||!(p.nextCursor===null||typeof p.nextCursor==='string')||p.hasMore!==(p.nextCursor!==null)||p.hasMore&&!v.items.length)throw invalid();memberId=v.memberId;
  for(const row of v.items){teacherAnnouncement(row);if(seen.has(row.id)||seen.size>=10000)throw invalid();seen.add(row.id);items.push(row);}
  if(!p.hasMore)return items;if(!p.nextCursor||cursors.has(p.nextCursor))throw invalid();cursors.add(p.nextCursor);cursor=p.nextCursor;
 }throw invalid();
}
export async function teacherAnnouncementsRead(schoolId:string,sources:TeacherAnnouncementSource[]){
 if(!sources.length||sources.length>200||new Set(sources.map(s=>s.id)).size!==sources.length)throw new RepoError('VALIDATION','Chọn từ 1 đến 200 thông báo chưa đọc.');for(const s of sources){announcementSource(s);if(!uuid(s.publicationId))throw invalid();}
 const v=(await http('markTeacherAnnouncementsRead',{params:{schoolId},body:{sources}})).data;exact(v,['schoolId','memberId','items']);
 if(v.schoolId!==schoolId||!uuid(v.memberId)||!Array.isArray(v.items)||v.items.length!==sources.length||new Set(v.items.map(i=>i.receiptId)).size!==v.items.length)throw invalid();
 for(let n=0;n<sources.length;n++){const i=v.items[n];exact(i,['source','receiptId','readAt']);announcementSource(i.source);if(!uuid(i.receiptId)||!stamp(i.readAt)||Object.keys(sources[n]).some(k=>sources[n][k as keyof TeacherAnnouncementSource]!==i.source[k as keyof TeacherAnnouncementSource]))throw invalid();}return v;
}
