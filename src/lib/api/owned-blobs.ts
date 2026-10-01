import {onStaffAccessChanged} from './client';
import {onParentSessionChanged} from './parent-session';
import {RepoError} from '../repositories/errors';

type Owner={kind:'parent'|'staff';assertCurrent:()=>void};
const entries=new Map<string,{blob:Blob;owner:Owner;expiresAt:number}>();
const maxBytes=64*1024*1024;
const missing=()=>new RepoError('READ_ERROR','Nội dung tệp không còn thuộc phiên đang xem. Mở lại tệp để kiểm tra quyền.');
function purge(kind:Owner['kind']){for(const [key,item] of entries)if(item.owner.kind===kind)entries.delete(key);}
onParentSessionChanged(()=>purge('parent'));onStaffAccessChanged(()=>purge('staff'));
function prune(){for(const [key,item] of entries)if(item.expiresAt<=Date.now())entries.delete(key);}
/** Actual API bytes stay in memory for one current owner; never persisted. */
export function keepOwnedBlob(blob:Blob,owner:Owner){
 owner.assertCurrent();prune();if(blob.size>maxBytes)throw missing();
 let bytes=[...entries.values()].reduce((n,item)=>n+item.blob.size,0);
 for(const [key,item] of entries){if(entries.size<32&&bytes+blob.size<=maxBytes)break;entries.delete(key);bytes-=item.blob.size;}
 const key=crypto.randomUUID();owner.assertCurrent();entries.set(key,{blob,owner,expiresAt:Date.now()+30_000});return key;
}
export async function getOwnedBlob(key:string):Promise<Blob>{
 prune();const item=entries.get(key);if(!item)throw missing();item.owner.assertCurrent();return item.blob;
}
export function releaseOwnedBlob(key:string){entries.delete(key);}
