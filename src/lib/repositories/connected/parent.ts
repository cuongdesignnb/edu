import type {Ctx} from '../core';
import {http,captureStaffAccess} from '../../api/client';
import {beginParentExchange,captureParentSession} from '../../api/parent-session';
import {dateDays} from '../../api/dates';
import {RepoError,isRepoError} from '../errors';
import {nativeParentContext} from './parent-context';

/** Public reads use only a non-bearer view ID. A raw fragment is accepted only by open. */
export type ParentKey={viewId:string}|{preview:{ctx:Ctx;schoolId:string;accessId:string}};
type Historical=typeof import('../parent').parentRepo;
type ReplaceFirst<T>=T extends (...args:infer A)=>infer R?A extends [unknown,...infer Rest]?(key:ParentKey,...args:Rest)=>R:T:T;
/** Unconnected methods retain their display contracts, and still fail through the facade. */
export type ParentRepositoryInterface={[K in keyof Historical]:ReplaceFirst<Historical[K]>};
export type ParentOpenKey={token:string}|Extract<ParentKey,{preview:unknown}>;
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
  try{const result=await http('previewParent',{params:{schoolId,accessId}});
    ctx.staffOwner?.assertCurrent();owner.assertCurrent();return nativeParentContext(result.data.context,slug,true).display;
  }catch(error){ctx.staffOwner?.assertCurrent();owner.assertCurrent();throw error;}
}
export const connectedParentRepo={
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
