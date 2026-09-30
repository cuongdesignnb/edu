import {afterEach,describe,expect,it} from 'vitest';
import {authenticationChanged,authorizationChanged} from '@/lib/api/client';
import {withStaffAccess} from '@/lib/repositories/connected/common';
import {RepoError} from '@/lib/repositories/errors';

afterEach(()=>authenticationChanged());

describe('staff composite ownership',()=>{
  it('drops already read private data when later components use a changed scope',async()=>{
    const firstRead={privateName:'Synthetic prior-scope name'};
    const gate=Promise.withResolvers<void>();
    const repo=withStaffAccess({async composite(){const prior=await Promise.resolve(firstRead);await gate.promise;return {prior,newScope:true};}});
    const pending=repo.composite();await Promise.resolve();authorizationChanged();gate.resolve();
    await expect(pending).rejects.toMatchObject({code:'FORBIDDEN',details:{scopeChanged:true}});
  });
  it('does not deliver an old identity field error to the replacement session',async()=>{
    const gate=Promise.withResolvers<void>();
    const repo=withStaffAccess({async save(){await gate.promise;throw new RepoError('VALIDATION','Old form',{fieldErrors:{name:'Prior identity detail'}});}});
    const pending=repo.save();authenticationChanged();gate.resolve();
    await expect(pending).rejects.toMatchObject({code:'NO_SESSION'});
  });
  it('retains actual results and field errors while identity and scope stay current',async()=>{
    const repo=withStaffAccess({async read(){return {count:null,version:7};},async save(){throw new RepoError('VALIDATION','Form',{fieldErrors:{name:'Required'}});}});
    expect(await repo.read()).toEqual({count:null,version:7});await expect(repo.save()).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{name:'Required'}});
  });
});
