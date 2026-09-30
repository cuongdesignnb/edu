import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema,operations } from '../../dist/common/contract.js';
test('all operation IDs are unique',()=>assert.equal(new Set(operations.map(op=>op.id)).size,264));
test('login rejects spoofed role, school and unknown fields',()=>{
  for(const field of ['actorId','role','schoolId'])assert.throws(()=>validateSchema('LoginRequest',{
    email:'test@example.invalid',password:'anything',[field]:'spoofed',
  }),error=>error.status===422);
});
test('private user DTO rejects secrets and unknown properties',()=>{
  const value={id:'da72b470-4b45-4f5f-b89d-179c0cdf454a',version:1,createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString(),displayName:'Test',email:'test@example.invalid',status:'ACTIVE'};
  validateSchema('User',value,true);
  assert.throws(()=>validateSchema('User',{...value,passwordHash:'secret'},true),error=>error.code==='RESPONSE_CONTRACT_ERROR');
});
