import {RepoError} from '../repositories/errors';

const storageKey='edu-parent-view';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
interface ParentView {slug:string;viewId:string;csrfToken:string|null}
type ParentFaultReason='invalid'|'changed'|'expired'|'suspended';
let fault:{slug:string;reason:ParentFaultReason}|null=null;
let view:ParentView|null=null,restored=false,revision=0,requests=new AbortController();
const listeners=new Set<()=>void>();
const changed=()=>new RepoError('CONFLICT','Phiên tra cứu đã đổi. Mở lại link riêng để xem đúng thông tin.',{details:{problemCode:'PARENT_CONTEXT_CHANGED'}});
function storage(){return typeof window==='undefined'?null:window.sessionStorage;}
function persist(){try{const target=storage();if(view)target?.setItem(storageKey,JSON.stringify({slug:view.slug,viewId:view.viewId}));else target?.removeItem(storageKey);}catch{/* A blocked storage area does not weaken memory ownership. */}}
function restore(){
  if(restored||typeof window==='undefined')return;restored=true;
  try{const text=storage()?.getItem(storageKey);if(!text)return;const value=JSON.parse(text);if(typeof value.slug==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)&&typeof value.viewId==='string'&&uuid.test(value.viewId)&&Object.keys(value).every(key=>['slug','viewId'].includes(key)))view={slug:value.slug,viewId:value.viewId,csrfToken:null};else storage()?.removeItem(storageKey);}catch{try{storage()?.removeItem(storageKey);}catch{/* Storage may be blocked. */}}
}
function invalidate(){const previous=requests;requests=new AbortController();previous.abort();revision++;}
function notify(){listeners.forEach(listener=>listener());}
export function parentSessionRevision(){restore();return revision;}
export function onParentSessionChanged(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
/** Only a non-bearer view ID survives reload. Cookie authentication remains server-owned. */
export function readParentView(slug:string){restore();return view?.slug===slug?view.viewId:null;}
export function readParentFault(slug:string){return fault?.slug===slug?fault.reason:null;}
export function clearParentSession(){restored=true;invalidate();view=null;fault=null;persist();notify();}
export function clearParentSessionFor(slug:string){restore();if(view?.slug===slug||fault?.slug===slug)clearParentSession();}
/** Starting another link removes previous private ownership before exchange can complete. */
export function beginParentExchange(){
  clearParentSession();const owner=revision,signal=requests.signal;
  return {signal,assertCurrent(){if(owner!==revision)throw changed();},adopt(slug:string,viewId:string,csrfToken:string){
    if(owner!==revision)throw changed();if(typeof viewId!=='string'||!uuid.test(viewId)||typeof slug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||typeof csrfToken!=='string'||!csrfToken)throw new RepoError('NETWORK','Chưa xác nhận được phiên tra cứu. Thử mở lại link riêng.');
    invalidate();view={slug,viewId,csrfToken};persist();notify();
  }};
}
/** Bind every read to the exact tab view and abort it when another link becomes active. */
export function captureParentSession(slug:string,expectedViewId:string){
  restore();if(!view||view.slug!==slug||view.viewId!==expectedViewId)throw changed();
  const owner=revision,value=view;
  return {viewId:value.viewId,csrfToken:value.csrfToken,signal:requests.signal,assertCurrent(){if(owner!==revision||view!==value)throw changed();},confirmCsrf(viewId:string,csrfToken:string){
    if(owner!==revision||view!==value||viewId!==value.viewId)throw changed();if(!csrfToken)throw new RepoError('READ_ERROR','API chưa xác nhận phiên tra cứu.');value.csrfToken=csrfToken;
  },fail(reason:ParentFaultReason){
    if(owner!==revision||view!==value)throw changed();invalidate();view=null;fault={slug,reason};persist();notify();
  }};
}
