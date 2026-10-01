import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSchema,validateJsonResponse,operations} from '../../dist/common/contract.js';
const id='6f200000-0000-4000-8000-000000000001',source={id,version:1,applicationHash:'a'.repeat(64)};
const rule={id,code:'QD01',label:'Quy định',points:-0.1,category:'Nề nếp',icon:'alert',shareWithParent:false,attendanceLink:null,valueMode:'FIXED',minimumDelta:null,maximumDelta:null,reasonRequired:true,maxOccurrencesPerDay:null};
const value={schoolId:id,id,name:'Nội quy',versionNo:1,status:'draft',effectiveFrom:null,effectiveTo:null,baseScore:100,cap:null,floor:null,rules:[rule],bands:[{min:0,label:'Đạt',tone:'success'}],entryDeadlineDays:null,createdBy:null,createdByName:null,publishedAt:null,version:1,source,isCurrent:false,usedBySnapshots:0,canManage:true,canIssue:false};
test('native rule schema accepts absent actual metadata and no previous revision without bypassing JSON response validation',()=>{
 const op=operations.find(o=>o.id==='getRuleWorkspaceDetail'),data={ruleSet:value,previous:null,usedBySnapshots:0,canManage:true,earliestEffective:'2026-10-02'};
 validateJsonResponse(op,200,{data,requestId:'native-rule-contract'});assert.throws(()=>validateJsonResponse(op,201,{data,requestId:'native-rule-contract'}),e=>e.code==='RESPONSE_STATUS_CONTRACT_ERROR');
 for(const bad of [{...data,previous:{}},{...data,ruleSet:{...value,staffSnapshot:{}}},{...data,ruleSet:{...value,source:{...source,role:'SCHOOL_ADMIN'}}}])assert.throws(()=>validateJsonResponse(op,200,{data:bad,requestId:'native-rule-contract'}));
});
test('native rule commands require a displayed source and preserve independent manage issue apply rights with exact success statuses',()=>{
 const save={source,name:'Nội quy thật',baseScore:100,cap:null,floor:null,rules:[rule],bands:value.bands,effectiveFrom:'2026-10-09',entryDeadlineDays:7};validateSchema('RuleWorkspaceSave',save);
 for(const bad of [{...save,actorId:id},{...save,source:{...source,version:0}},{...save,rules:[{...rule,attendanceLink:'invented'}]},{...save,entryDeadlineDays:366}])assert.throws(()=>validateSchema('RuleWorkspaceSave',bad));
 for(const operationId of ['createRuleWorkspace','copyRuleWorkspace','saveRuleWorkspace','issueRuleWorkspace','discardRuleWorkspace']){const op=operations.find(o=>o.id===operationId),status=['createRuleWorkspace','copyRuleWorkspace'].includes(operationId)?201:200;assert.ok(op.responses[status].content['application/json'].schema.$ref);assert.equal(op.responses[status===200?201:200],undefined);assert.equal(op.permission,operationId==='issueRuleWorkspace'?'rules.issue+rules.apply':'rules.manage');}
});
