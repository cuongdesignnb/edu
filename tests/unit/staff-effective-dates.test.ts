import {describe,it,expect} from 'vitest';
import {staffEffectiveDates} from '../../src/features/school-org/staff-effective-dates';
describe('one teacher effective date pair',()=>{
 it('uses school-local midnight for account dates matching the assignment days',()=>{expect(staffEffectiveDates('2026-10-06','2026-11-01','Asia/Ho_Chi_Minh')).toEqual({validFrom:'2026-10-05T17:00:00.000Z',validUntil:'2026-10-31T17:00:00.000Z'});});
 it('keeps the immediate/no-end account defaults without assignment',()=>{expect(staffEffectiveDates('','','Asia/Ho_Chi_Minh')).toEqual({validUntil:null});});
 it('resolves dates using the school zone rather than the browser timezone',()=>{expect(staffEffectiveDates('2026-10-06','','America/New_York').validFrom).toBe('2026-10-06T04:00:00.000Z');});
});
