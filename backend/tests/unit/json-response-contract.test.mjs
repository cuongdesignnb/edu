import test from 'node:test';
import assert from 'node:assert/strict';
import {operations,validateJsonResponse} from '../../dist/common/contract.js';
test('JSON acknowledgements validate their actual status and never send undeclared or private payloads',()=>{
 const op=operations.find(o=>o.id==='getTeacherAnnouncementFeed'),id='6e000000-0000-4000-8000-000000000001',response={data:{schoolId:id,memberId:id,items:[]},page:{limit:100,hasMore:false,nextCursor:null,total:0},requestId:'response-status-unit'};
 assert.doesNotThrow(()=>validateJsonResponse(op,200,response));
 for(const status of [201,202,204])assert.throws(()=>validateJsonResponse(op,status,response),e=>e.status===500&&e.code==='RESPONSE_STATUS_CONTRACT_ERROR');
 assert.throws(()=>validateJsonResponse(op,200,{...response,data:{...response.data,internalNote:'SECRET'}}),e=>e.status===500&&e.code==='RESPONSE_CONTRACT_ERROR');
});
