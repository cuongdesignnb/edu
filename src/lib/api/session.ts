import type {Actor} from '../permissions/can';
import type {ApiSchemas} from './generated';
import {http,setStaffCsrf,authenticationChanged,onAuthenticationChanged} from './client';
import {RepoError,isRepoError} from '../repositories/errors';

export interface StaffSession {actor:Actor;startedAt:string;expiresAt?:string;via:'login'|'invitation'|'demo'}
type Context=ApiSchemas['Context'];
let current:StaffSession|null=null,context:Context|null=null,pending:Promise<Context>|null=null;
let offset=0,generation=0,channel:BroadcastChannel|null=null;
const listeners=new Set<()=>void>();
function emit(){listeners.forEach(fn=>fn());}
onAuthenticationChanged(()=>{generation++;current=null;context=null;pending=null;emit();});

/** Advisory UI context stays in memory; the server authorizes the HttpOnly cookie on every request. */
export function readStaffSession(){return current;}
export function readStaffContext(){return context;}
export function onStaffSessionChange(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function serverNowISO(){return new Date(Date.now()+offset).toISOString();}
export function serverToday(schoolId?:string){
  const zone=context?.memberships.find(m=>m.schoolId===schoolId)?.timezone??'Asia/Ho_Chi_Minh';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(Date.now()+offset));
  const value=(kind:string)=>parts.find(p=>p.type===kind)?.value;return `${value('year')}-${value('month')}-${value('day')}`;
}
export async function refreshStaffContext():Promise<Context>{
  if(pending)return pending;
  const revision=generation;
  const work=(async()=>{
    const value=(await http('getMyContext')).data;
    if(revision!==generation)throw new RepoError('NO_SESSION','Phiên đã thay đổi trong lúc tải.');
    if(!value.user.id||!Number.isFinite(Date.parse(value.serverNow)))throw new RepoError('READ_ERROR','Ngữ cảnh phiên không đúng hợp đồng.');
    if(current&&current.actor.kind!=='anonymous'&&current.actor.userId!==value.user.id){authenticationChanged();}
    const actor:Actor=current&&current.actor.kind!=='anonymous'&&current.actor.userId===value.user.id?current.actor:{kind:value.platformActions.length?'platform':'staff',userId:value.user.id};
    offset=Date.parse(value.serverNow)-Date.now();context=value;setStaffCsrf(value.csrfToken);
    current={actor,startedAt:current?.startedAt??value.serverNow,via:current?.via??'login'};emit();return value;
  })();
  pending=work;
  try{return await work;}finally{if(pending===work)pending=null;}
}
export async function restoreStaffSession(){
  try{return await refreshStaffContext();}catch(error){if(isRepoError(error)&&error.code==='NO_SESSION')return null;throw error;}
}
function announce(){channel?.postMessage({type:'authentication-changed'});}
export async function loginStaff(email:string,password:string){
  const result=(await http('login',{body:{email:email.trim(),password}})).data;
  authenticationChanged();setStaffCsrf(result.csrfToken);announce();
  const value=await refreshStaffContext();return {userId:value.user.id!,isPlatform:value.platformActions.length>0};
}
export async function logoutStaff(){
  await http('logout');authenticationChanged();announce();
}
/** Compatibility with existing navigation: this cannot create a session or select an arbitrary actor. */
export function adoptAuthenticatedSession(actor:Actor,via:StaffSession['via']='login'){
  if(!context?.user.id||actor.kind==='anonymous'||actor.userId!==context.user.id||!current)throw new RepoError('NO_SESSION');
  current={...current,via};emit();
}
export async function changeStaffPassword(currentPassword:string,newPassword:string){
  await http('changePassword',{body:{currentPassword,newPassword}});authenticationChanged();announce();
}
export function watchStaffAuthentication(refresh:()=>void){
  if(typeof BroadcastChannel==='undefined')return()=>{};
  const active=new BroadcastChannel('edumanage-staff-authentication');channel=active;
  active.onmessage=event=>{if(event.data?.type==='authentication-changed'){authenticationChanged();refresh();}};
  return()=>{active.close();if(channel===active)channel=null;};
}
