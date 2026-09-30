import {RepoError} from '../repositories/errors';

/** Link credentials are consumed once, kept only in this page's memory, and removed from history. */
const invitations=new Map<string,{token:string;schoolSlug:string}>();
let passwordReset:string|null=null;
function fragment(){
  if(typeof window==='undefined')return null;
  const hash=window.location.hash;
  if(!hash)return null;
  const values=new URLSearchParams(hash.slice(1));
  if(values.has('token'))window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);
  return values;
}
export function invitationCredential(id:string){
  const values=typeof window!=='undefined'&&window.location.pathname===`/invitations/${encodeURIComponent(id)}`?fragment():null,token=values?.get('token'),schoolSlug=values?.get('school');
  if(token&&schoolSlug)invitations.set(id,{token,schoolSlug});
  const result=invitations.get(id);if(!result)throw new RepoError('EXPIRED','Hãy mở đầy đủ đường dẫn lời mời trong email.');return result;
}
export function consumeInvitation(id:string){invitations.delete(id);}
export function resetCredential(){const token=typeof window!=='undefined'&&window.location.pathname==='/reset-password'?fragment()?.get('token'):null;if(token)passwordReset=token;return passwordReset;}
export function consumeResetCredential(){passwordReset=null;}
