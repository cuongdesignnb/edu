/** Transitional link intake. Raw credentials never enter storage or query keys. */
const links=new Map<string,string>();
const incoming=new Map<string,string>();
let revision=0;

export function parentLinkRevision(){return revision;}
export function readParentToken(slug:string){return links.get(slug)??null;}
export function writeParentToken(slug:string,token:string|null){
  if(links.get(slug)===(token??undefined))return;
  if(token)links.set(slug,token);else links.delete(slug);
  revision++;
}
export function parentCredential(slug:string){
  if(typeof window!=='undefined'&&window.location.pathname===`/p/${encodeURIComponent(slug)}/access`){
    const values=new URLSearchParams(window.location.hash.slice(1)),token=values.get('token');
    if(token){incoming.set(slug,token);window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);}
  }
  return incoming.get(slug)??null;
}
export function consumeParentCredential(slug:string){incoming.delete(slug);}
