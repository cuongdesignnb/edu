import {afterEach,describe,expect,it,vi} from 'vitest';
import {makeStaffCtx} from '@/lib/api/context';
import {authenticationChanged} from '@/lib/api/client';
import {serverToday} from '@/lib/api/session';

vi.mock('@/lib/api/session',()=>({readStaffSession:()=>({actor:{kind:'staff',userId:'current-cookie-user'}}),serverNowISO:()=> '2026-09-30T13:00:00Z',serverToday:vi.fn().mockReturnValue('2026-09-30')}));
afterEach(()=>authenticationChanged());
describe('memory-only native UI context',()=>{
  it('captures the actual session actor and server date with an owner retained by the callback',()=>{
    const ctx=makeStaffCtx('school-timezone-id');expect(ctx).toMatchObject({actor:{kind:'staff',userId:'current-cookie-user'},now:'2026-09-30T13:00:00Z',today:'2026-09-30'});expect(serverToday).toHaveBeenCalledWith('school-timezone-id');ctx.staffOwner?.assertCurrent();authenticationChanged();expect(()=>ctx.staffOwner?.assertCurrent()).toThrow();
  });
});
