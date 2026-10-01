import type {Ctx} from '../core';
import type {ApiSchemas} from '../../api/generated';
import {http,download,captureStaffAccess} from '../../api/client';
import {keepOwnedBlob} from '../../api/owned-blobs';
import {beginParentExchange,captureParentSession} from '../../api/parent-session';
import {dateDays} from '../../api/dates';
import {RepoError,isRepoError} from '../errors';
import {nativeParentAttendance} from './parent-attendance';
import {nativeParentTeachers} from './parent-teachers';
import {nativeParentDuties} from './parent-duties';
import {nativeParentTimetable} from './parent-timetable';
import {nativeParentContext} from './parent-context';
import {nativeParentDocuments,nativeParentDocument} from './parent-documents';
import {nativeParentActivity,nativeParentAnnouncement,nativeParentActivities,nativeParentAnnouncements} from './parent-shared';
import {nativeParentConduct,nativeParentConductDirectory} from './parent-conduct';
import {nativeParentOverview} from './parent-overview';

/** Public reads use only a non-bearer view ID. A raw fragment is accepted only by open. */
export type ParentKey={viewId:string}|{preview:{ctx:Ctx;schoolId:string;accessId:string}};
type Historical=typeof import('../parent').parentRepo;
type ReplaceFirst<T>=T extends (...args:infer A)=>infer R?A extends [unknown,...infer Rest]?(key:ParentKey,...args:Rest)=>R:T:T;
/** Unconnected methods retain their display contracts, and still fail through the facade. */
export type ParentRepositoryInterface={[K in keyof Historical]:ReplaceFirst<Historical[K]>};
export type ParentOpenKey={token:string}|Extract<ParentKey,{preview:unknown}>;
type ParentDisplay=ReturnType<typeof nativeParentContext>['display'];
function requireSection(context:ParentDisplay,section:'overview'|ParentDisplay['modules'][number]){
  if(!(section==='overview'?context.overviewAllowed:context.modules.includes(section)))throw new RepoError('FORBIDDEN','module',{details:{problemCode:'PARENT_SECTION_DENIED'}});
}
function terminal(error:unknown){
  if(!isRepoError(error))return null;
  if(error.details?.problemCode==='PARENT_CONTEXT_CHANGED')return 'changed' as const;
  if(error.details?.problemCode==='PARENT_ACCESS_INVALID'||error.code==='REVOKED')return 'invalid' as const;
  if(error.code==='EXPIRED')return 'expired' as const;
  if(error.code==='SUSPENDED')return 'suspended' as const;
  return null;
}
async function previewContext(key:Extract<ParentKey,{preview:unknown}>,slug:string){
  const {ctx,schoolId,accessId}=key.preview,owner=captureStaffAccess();
  ctx.staffOwner?.assertCurrent();owner.assertCurrent();
  try{const result=await http('getParentAccessPreviewContext',{params:{schoolId,accessId}});
    ctx.staffOwner?.assertCurrent();owner.assertCurrent();return nativeParentContext(result.data,slug,true).display;
  }catch(error){ctx.staffOwner?.assertCurrent();owner.assertCurrent();throw error;}
}
async function documentFile(key:ParentKey,slug:string,id:string,forDownload:boolean){
 const parent='preview' in key?null:captureParentSession(slug,key.viewId),staff='preview' in key?captureStaffAccess():null;
 const assertCurrent=()=>{parent?.assertCurrent();staff?.assertCurrent();if('preview' in key)key.preview.ctx.staffOwner?.assertCurrent();};
 assertCurrent();
 try{
   const context=await connectedParentRepo.context(key,slug);assertCurrent();requireSection(context,'documents');
   const metadata='preview' in key?await http('previewParentDocument',{params:{schoolId:key.preview.schoolId,accessId:key.preview.accessId,documentId:id}}):await http('getParentDocument',{params:{schoolSlug:slug,documentId:id},parentViewId:parent!.viewId,signal:parent!.signal});
   assertCurrent();const file=nativeParentDocument(metadata.data,context,id);
   if(!(forDownload?file.downloadAllowed:file.viewAllowed))throw new RepoError('FORBIDDEN',forDownload?'Nhà trường chưa cho phép tải tệp này.':'Định dạng tệp này không được xem trước.',{details:{problemCode:forDownload?'DOWNLOAD_DENIED':'FILE_PREVIEW_DENIED'}});
   const bytes='preview' in key?await download(forDownload?'previewParentDocumentDownload':'previewParentDocumentView',{params:{schoolId:key.preview.schoolId,accessId:key.preview.accessId,documentId:id}}):await download(forDownload?'downloadParentDocument':'viewParentDocument',{params:{schoolSlug:slug,documentId:id},parentViewId:parent!.viewId,signal:parent!.signal});
   assertCurrent();if(bytes.blob.type.split(';',1)[0].trim().toLowerCase()!==file.mime.toLowerCase()||bytes.blob.size!==file.size)throw new RepoError('READ_ERROR','Nội dung tệp chưa khớp với metadata được API xác nhận.');
   return {...bytes,file,owner:{kind:'preview' in key?'staff' as const:'parent' as const,assertCurrent}};
 }catch(error){assertCurrent();const reason=terminal(error);if(reason&&parent)parent.fail(reason);throw error;}
}
async function sharedContent(key:ParentKey,slug:string,section:'activities'|'announcements',id?:string){
 const parent='preview' in key?null:captureParentSession(slug,key.viewId),staff='preview' in key?captureStaffAccess():null;
 const current=()=>{parent?.assertCurrent();staff?.assertCurrent();if('preview' in key)key.preview.ctx.staffOwner?.assertCurrent();};current();
 try{
   const context=await connectedParentRepo.context(key,slug);current();requireSection(context,section);
   if(section==='activities'){
     const result='preview' in key?id?await http('previewParentPublishedActivity',{params:{schoolId:key.preview.schoolId,accessId:key.preview.accessId,activityId:id}}):await http('previewParentPublishedActivityDirectory',{params:{schoolId:key.preview.schoolId,accessId:key.preview.accessId}}):id?await http('getParentPublishedActivity',{params:{schoolSlug:slug,activityId:id},parentViewId:parent!.viewId,signal:parent!.signal}):await http('getParentPublishedActivityDirectory',{params:{schoolSlug:slug},parentViewId:parent!.viewId,signal:parent!.signal});
     current();return id?nativeParentActivity(result.data as ApiSchemas['ParentSharedActivity'],context,id):nativeParentActivities(result.data as ApiSchemas['ParentSharedActivityDirectory'],context);
   }
   const result='preview' in key?id?await http('previewParentPublishedAnnouncement',{params:{schoolId:key.preview.schoolId,accessId:key.preview.accessId,announcementId:id}}):await http('previewParentPublishedAnnouncementDirectory',{params:{schoolId:key.preview.schoolId,accessId:key.preview.accessId}}):id?await http('getParentPublishedAnnouncement',{params:{schoolSlug:slug,announcementId:id},parentViewId:parent!.viewId,signal:parent!.signal}):await http('getParentPublishedAnnouncementDirectory',{params:{schoolSlug:slug},parentViewId:parent!.viewId,signal:parent!.signal});
   current();return id?nativeParentAnnouncement(result.data as ApiSchemas['ParentSharedAnnouncement'],context,id):nativeParentAnnouncements(result.data as ApiSchemas['ParentSharedAnnouncementDirectory'],context);
 }catch(error){current();const reason=terminal(error);if(reason&&parent)parent.fail(reason);throw error;}
}
async function publishedConduct(key:ParentKey,slug:string,id?:string){
 const parent='preview' in key?null:captureParentSession(slug,key.viewId),staff='preview' in key?captureStaffAccess():null;
 const current=()=>{parent?.assertCurrent();staff?.assertCurrent();if('preview' in key)key.preview.ctx.staffOwner?.assertCurrent();};current();
 try{
   const context=await connectedParentRepo.context(key,slug);current();requireSection(context,'conduct');
   const result='preview' in key?id?await http('previewParentPublishedConduct',{params:{schoolId:key.preview.schoolId,accessId:key.preview.accessId,periodId:id}}):await http('previewParentPublishedConductDirectory',{params:{schoolId:key.preview.schoolId,accessId:key.preview.accessId}}):id?await http('getParentPublishedConduct',{params:{schoolSlug:slug,periodId:id},parentViewId:parent!.viewId,signal:parent!.signal}):await http('getParentPublishedConductDirectory',{params:{schoolSlug:slug},parentViewId:parent!.viewId,signal:parent!.signal});
   current();return id?nativeParentConduct(result.data as ApiSchemas['ParentSharedConduct'],context,id):nativeParentConductDirectory(result.data as ApiSchemas['ParentSharedConductDirectory'],context);
 }catch(error){current();const reason=terminal(error);if(reason&&parent)parent.fail(reason);throw error;}
}
export const connectedParentRepo={
  async overview(key:ParentKey,slug:string){
    const parent='preview' in key?null:captureParentSession(slug,key.viewId),staff='preview' in key?captureStaffAccess():null;
    const current=()=>{parent?.assertCurrent();staff?.assertCurrent();if('preview' in key)key.preview.ctx.staffOwner?.assertCurrent();};current();
    try{const context=await connectedParentRepo.context(key,slug);current();requireSection(context,'overview');
      const result='preview' in key?await http('previewParentPublishedOverview',{params:{schoolId:key.preview.schoolId,accessId:key.preview.accessId}}):await http('getParentPublishedOverview',{params:{schoolSlug:slug},parentViewId:parent!.viewId,signal:parent!.signal});
      current();return nativeParentOverview(result.data,context);
    }catch(error){current();const reason=terminal(error);if(reason&&parent)parent.fail(reason);throw error;}
  },
  async conductList(key:ParentKey,slug:string){return publishedConduct(key,slug) as Promise<ReturnType<typeof nativeParentConduct>[]>;},
  async conductDetail(key:ParentKey,slug:string,id:string){return publishedConduct(key,slug,id) as Promise<ReturnType<typeof nativeParentConduct>>;},
  async activities(key:ParentKey,slug:string){return sharedContent(key,slug,'activities') as Promise<ReturnType<typeof nativeParentActivity>[]>;},
  async activity(key:ParentKey,slug:string,id:string){return sharedContent(key,slug,'activities',id) as Promise<ReturnType<typeof nativeParentActivity>>;},
  async announcements(key:ParentKey,slug:string){return sharedContent(key,slug,'announcements') as Promise<ReturnType<typeof nativeParentAnnouncement>[]>;},
  async announcement(key:ParentKey,slug:string,id:string){return sharedContent(key,slug,'announcements',id) as Promise<ReturnType<typeof nativeParentAnnouncement>>;},
  async documents(key:ParentKey,slug:string){
    const parent='preview' in key?null:captureParentSession(slug,key.viewId),staff='preview' in key?captureStaffAccess():null;
    const current=()=>{parent?.assertCurrent();staff?.assertCurrent();if('preview' in key)key.preview.ctx.staffOwner?.assertCurrent();};current();
    try{const context=await connectedParentRepo.context(key,slug);current();requireSection(context,'documents');
      const result='preview' in key?await http('previewParentDocumentDirectory',{params:{schoolId:key.preview.schoolId,accessId:key.preview.accessId}}):await http('getParentDocumentDirectory',{params:{schoolSlug:slug},parentViewId:parent!.viewId,signal:parent!.signal});
      current();return nativeParentDocuments(result.data,context);
    }catch(error){current();const reason=terminal(error);if(reason&&parent)parent.fail(reason);throw error;}
  },
  async file(key:ParentKey,slug:string,id:string){
    const result=await documentFile(key,slug,id,false);result.owner.assertCurrent();
    return {...result.file,source:{kind:'blob' as const,blobKey:keepOwnedBlob(result.blob,result.owner)}};
  },
  async downloadFile(key:ParentKey,slug:string,id:string){const result=await documentFile(key,slug,id,true);result.owner.assertCurrent();return {blob:result.blob,filename:result.filename,assertCurrent:result.owner.assertCurrent};},
  async publicSchool(slug:string){
    const {data}=await http('getPublicSchool',{params:{schoolSlug:slug}});
    if(!data||data.slug!==slug||typeof data.name!=='string'||!data.name||['token','tokenHash','student','students','guardians','contacts'].some(key=>Object.hasOwn(data,key)))throw new RepoError('READ_ERROR','API chưa xác nhận thông tin công khai của trường.');
    const contact=(value:string|undefined)=>{if(value!==undefined&&typeof value!=='string')throw new RepoError('READ_ERROR','Thông tin liên hệ công khai không hợp lệ.');return value??null;};
    return {school:{name:data.name,slug,address:contact(data.publicAddress),publicPhone:contact(data.publicContactPhone),publicEmail:contact(data.publicContactEmail)}};
  },
  async open(key:ParentOpenKey,slug:string){
    const context= 'preview' in key?await previewContext(key,slug):await (async()=>{
      const owner=beginParentExchange();
      try{const result=await http('exchangeParentLink',{params:{schoolSlug:slug},body:{token:key.token},signal:owner.signal,
        validateData:data=>{owner.assertCurrent();try{nativeParentContext(data,slug);return true;}catch{return false;}}});
        owner.assertCurrent();const parsed=nativeParentContext(result.data,slug);owner.adopt(slug,parsed.viewId,parsed.csrfToken);return parsed.display;
      }catch(error){owner.assertCurrent();throw error;}
    })();
    return {ok:true as const,modules:context.modules,overviewAllowed:context.overviewAllowed,homeModule:context.overviewAllowed?'overview':context.modules[0]};
  },
  async attendance(key:ParentKey,slug:string,month:string){
    const composite='preview' in key?captureStaffAccess():null;
    const context=await connectedParentRepo.context(key,slug);composite?.assertCurrent();requireSection(context,'attendance');
    if('preview' in key){const {ctx,schoolId,accessId}=key.preview,owner=composite!;ctx.staffOwner?.assertCurrent();owner.assertCurrent();
      try{const {data}=await http('previewParentAttendanceMonth',{params:{schoolId,accessId},query:{month}});ctx.staffOwner?.assertCurrent();owner.assertCurrent();return nativeParentAttendance(data,context,month);}
      catch(error){ctx.staffOwner?.assertCurrent();owner.assertCurrent();throw error;}
    }
    const owner=captureParentSession(slug,key.viewId);
    try{const {data}=await http('getParentAttendanceMonth',{params:{schoolSlug:slug},query:{month},parentViewId:owner.viewId,signal:owner.signal});owner.assertCurrent();return nativeParentAttendance(data,context,month);}
    catch(error){owner.assertCurrent();const reason=terminal(error);if(reason)owner.fail(reason);throw error;}
  },
  async teachers(key:ParentKey,slug:string){
    const composite='preview' in key?captureStaffAccess():null;
    const context=await connectedParentRepo.context(key,slug);composite?.assertCurrent();requireSection(context,'teachers');
    if('preview' in key){const {ctx,schoolId,accessId}=key.preview,owner=composite!;ctx.staffOwner?.assertCurrent();owner.assertCurrent();
      try{const {data}=await http('previewParentTeacherDirectory',{params:{schoolId,accessId}});ctx.staffOwner?.assertCurrent();owner.assertCurrent();return nativeParentTeachers(data,context);}
      catch(error){ctx.staffOwner?.assertCurrent();owner.assertCurrent();throw error;}
    }
    const owner=captureParentSession(slug,key.viewId);
    try{const {data}=await http('getParentTeacherDirectory',{params:{schoolSlug:slug},parentViewId:owner.viewId,signal:owner.signal});owner.assertCurrent();return nativeParentTeachers(data,context);}
    catch(error){owner.assertCurrent();const reason=terminal(error);if(reason)owner.fail(reason);throw error;}
  },
  async timetable(key:ParentKey,slug:string,week:string){
    const composite='preview' in key?captureStaffAccess():null;
    const context=await connectedParentRepo.context(key,slug);composite?.assertCurrent();requireSection(context,'timetable');
    if('preview' in key){const {ctx,schoolId,accessId}=key.preview,owner=composite!;ctx.staffOwner?.assertCurrent();owner.assertCurrent();
      try{const {data}=await http('previewParentTimetableWeek',{params:{schoolId,accessId},query:{week}});ctx.staffOwner?.assertCurrent();owner.assertCurrent();return nativeParentTimetable(data,context,week);}
      catch(error){ctx.staffOwner?.assertCurrent();owner.assertCurrent();throw error;}
    }
    const owner=captureParentSession(slug,key.viewId);
    try{const {data}=await http('getParentTimetableWeek',{params:{schoolSlug:slug},query:{week},parentViewId:owner.viewId,signal:owner.signal});owner.assertCurrent();return nativeParentTimetable(data,context,week);}
    catch(error){owner.assertCurrent();const reason=terminal(error);if(reason)owner.fail(reason);throw error;}
  },
  async duties(key:ParentKey,slug:string){
    const composite='preview' in key?captureStaffAccess():null;
    const context=await connectedParentRepo.context(key,slug);composite?.assertCurrent();requireSection(context,'duties');
    if('preview' in key){const {ctx,schoolId,accessId}=key.preview,owner=composite!;ctx.staffOwner?.assertCurrent();owner.assertCurrent();
      try{const {data}=await http('previewParentDutySchedule',{params:{schoolId,accessId}});ctx.staffOwner?.assertCurrent();owner.assertCurrent();return nativeParentDuties(data,context);}
      catch(error){ctx.staffOwner?.assertCurrent();owner.assertCurrent();throw error;}
    }
    const owner=captureParentSession(slug,key.viewId);
    try{const {data}=await http('getParentDutySchedule',{params:{schoolSlug:slug},parentViewId:owner.viewId,signal:owner.signal});owner.assertCurrent();return nativeParentDuties(data,context);}
    catch(error){owner.assertCurrent();const reason=terminal(error);if(reason)owner.fail(reason);throw error;}
  },
  async context(key:ParentKey,slug:string){
    if('preview' in key)return previewContext(key,slug);
    const owner=captureParentSession(slug,key.viewId);
    try{const result=await http('getParentContext',{params:{schoolSlug:slug},parentViewId:owner.viewId,signal:owner.signal});
      owner.assertCurrent();const parsed=nativeParentContext(result.data,slug);owner.confirmCsrf(parsed.viewId,parsed.csrfToken);return parsed.display;
    }catch(error){owner.assertCurrent();const reason=terminal(error);if(reason)owner.fail(reason);throw error;}
  },
};
export const connectedParentExtraRepo={
  async grantedYear(key:ParentKey,slug:string){const value=await connectedParentRepo.context(key,slug);return {label:value.year.label,startDate:value.year.startsOn,endDate:dateDays(value.year.endsOn,-1)};},
};
