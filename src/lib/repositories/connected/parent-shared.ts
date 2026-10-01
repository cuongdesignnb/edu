import type {ApiSchemas} from '../../api/generated';
import type {nativeParentContext} from './parent-context';
import {nativeParentDocument} from './parent-documents';
import {safeParentHtml} from './safe-parent-html';
import {dateDays} from '../../api/dates';
import {RepoError} from '../errors';
type Context=ReturnType<typeof nativeParentContext>['display'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ nội dung được công bố cho con.');
function allowed(value:object,keys:string[]){if(!value||Object.keys(value).some(key=>!keys.includes(key)))throw invalid();}
function text(value:unknown){if(typeof value!=='string'||!value.trim())throw invalid();return value;}
function nullable(value:unknown){if(value===null)return null;if(typeof value!=='string')throw invalid();return value;}
function timestamp(value:unknown){const time=text(value);if(!Number.isFinite(Date.parse(time)))throw invalid();return time;}
function documents(values:ApiSchemas['ParentDocumentEntry'][],context:Context){
 if(!Array.isArray(values)||values.length>1000||values.length&&!context.modules.includes('documents'))throw invalid();
 const files=values.map(file=>nativeParentDocument(file,context));if(new Set(files.map(file=>file.id)).size!==files.length)throw invalid();return files;
}
export function nativeParentActivity(value:ApiSchemas['ParentSharedActivity'],context:Context,id?:string){
 allowed(value,['id','title','description','dueAt','studentStatus','publicReviewNote','documents','publishedAt','activityStatus','illustration','updatedAt','timezone','dueOn']);
 if(!context.modules.includes('activities')||!uuid.test(text(value.id))||id&&value.id!==id||!['ASSIGNED','SUBMITTED','NEEDS_REVISION','APPROVED','EXCUSED'].includes(value.studentStatus)||value.activityStatus!==null&&!['ASSIGNED','CLOSED'].includes(value.activityStatus)||value.illustration!==null&&!['trophy','stem','clean','book','heart'].includes(value.illustration))throw invalid();
 try{dateDays(value.dueOn,0);}catch{throw invalid();}if(value.dueOn<context.year.startsOn||value.dueOn>=context.year.endsOn)throw invalid();const due=timestamp(value.dueAt);try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:text(value.timezone),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(due)),part=(name:string)=>parts.find(part=>part.type===name)?.value;if(`${part('year')}-${part('month')}-${part('day')}`!==value.dueOn)throw invalid();}catch{throw invalid();}
 return {id:text(value.id),title:text(value.title),description:nullable(value.description),dueDate:value.dueOn,submission:value.studentStatus,status:value.activityStatus===null?null:value.activityStatus==='ASSIGNED'?'active':'closed',illustration:value.illustration,note:nullable(value.publicReviewNote),updatedAt:value.updatedAt===null?null:timestamp(value.updatedAt),publishedAt:timestamp(value.publishedAt),evidence:documents(value.documents,context)};
}
const scopeLabels:Record<string,string>={PUBLIC:'Công khai',SCHOOL:'Toàn trường',GRADE:'Khối lớp',CLASS:'Theo lớp',STUDENT:'Học sinh được chọn'};
export function nativeParentAnnouncement(value:ApiSchemas['ParentSharedAnnouncement'],context:Context,id?:string){
 allowed(value,['id','title','sanitizedHtml','publishedAt','senderLabel','documents','summary','scopeKinds']);
 if(!context.modules.includes('announcements')||!uuid.test(text(value.id))||id&&value.id!==id||!Array.isArray(value.scopeKinds)||value.scopeKinds.length>5||new Set(value.scopeKinds).size!==value.scopeKinds.length||value.scopeKinds.some(kind=>!Object.hasOwn(scopeLabels,kind)))throw invalid();
 return {id:text(value.id),title:text(value.title),summary:nullable(value.summary),from:text(value.senderLabel),publishedAt:timestamp(value.publishedAt),scopeLabels:value.scopeKinds.map(kind=>scopeLabels[kind]),bodyHtml:safeParentHtml(value.sanitizedHtml),attachments:documents(value.documents,context)};
}
export function nativeParentActivities(value:ApiSchemas['ParentSharedActivityDirectory'],context:Context){
 allowed(value,['items']);if(!context.modules.includes('activities')||!Array.isArray(value.items)||value.items.length>1000)throw invalid();
 const items=value.items.map(item=>nativeParentActivity(item,context));if(new Set(items.map(item=>item.id)).size!==items.length)throw invalid();return items;
}
export function nativeParentAnnouncements(value:ApiSchemas['ParentSharedAnnouncementDirectory'],context:Context){
 allowed(value,['items']);if(!context.modules.includes('announcements')||!Array.isArray(value.items)||value.items.length>1000)throw invalid();
 const items=value.items.map(item=>nativeParentAnnouncement(item,context));if(new Set(items.map(item=>item.id)).size!==items.length)throw invalid();return items;
}
