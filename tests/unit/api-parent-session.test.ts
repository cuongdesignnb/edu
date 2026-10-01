import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {beginParentExchange,captureParentSession,clearParentSession,onParentSessionChanged,parentSessionRevision,readParentView} from '@/lib/api/parent-session';

const first='70000000-0000-4000-8000-000000000001',second='70000000-0000-4000-8000-000000000002';
const values=new Map<string,string>(),getItem=vi.fn((key:string)=>values.get(key)??null),setItem=vi.fn((key:string,value:string)=>values.set(key,value)),removeItem=vi.fn((key:string)=>values.delete(key));
beforeEach(()=>{values.clear();vi.stubGlobal('window',{sessionStorage:{getItem,setItem,removeItem}});clearParentSession();vi.clearAllMocks();});
afterEach(()=>{clearParentSession();vi.unstubAllGlobals();});
const adopt=(slug='parent-school',id=first)=>beginParentExchange().adopt(slug,id,'synthetic-parent-csrf');
describe('Native parent tab ownership without a parent account',()=>{
  it('persists only the school slug and non-bearer view ID; never a token, CSRF or private context',()=>{
    const before=parentSessionRevision();adopt();expect(parentSessionRevision()).toBe(before+2);expect(readParentView('parent-school')).toBe(first);expect(readParentView('another-school')).toBeNull();expect(JSON.parse(values.get('edu-parent-view')!)).toEqual({slug:'parent-school',viewId:first});expect(setItem).toHaveBeenCalledTimes(1);expect(values.get('edu-parent-view')).not.toContain('csrf');
  });
  it('clears previous ownership and aborts reads immediately when exchange starts, before any new response',()=>{
    adopt();const old=captureParentSession('parent-school',first),prior=parentSessionRevision();beginParentExchange();expect(readParentView('parent-school')).toBeNull();expect(old.signal.aborted).toBe(true);expect(parentSessionRevision()).toBe(prior+1);expect(()=>old.assertCurrent()).toThrow();expect(values.has('edu-parent-view')).toBe(false);
  });
  it('rejects a late exchange receipt after another link becomes active and never overwrites the current child',()=>{
    const late=beginParentExchange(),current=beginParentExchange();current.adopt('parent-school',second,'current-csrf');expect(()=>late.adopt('parent-school',first,'late-csrf')).toThrow();expect(readParentView('parent-school')).toBe(second);expect(late.signal.aborted).toBe(true);
  });
  it('does not accept a malformed view ID or bearer-like identifier as an acknowledged session',()=>{
    const owner=beginParentExchange();for(const id of ['raw-bearer-secret','','invalid-id'])expect(()=>owner.adopt('parent-school',id,'csrf')).toThrow();expect(readParentView('parent-school')).toBeNull();expect(setItem).not.toHaveBeenCalled();
  });
  it('matches the exact tab view for reads and CSRF confirmation and rejects stale/wrong school ownership',()=>{
    adopt();const owner=captureParentSession('parent-school',first);expect(owner.csrfToken).toBe('synthetic-parent-csrf');owner.confirmCsrf(first,'confirmed-csrf');expect(captureParentSession('parent-school',first).csrfToken).toBe('confirmed-csrf');expect(()=>owner.confirmCsrf(second,'wrong-csrf')).toThrow();expect(()=>captureParentSession('another-school',first)).toThrow();expect(()=>captureParentSession('parent-school',second)).toThrow();adopt('parent-school',second);expect(()=>owner.confirmCsrf(first,'late-csrf')).toThrow();expect(captureParentSession('parent-school',second).csrfToken).toBe('synthetic-parent-csrf');
  });
  it('notifies context removal/adoption and clears the tab view without changing unrelated storage',()=>{
    values.set('unrelated-setting','preserve');let changes=0;const stop=onParentSessionChanged(()=>changes++);try{adopt();expect(changes).toBe(2);clearParentSession();expect(changes).toBe(3);expect(values.get('unrelated-setting')).toBe('preserve');expect(readParentView('parent-school')).toBeNull();}finally{stop();}
  });
  it('restores only an allowlisted non-secret view pointer and refreshes CSRF from API after reload',async()=>{
    values.set('edu-parent-view',JSON.stringify({slug:'parent-school',viewId:first}));vi.resetModules();const reloaded=await import('@/lib/api/parent-session');expect(reloaded.readParentView('parent-school')).toBe(first);expect(reloaded.captureParentSession('parent-school',first).csrfToken).toBeNull();reloaded.clearParentSession();
  });
  it('rejects persisted private payloads and remains usable with blocked session storage',async()=>{
    values.set('edu-parent-view',JSON.stringify({slug:'parent-school',viewId:first,token:'synthetic-secret'}));vi.resetModules();const reloaded=await import('@/lib/api/parent-session');expect(reloaded.readParentView('parent-school')).toBeNull();expect(values.has('edu-parent-view')).toBe(false);
    vi.stubGlobal('window',{get sessionStorage(){throw new Error('storage blocked');}});const owner=reloaded.beginParentExchange();owner.adopt('parent-school',second,'csrf');expect(reloaded.readParentView('parent-school')).toBe(second);reloaded.clearParentSession();
  });
});
