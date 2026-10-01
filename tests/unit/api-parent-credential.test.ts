import {afterEach,describe,expect,it,vi} from 'vitest';
import {parentCredential,consumeParentCredential,readParentToken,writeParentToken,parentLinkRevision} from '@/lib/api/parent-credential';

afterEach(()=>{vi.unstubAllGlobals();for(const slug of ['credential-school-a','credential-school-b']){consumeParentCredential(slug);writeParentToken(slug,null);}});
describe('transitional parent credential intake (portal adapter remains unavailable)',()=>{
  it('consumes a fragment only on its own school access route, removes it from history and does not persist it',()=>{
    const slug='credential-school-a',location={pathname:`/p/${slug}/access`,hash:'#token=synthetic-parent-secret',search:''},replaceState=vi.fn().mockImplementation(()=>{location.hash='';}),setItem=vi.fn();
    vi.stubGlobal('window',{location,history:{state:null,replaceState},localStorage:{setItem},sessionStorage:{setItem}});
    expect(parentCredential('credential-school-b')).toBeNull();expect(location.hash).not.toBe('');expect(parentCredential(slug)).toBe('synthetic-parent-secret');expect(replaceState).toHaveBeenCalledWith(null,'',location.pathname);expect(setItem).not.toHaveBeenCalled();
    expect(parentCredential(slug)).toBe('synthetic-parent-secret');consumeParentCredential(slug);expect(parentCredential(slug)).toBeNull();
  });
  it('does not treat the old query token as a usable link',()=>{
    vi.stubGlobal('window',{location:{pathname:'/p/credential-school-a/access',hash:'',search:'?t=synthetic-query-secret'},history:{replaceState:vi.fn()}});expect(parentCredential('credential-school-a')).toBeNull();
  });
  it('keeps independent memory ownership and nonsecret cache revisions when a link changes',()=>{
    const before=parentLinkRevision();writeParentToken('credential-school-a','first-synthetic-secret');writeParentToken('credential-school-b','other-synthetic-secret');expect(parentLinkRevision()).toBe(before+2);expect(readParentToken('credential-school-a')).toBe('first-synthetic-secret');writeParentToken('credential-school-a','first-synthetic-secret');expect(parentLinkRevision()).toBe(before+2);writeParentToken('credential-school-a',null);expect(readParentToken('credential-school-a')).toBeNull();expect(readParentToken('credential-school-b')).toBe('other-synthetic-secret');
  });
});
