import {afterEach,describe,expect,it,vi} from 'vitest';
import {parentCredential,consumeParentCredential} from '@/lib/api/parent-credential';

afterEach(()=>{vi.unstubAllGlobals();for(const slug of ['credential-school-a','credential-school-b']){consumeParentCredential(slug);}});
describe('parent fragment intake independent of view ownership',()=>{
  it('consumes a fragment only on its own school access route, removes it from history and does not persist it',()=>{
    const slug='credential-school-a',location={pathname:`/p/${slug}/access`,hash:'#token=synthetic-parent-secret',search:''},replaceState=vi.fn().mockImplementation(()=>{location.hash='';}),setItem=vi.fn();
    vi.stubGlobal('window',{location,history:{state:null,replaceState},localStorage:{setItem},sessionStorage:{setItem}});
    expect(parentCredential('credential-school-b')).toBeNull();expect(location.hash).not.toBe('');expect(parentCredential(slug)).toBe('synthetic-parent-secret');expect(replaceState).toHaveBeenCalledWith(null,'',location.pathname);expect(setItem).not.toHaveBeenCalled();
    expect(parentCredential(slug)).toBe('synthetic-parent-secret');consumeParentCredential(slug);expect(parentCredential(slug)).toBeNull();
  });
  it('does not treat the old query token as a usable link',()=>{
    vi.stubGlobal('window',{location:{pathname:'/p/credential-school-a/access',hash:'',search:'?t=synthetic-query-secret'},history:{replaceState:vi.fn()}});expect(parentCredential('credential-school-a')).toBeNull();
  });
  it('keeps pending fragments separate while a successful receipt consumes only its own fragment',()=>{
    const location={pathname:'/p/credential-school-a/access',hash:'#token=first-synthetic-secret',search:''};
    vi.stubGlobal('window',{location,history:{state:null,replaceState:vi.fn().mockImplementation(()=>{location.hash='';})}});
    expect(parentCredential('credential-school-a')).toBe('first-synthetic-secret');
    location.pathname='/p/credential-school-b/access';location.hash='#token=other-synthetic-secret';expect(parentCredential('credential-school-b')).toBe('other-synthetic-secret');
    consumeParentCredential('credential-school-a');expect(parentCredential('credential-school-a')).toBeNull();expect(parentCredential('credential-school-b')).toBe('other-synthetic-secret');
  });
});
