import {http} from '../../api/client';
import type {ApiSchemas} from '../../api/generated';
import type {Ctx} from '../core';
import {RepoError} from '../errors';
import {withStaffAccess,displayedVersion,formResult} from './common';

type Native=ApiSchemas['RuleWorkspaceItem'];
export type RuleSource=ApiSchemas['RuleWorkspaceSource'];
const invalid=()=>new RepoError('READ_ERROR','Phản hồi nội quy không hợp lệ. Hãy tải lại dữ liệu.');
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(v);
const text=(v:unknown):v is string=>typeof v==='string';
const integer=(v:unknown,min=0)=>Number.isSafeInteger(v)&&Number(v)>=min;
const decimal=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<100000000&&Math.abs(v*100-Math.round(v*100))<0.00001;
const date=(v:unknown)=>v===null||text(v)&&/^\d{4}-\d{2}-\d{2}$/.test(v);
function exact(v:unknown,keys:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||Object.keys(v).some(k=>!keys.includes(k)))throw invalid();}
export function ruleSource(v:RuleSource){exact(v,['id','version','applicationHash']);if(!uuid(v.id)||!integer(v.version,1)||!text(v.applicationHash)||!/^[a-f0-9]{64}$/.test(v.applicationHash))throw invalid();return v;}
export function ruleItem(v:Native,s:string){
 exact(v,['schoolId','id','name','versionNo','status','effectiveFrom','effectiveTo','baseScore','cap','floor','rules','bands','entryDeadlineDays','createdBy','createdByName','publishedAt','version','source','isCurrent','usedBySnapshots','canManage','canIssue']);ruleSource(v.source);
 if(v.schoolId!==s||!uuid(s)||v.id!==v.source.id||v.version!==v.source.version||!integer(v.versionNo,1)||!text(v.name)||!['draft','published','retired'].includes(v.status)||!date(v.effectiveFrom)||!date(v.effectiveTo)||!decimal(v.baseScore)||![v.cap,v.floor].every(n=>n===null||decimal(n))||!(v.entryDeadlineDays===null||integer(v.entryDeadlineDays)&&v.entryDeadlineDays<=365)||!(v.createdBy===null||uuid(v.createdBy))||!(v.createdByName===null||text(v.createdByName))||!(v.publishedAt===null||text(v.publishedAt)&&Number.isFinite(Date.parse(v.publishedAt)))||!integer(v.usedBySnapshots)||[v.isCurrent,v.canManage,v.canIssue].some(b=>typeof b!=='boolean')||v.status!=='draft'&&(v.canManage||v.canIssue)||!Array.isArray(v.rules)||v.rules.length>200||!Array.isArray(v.bands)||v.bands.length>50)throw invalid();
 for(const r of v.rules){exact(r,['id','code','label','points','category','icon','shareWithParent','attendanceLink','valueMode','minimumDelta','maximumDelta','reasonRequired','maxOccurrencesPerDay']);if(!uuid(r.id)||![r.code,r.label,r.category,r.icon].every(x=>text(x)&&x.length>0)||!decimal(r.points)||typeof r.shareWithParent!=='boolean'||typeof r.reasonRequired!=='boolean'||!['FIXED','MANUAL'].includes(r.valueMode)||!(r.attendanceLink===null||['late','unexcused'].includes(r.attendanceLink))||![r.minimumDelta,r.maximumDelta].every(x=>x===null||decimal(x))||!(r.maxOccurrencesPerDay===null||integer(r.maxOccurrencesPerDay,1)))throw invalid();}
 for(const b of v.bands){exact(b,['min','label','tone']);if(!decimal(b.min)||!text(b.label)||!b.label||!['neutral','success','info','warning','danger'].includes(b.tone))throw invalid();}
 if(new Set(v.rules.map(r=>r.id)).size!==v.rules.length||new Set(v.rules.map(r=>r.code)).size!==v.rules.length||new Set(v.bands.map(b=>b.min)).size!==v.bands.length)throw invalid();
 return {...v,effectiveFrom:v.effectiveFrom??undefined,effectiveTo:v.effectiveTo??undefined,cap:v.cap??undefined,floor:v.floor??undefined,entryDeadlineDays:v.entryDeadlineDays??undefined,createdBy:v.createdBy??undefined,createdByName:v.createdByName??undefined,publishedAt:v.publishedAt??undefined,rules:v.rules.map(r=>({...r,attendanceLink:r.attendanceLink??undefined}))};
}
export type RuleItem=ReturnType<typeof ruleItem>;
export type RuleEditorRule=RuleItem['rules'][number];
export interface RuleSave {source:RuleSource;name:string;baseScore:number;cap?:number;floor?:number;rules:RuleEditorRule[];bands:RuleItem['bands'];effectiveFrom:string;entryDeadlineDays:number;version:number}
export const connectedConductRepo=withStaffAccess({
 async ruleSets(_ctx:Ctx,s:string){const items:RuleItem[]=[],seen=new Set<string>(),cursors=new Set<string>();let cursor:string|undefined,canManage=false;
  for(let n=0;n<100;n++){const result=await http('getRuleWorkspaceDirectory',{params:{schoolId:s},query:{limit:100,cursor}}),v=result.data,p=result.page;exact(v,['schoolId','today','items','canManage','applicationHash']);if(v.schoolId!==s||!date(v.today)||v.today===null||!text(v.applicationHash)||!/^[a-f0-9]{64}$/.test(v.applicationHash)||typeof v.canManage!=='boolean'||!Array.isArray(v.items)||!p||!integer(p.limit,1)||p.limit>100||v.items.length>p.limit||typeof p.hasMore!=='boolean'||!(p.nextCursor===null||text(p.nextCursor))||p.hasMore!==(p.nextCursor!==null))throw invalid();canManage=v.canManage;
   for(const item of v.items){const row=ruleItem(item,s);if(seen.has(row.id))throw invalid();seen.add(row.id);items.push(row);}if(!p.hasMore)return {items:items.sort((a,b)=>b.versionNo-a.versionNo),canManage,applicationHash:v.applicationHash};if(!p.nextCursor||cursors.has(p.nextCursor))throw invalid();cursors.add(p.nextCursor);cursor=p.nextCursor;
  }throw invalid();
 },
 async createRuleSetDraft(_ctx:Ctx,s:string,applicationHash:string){if(!/^[a-f0-9]{64}$/.test(applicationHash))throw invalid();return ruleItem((await http('createRuleWorkspace',{params:{schoolId:s},body:{applicationHash}})).data,s);},
 async ruleSet(_ctx:Ctx,s:string,id:string){const v=(await http('getRuleWorkspaceDetail',{params:{schoolId:s,ruleSetId:id}})).data;exact(v,['ruleSet','previous','usedBySnapshots','canManage','earliestEffective']);const ruleSet=ruleItem(v.ruleSet,s),previous=v.previous===null?null:ruleItem(v.previous,s);if(ruleSet.id!==id||!integer(v.usedBySnapshots)||v.usedBySnapshots!==ruleSet.usedBySnapshots||v.canManage!==ruleSet.canManage||!date(v.earliestEffective)||v.earliestEffective===null||previous&&previous.versionNo>=ruleSet.versionNo)throw invalid();return {...v,ruleSet,previous};},
 async newRuleSetVersion(_ctx:Ctx,s:string,id:string,source:RuleSource){ruleSource(source);if(source.id!==id)throw invalid();const v=ruleItem((await http('copyRuleWorkspace',{params:{schoolId:s,ruleSetId:id},body:{source}})).data,s);if(v.id===id||v.status!=='draft')throw invalid();return v;},
 async saveRuleSetDraft(_ctx:Ctx,s:string,id:string,patch:RuleSave){ruleSource(patch.source);if(patch.source.id!==id||displayedVersion(patch.version)!==patch.source.version)throw invalid();const body={source:patch.source,name:patch.name,baseScore:patch.baseScore,cap:patch.cap??null,floor:patch.floor??null,rules:patch.rules.map(r=>({...r,attendanceLink:r.attendanceLink??null})),bands:patch.bands,effectiveFrom:patch.effectiveFrom,entryDeadlineDays:patch.entryDeadlineDays};const v=ruleItem((await formResult(http('saveRuleWorkspace',{params:{schoolId:s,ruleSetId:id},body}),{})).data,s);if(v.id!==id||v.status!=='draft')throw invalid();return v;},
 async publishRuleSet(_ctx:Ctx,s:string,id:string,source:RuleSource){ruleSource(source);if(source.id!==id)throw invalid();const v=ruleItem((await http('issueRuleWorkspace',{params:{schoolId:s,ruleSetId:id},body:{source}})).data,s);if(v.id!==id||v.status==='draft')throw invalid();return v;},
 async deleteRuleSetDraft(_ctx:Ctx,s:string,id:string,source:RuleSource){ruleSource(source);if(source.id!==id)throw invalid();const v=(await http('discardRuleWorkspace',{params:{schoolId:s,ruleSetId:id},body:{source}})).data;exact(v,['id','discarded']);if(v.id!==id||v.discarded!==true)throw invalid();return true;},
});
/** Illustration of the user's draft. Persisted scores and classifications come from PostgreSQL only. */
export function conductIllustration(set:{baseScore:number;cap?:number;floor?:number;bands:{min:number;label:string}[]},deltas:number[]){
 if(!decimal(set.baseScore)||![set.cap,set.floor].every(v=>v===undefined||decimal(v))||deltas.length>2000||!deltas.every(decimal)||!set.bands.every(b=>decimal(b.min)&&text(b.label)))throw new RepoError('VALIDATION','Điểm mẫu phải có tối đa hai chữ số thập phân.');
 const raw=(Math.round(set.baseScore*100)+deltas.reduce((sum,v)=>sum+Math.round(v*100),0))/100,total=Math.min(set.cap??Infinity,Math.max(set.floor??-Infinity,raw));
 return {raw,total,grade:[...set.bands].sort((a,b)=>b.min-a.min).find(b=>total>=b.min)?.label??'Chưa xếp loại'};
}
export const connectedConductStatics={simulate:conductIllustration};
