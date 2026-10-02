import { onAuthenticationChanged } from '@/lib/api/client';
import type {TourKey} from './registry';
export const PARENT_PROGRESS_KEY='edu:onboarding:parent-overview:v1';
const memory=new Map<string,'skipped'|'completed'>();
let invitedOwner:string|null=null;
onAuthenticationChanged(()=>{invitedOwner=null;for(const key of memory.keys())if(key!=='parent')memory.delete(key);try{sessionStorage.removeItem('edu:onboarding:invited');}catch{/* Browser storage is optional. */}});
export function progressKey(owner:string,schoolId:string|undefined,tour:TourKey){return `${owner}:${schoolId??'PLATFORM'}:${tour}:1`;}
export function sessionProgress(key:string){return memory.get(key);}
export function rememberProgress(key:string,status:'skipped'|'completed'){if(memory.get(key)!=='completed')memory.set(key,status);}
export function wasInvited(owner:string){try{return invitedOwner===owner||sessionStorage.getItem('edu:onboarding:invited')===owner;}catch{return invitedOwner===owner;}}
export function markInvited(owner:string){invitedOwner=owner;try{sessionStorage.setItem('edu:onboarding:invited',owner);}catch{/* Session fallback. */}}
export function readParentProgress(){try{const value=localStorage.getItem(PARENT_PROGRESS_KEY);return value==='completed'||value==='skipped'?value:sessionProgress('parent');}catch{return sessionProgress('parent');}}
export function saveParentProgress(status:'skipped'|'completed'){
 const next=readParentProgress()==='completed'?'completed':status;rememberProgress('parent',next);
 try{localStorage.setItem(PARENT_PROGRESS_KEY,next);return true;}catch{return false;}
}
