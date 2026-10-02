import test from 'node:test';
import assert from 'node:assert/strict';
import {publicPlatformContact,publicSchoolStatus} from '../../dist/modules/platform/public-system.js';
test('public system projections omit operational configuration and fail closed for unpublished or invalid source',()=>{
 const school={name:'Trường tổng hợp',slug:'test-school',status:'SUSPENDED',status_reason:'PRIVATE',settings:{private:'PRIVATE'},id:'PRIVATE',public_contact_email:null,public_contact_phone:null};
 assert.deepEqual(publicSchoolStatus(school),{name:school.name,slug:school.slug,status:'SUSPENDED',publicEmail:null,publicPhone:null});
 for(const status of ['DRAFT','UNKNOWN'])assert.throws(()=>publicSchoolStatus({...school,status}),e=>e.status===404);assert.throws(()=>publicSchoolStatus(undefined),e=>e.status===404);
 const row={value:{brandName:'EduManage',supportEmail:'support@example.invalid',publicSupportPhone:null,footerNote:'Thông tin công khai',internalNotes:'PRIVATE',billing:'PRIVATE'}};
 assert.deepEqual(publicPlatformContact(row),{brandName:'EduManage',supportEmail:'support@example.invalid',supportPhone:null,footerNote:'Thông tin công khai'});
 for(const value of [undefined,{value:null},{value:{brandName:''}},{value:{brandName:'Brand',supportEmail:123}}])assert.throws(()=>publicPlatformContact(value),e=>e.status===503);
});
