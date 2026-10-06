import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {permissionCatalog,permissionPresets,FULL_HOMEROOM,STANDARD_SUBJECT} from '../../scripts/teacher-permission-contract.mjs';
const c=JSON.parse(fs.readFileSync(new URL('../../src/generated/contract.json',import.meta.url),'utf8'));
test('catalog derives every non-platform action and automatically includes a future contract action',()=>{
 const rows=permissionCatalog([...c.permissions,'new_domain.read'],{roles:c.roles});
 assert.deepEqual(rows.map(p=>p.action).sort(),[...c.permissions.filter(a=>!a.startsWith('platform.')),'new_domain.read'].sort());
 assert.equal(rows.find(p=>p.action==='new_domain.read').group,'Quyền khác');
 for(const action of ['school.settings','member.manage','role.manage'])assert.deepEqual(rows.find(p=>p.action===action).allowedScopes,['SCHOOL']);
 assert.deepEqual(rows.find(p=>p.action==='student.manage').allowedScopes,['SCHOOL','CLASS']);
 assert.deepEqual(rows.find(p=>p.action==='schedule.read').allowedScopes,['SCHOOL','CLASS','SUBJECT']);
});
test('full and subject presets retain exactly their action set and supported scope',()=>{
 const presets=permissionPresets(c.permissionCatalog);
 assert.deepEqual(presets.find(p=>p.id==='homeroom-full').permissions.map(p=>p.action).sort(),[...FULL_HOMEROOM].sort());
 assert.deepEqual(presets.find(p=>p.id==='subject-standard').permissions.map(p=>p.action).sort(),[...STANDARD_SUBJECT].sort());
 assert.ok(presets.every(p=>p.permissions.every(v=>c.permissionCatalog.find(x=>x.action===v.action).allowedScopes.includes(v.scopes[0]))));
 assert.ok(!presets.find(p=>p.id==='subject-standard').permissions.some(p=>p.action==='student.manage'||p.action==='schedule.manage'));
});
