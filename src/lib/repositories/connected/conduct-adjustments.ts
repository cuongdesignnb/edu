import {http} from '../../api/client';
import type {ApiSchemas} from '../../api/generated';
import type {Ctx} from '../core';
import {RepoError} from '../errors';
import {withStaffAccess} from './common';
import {conductSource,conductReceipt,nativeSnapshot,type ConductSource} from './conduct-workspace';

const invalid=()=>new RepoError('READ_ERROR','Phản hồi điều chỉnh không hợp lệ. Hãy tải lại dữ liệu.');
const uuid=(v:unknown)=>typeof v==='string'&&/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(v);
const text=(v:unknown)=>typeof v==='string';
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<100000000&&Math.abs(v*100-Math.round(v*100))<0.00001;
const stamp=(v:unknown)=>typeof v==='string'&&/T/.test(v)&&Number.isFinite(Date.parse(v));
const nullable=(v:unknown,check:(v:unknown)=>boolean)=>v===null||check(v);
function exact(v:unknown,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))throw invalid();}
function scope(v:{schoolId:string;yearId:string;classId:string},s:string,y:string,c:string){if(v.schoolId!==s||v.yearId!==y||v.classId!==c||![s,y,c].every(uuid))throw invalid();}
function item(v:ApiSchemas['ConductAdjustmentItem'],s:string,y:string,c:string){
 exact(v,['schoolId','yearId','classId','id','version','source','snapshotId','studentId','recordId','kind','newPoints','ruleId','beforeTotal','afterTotal','reason','status','requestedBy','requestedAt','requestedByName','decidedBy','decidedAt','decidedByName','decisionNote','resultSnapshotId','resultSnapshotStatus','studentName','weekIndex','weekId','snapshotVersion','recordLabel']);scope(v,s,y,c);conductSource(v.source);
 if(![v.id,v.snapshotId,v.requestedBy,v.weekId].every(uuid)||!['remove_record','change_points','batch'].includes(v.kind)||!['pending','approved','rejected','published'].includes(v.status)||![v.version,v.weekIndex,v.snapshotVersion].every(n=>Number.isSafeInteger(n)&&n>=1)||![v.reason,v.studentName].every(text)||!stamp(v.requestedAt)||![v.studentId,v.recordId,v.ruleId,v.decidedBy,v.resultSnapshotId].every(n=>nullable(n,uuid))||![v.newPoints,v.beforeTotal,v.afterTotal].every(n=>nullable(n,number))||![v.requestedByName,v.decidedByName,v.decisionNote,v.recordLabel].every(n=>nullable(n,text))||!nullable(v.decidedAt,stamp)||v.source.weekId!==v.weekId||!(v.resultSnapshotStatus===null||['locked','published','superseded','withdrawn'].includes(v.resultSnapshotStatus))||v.status==='published'&&v.resultSnapshotId===null)throw invalid();
 return {...v,recordId:v.recordId??undefined,newPoints:v.newPoints??undefined,ruleId:v.ruleId??undefined,decidedBy:v.decidedBy??undefined,decidedAt:v.decidedAt??undefined,decidedByName:v.decidedByName??undefined,decisionNote:v.decisionNote??undefined,requestedByName:v.requestedByName??undefined,resultSnapshotId:v.resultSnapshotId??undefined,resultSnapshotStatus:v.resultSnapshotStatus??undefined,recordLabel:v.recordLabel??undefined};
}
const params=(s:string,y:string,c:string)=>({schoolId:s,yearId:y,classId:c});
export const connectedConductAdjustmentsRepo=withStaffAccess({
 async adjustments(_ctx:Ctx,s:string,y:string,c:string){const v=(await http('getConductAdjustmentWorkspace',{params:params(s,y,c)})).data;exact(v,['schoolId','yearId','classId','items','canRequest','canApprove','canPublish','me','snapshots','rules']);scope(v,s,y,c);if(!uuid(v.me)||[v.canRequest,v.canApprove,v.canPublish].some(n=>typeof n!=='boolean')||!Array.isArray(v.items)||v.items.length>500||!Array.isArray(v.snapshots)||v.snapshots.length>500||!Array.isArray(v.rules)||v.rules.length>200||new Set(v.items.map(r=>r.id)).size!==v.items.length||new Set(v.snapshots.map(r=>r.id)).size!==v.snapshots.length)throw invalid();return {...v,items:v.items.map(r=>item(r,s,y,c)),snapshots:v.snapshots.map(r=>nativeSnapshot(r,s,y,c))};},
 async requestAdjustment(_ctx:Ctx,s:string,y:string,c:string,input:{source:ConductSource;snapshotId:string;studentId:string;kind:'remove_record'|'change_points'|'add_record';recordId?:string;newPoints?:number;ruleId?:string;reason:string}){conductSource(input.source);return item((await http('requestConductWorkspaceAdjustment',{params:params(s,y,c),body:{...input,recordId:input.recordId??null,newPoints:input.newPoints??null,ruleId:input.ruleId??null}})).data,s,y,c);},
 async decideAdjustment(_ctx:Ctx,s:string,y:string,c:string,id:string,approve:boolean,note:string,displayed:{source:ConductSource;version:number}){conductSource(displayed.source);const row=item((await http('decideConductWorkspaceAdjustment',{params:{...params(s,y,c),adjustmentId:id},body:{source:displayed.source,version:displayed.version,approve,note:note||null}})).data,s,y,c);if(row.id!==id||row.status!==(approve?'approved':'rejected'))throw invalid();return row;},
 async publishAdjustment(_ctx:Ctx,s:string,y:string,c:string,id:string,displayed:{source:ConductSource;version:number}){conductSource(displayed.source);const v=conductReceipt((await http('publishConductWorkspaceAdjustment',{params:{...params(s,y,c),adjustmentId:id},body:{source:displayed.source,version:displayed.version}})).data,s,y,c,displayed.source.weekId);if(!v.snapshot||v.status!=='published')throw invalid();return v.snapshot;},
});
