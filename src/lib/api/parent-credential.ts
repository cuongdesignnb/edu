/** Fragment intake only. Raw credentials never enter storage, session ownership or query keys. */
const incoming=new Map<string,string>();

export function parentCredential(slug:string){
  if(typeof window!=='undefined'&&window.location.pathname===`/p/${encodeURIComponent(slug)}/access`){
    const values=new URLSearchParams(window.location.hash.slice(1)),token=values.get('token');
    if(token){incoming.set(slug,token);window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);}
  }
  return incoming.get(slug)??null;
}
export function consumeParentCredential(slug:string){incoming.delete(slug);}
