import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchema,operations,roleTemplates} from '../../dist/common/contract.js';
test('direct school admin commands require the separate platform-only action and strict bodies',()=>{
 for(const role of roleTemplates)assert.equal(role.actions.includes('platform.admins.create_direct'),role.code==='PLATFORM_OPERATOR');
 for(const id of ['createSchoolAdminAccount','assignExistingSchoolAdmin']){const op=operations.find(o=>o.id===id);assert.equal(op.permission,'platform.admins.create_direct');assert.equal(op.auth,'staff');assert.equal(op.method,'POST');}
 const b={displayName:'Existing user',email:'existing@example.invalid'};validateSchema('AssignExistingSchoolAdmin',b);
 assert.throws(()=>validateSchema('AssignExistingSchoolAdmin',{...b,password:'Attempted-overwrite-12345'}));
 assert.throws(()=>validateSchema('DirectSchoolAdminCreate',{...b,password:'too-short',mustChangePassword:true}));
});
test('direct admin response rejects password, hash and token',()=>{
 const id='10000000-0000-4000-8000-000000000001',b={id,userId:id,grantId:id,displayName:'Direct admin',email:'direct@example.invalid',status:'ACTIVE',roleCode:'SCHOOL_ADMIN',scopeType:'SCHOOL',validFrom:new Date().toISOString(),validUntil:null,mustChangePassword:true};
 validateSchema('DirectSchoolAdmin',b,true);
 for(const key of ['password','passwordHash','password_hash','token'])assert.throws(()=>validateSchema('DirectSchoolAdmin',{...b,[key]:'protected'},true));
});
