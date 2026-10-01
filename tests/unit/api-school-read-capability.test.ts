import {describe,expect,it} from 'vitest';
import {hasSchoolApiAction} from '@/lib/api/permissions';
import type {ApiSchemas} from '@/lib/api/generated';

describe('native school read capability',()=>{
  it('requires the same active school and a current School grant, without elevating class scopes or historical grants',()=>{
    const grant:{scopeType:string;validFrom:string;validUntil:string|null;revokedAt:string|null;actions:string[]}={scopeType:'SCHOOL',validFrom:'2026-09-01T00:00:00Z',validUntil:'2026-10-02T00:00:00Z',revokedAt:null,actions:['dictionary.read']};
    const member={schoolId:'school-a',status:'ACTIVE',schoolStatus:'ACTIVE',grants:[grant]};
    const context={serverNow:'2026-10-01T00:00:00Z',memberships:[member]} as unknown as ApiSchemas['Context'];
    expect(hasSchoolApiAction(context,'school-a','dictionary.read')).toBe(true);expect(hasSchoolApiAction(context,'school-b','dictionary.read')).toBe(false);expect(hasSchoolApiAction(context,'school-a','dictionary.manage')).toBe(false);
    for(const patch of [{scopeType:'CLASS'},{scopeType:'SUBJECT'},{validFrom:'2026-10-03T00:00:00Z'},{validUntil:context.serverNow},{revokedAt:'2026-09-30T00:00:00Z'}]){member.grants=[{...grant,...patch}];expect(hasSchoolApiAction(context,'school-a','dictionary.read')).toBe(false);}
    member.grants=[grant];member.status='ENDED';expect(hasSchoolApiAction(context,'school-a','dictionary.read')).toBe(false);member.status='ACTIVE';member.schoolStatus='SUSPENDED';expect(hasSchoolApiAction(context,'school-a','dictionary.read')).toBe(false);
  });
});
