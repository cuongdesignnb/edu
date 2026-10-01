import type {ApiSchemas} from '../../api/generated';
import type {nativeParentContext} from './parent-context';
import {RepoError} from '../errors';

type Context=ReturnType<typeof nativeParentContext>['display'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const previewTypes=['image/png','image/jpeg','image/webp','application/pdf'];
const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ tài liệu được chia sẻ cho con.');
function allowed(value:object,keys:string[]){if(!value||Object.keys(value).some(key=>!keys.includes(key)))throw invalid();}
function text(value:unknown){if(typeof value!=='string'||!value.trim())throw invalid();return value;}
function time(value:unknown){const result=text(value);if(!Number.isFinite(Date.parse(result)))throw invalid();return result;}
export function nativeParentDocument(value:ApiSchemas['ParentDocumentEntry'],context:Context,id?:string){
 allowed(value,['id','title','contentType','byteSize','downloadAllowed','viewAllowed','publishedAt']);
 if(!context.modules.includes('documents')||!uuid.test(text(value.id))||id&&value.id!==id||typeof value.byteSize!=='number'||!Number.isSafeInteger(value.byteSize)||value.byteSize<1||typeof value.downloadAllowed!=='boolean'||typeof value.viewAllowed!=='boolean'||value.downloadAllowed&&!context.allowDownload||value.viewAllowed!==previewTypes.includes(value.contentType))throw invalid();
 return {id:text(value.id),name:text(value.title),mime:text(value.contentType),size:value.byteSize,createdAt:time(value.publishedAt),downloadAllowed:value.downloadAllowed,viewAllowed:value.viewAllowed};
}
export function nativeParentDocuments(value:ApiSchemas['ParentDocumentDirectory'],context:Context){
 allowed(value,['files','reports']);if(!Array.isArray(value.files)||!Array.isArray(value.reports)||value.files.length>1000||value.reports.length>1000||value.reports.length&&!context.modules.includes('conduct'))throw invalid();
 const files=value.files.map(file=>nativeParentDocument(file,context)),ids=new Set(files.map(file=>file.id));if(ids.size!==files.length)throw invalid();
 const reports=value.reports.map(report=>{
   allowed(report,['periodId','title','publishedAt','total','grade','revision']);
   if(!uuid.test(text(report.periodId))||typeof report.total!=='string'||!/^[-+]?\d+(\.\d+)?$/.test(report.total)||!Number.isFinite(Number(report.total))||report.grade!==null&&typeof report.grade!=='string'||!Number.isSafeInteger(report.revision)||report.revision<1)throw invalid();
   return {periodId:report.periodId,title:text(report.title),publishedAt:time(report.publishedAt),total:report.total,grade:report.grade,revision:report.revision};
 });
 if(new Set(reports.map(report=>report.periodId)).size!==reports.length)throw invalid();return {files,reports};
}
