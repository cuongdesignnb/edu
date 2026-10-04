import type {Actor} from '../permissions/can';
import type {ApiSchemas} from './generated';
import {http,setStaffCsrf,authenticationChanged,authorizationChanged,onAuthenticationChanged} from './client';
import {RepoError,isRepoError} from '../repositories/errors';

export interface StaffSession {actor:Actor;startedAt:string;expiresAt?:string;via:'login'|'invitation'|'demo';mustChangePassword?:boolean}
type Context=ApiSchemas['Context'];
let current:StaffSession|null=null,context:Context|null=null,pending:Promise<Context>|null=null;
let offset=0,generation=0,channel:BroadcastChannel|null=null;
const listeners=new Set<()=>void>();
function accessSignature(value:Context){return JSON.stringify({userId:value.user.id,mustChangePassword:value.user.mustChangePassword===true,platform:[...value.platformActions].sort(),memberships:value.memberships.map(m=>({schoolId:m.schoolId,memberId:m.memberId,status:m.status,schoolStatus:m.schoolStatus,timezone:m.timezone,today:m.today,grants:m.grants.map(g=>({id:g.id,version:g.version,roleId:g.roleId,roleCode:g.roleCode,scope:g.scopeType,classId:g.classId,subjectId:g.subjectId,from:g.validFrom,until:g.validUntil,starts:g.assignmentStartsOn,ends:g.assignmentEndsOn,actions:[...g.actions].sort()})).sort((a,b)=>String(a.id).localeCompare(String(b.id))),duties:m.duties.map(d=>({id:d.id,classId:d.classId,subjectId:d.subjectId,kind:d.kind,starts:d.startsOn,ends:d.endsOn})).sort((a,b)=>a.id.localeCompare(b.id))})).sort((a,b)=>String(a.memberId).localeCompare(String(b.memberId)))});}
function emit(){listeners.forEach(fn=>fn());}
onAuthenticationChanged(()=>{generation++;current=null;context=null;pending=null;emit();});

/** Advisory UI context stays in memory; the server authorizes the HttpOnly cookie on every request. */
export function readStaffSession(){return current;}
export function isExpired(value:StaffSession,now=serverNowISO()){return !!value.expiresAt&&Date.parse(value.expiresAt)<=Date.parse(now);}
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
    const scopeChanged=!!context&&context.user.id===value.user.id&&accessSignature(context)!==accessSignature(value);
    if(current&&current.actor.kind!=='anonymous'&&current.actor.userId!==value.user.id){authenticationChanged();}
    const kind=value.platformActions.length?'platform' as const:'staff' as const;
    const actor:Actor=current&&current.actor.kind===kind&&current.actor.userId===value.user.id?current.actor:{kind,userId:value.user.id};
    offset=Date.parse(value.serverNow)-Date.now();context=value;setStaffCsrf(value.csrfToken);
    current={actor,startedAt:current?.startedAt??value.serverNow,via:current?.via??'login',mustChangePassword:value.user.mustChangePassword===true};if(scopeChanged)authorizationChanged();emit();return value;
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
  await http('logout',{validateData:value=>!!value?.id&&value.status==='REVOKED'});authenticationChanged();announce();
}
/** Compatibility with existing navigation: this cannot create a session or select an arbitrary actor. */
export function adoptAuthenticatedSession(actor:Actor,via:StaffSession['via']='login'){
  if(!context?.user.id||actor.kind==='anonymous'||actor.userId!==context.user.id||!current)throw new RepoError('NO_SESSION');
  current={...current,via};emit();
}
export async function changeStaffPassword(currentPassword:string,newPassword:string){
  const userId=context?.user.id;
  await http('changePassword',{body:{currentPassword,newPassword},validateData:value=>!!value?.id&&value.status==='COMPLETED'&&(!userId||value.id===userId)});authenticationChanged();announce();
}
export function watchStaffAuthentication(refresh:()=>void){
  if(typeof BroadcastChannel==='undefined')return()=>{};
  const active=new BroadcastChannel('edumanage-staff-authentication');channel=active;
  active.onmessage=event=>{if(event.data?.type==='authentication-changed'){authenticationChanged();refresh();}};
  return()=>{active.close();if(channel===active)channel=null;};
}
