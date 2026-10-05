import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {schemas,operations}=JSON.parse(fs.readFileSync(new URL('../../src/generated/contract.json',import.meta.url),'utf8'));
test('student evidence history allows a non-staff actor without relaxing native UUID identity fields',()=>{
 assert.equal(schemas.ActivityWorkspaceHistory.properties.actorId.nullable,true);
 for(const name of ['ActivityWorkspaceHistory','ActivityWorkspaceItem','ActivityWorkspaceStudent','ActivityWorkspaceEvidence'])assert.notEqual(schemas[name].properties.id.nullable,true);
 assert.notEqual(schemas.OfficerAssign.properties.enrollmentId.nullable,true);
 const operation=operations.find(o=>o.id==='uploadStudentEvidence');assert.equal(operation.auth,'evidence');
});
test('the complete class navigation has its native destinations in the response contract',()=>{
 const tabs=schemas.ClassWorkspaceHeader.properties.tabs;
 for(const key of ['notebook','periodic','duties','seating','public-portal','notebook-settings']){assert.ok(tabs.items.properties.key.enum.includes(key));assert.ok(tabs.items.properties.path.enum.includes('/'+key));}
});
