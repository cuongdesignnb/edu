export function extendConductRuleContract(spec,extend,{object,uuid,label,count,timestamp,operations}){
 const s=spec.components.schemas,ref=n=>({$ref:'#/components/schemas/'+n}),nullable=v=>({...v,nullable:true}),version={type:'integer',minimum:1},date={type:'string',format:'date'},number={type:'number',minimum:-99999999.99,maximum:99999999.99},array=(items,max=200)=>({type:'array',items,maxItems:max}),bool={type:'boolean'};
 s.RuleWorkspaceSource=object({id:uuid,version,applicationHash:{type:'string',pattern:'^[a-f0-9]{64}$'}});
 s.RuleWorkspaceRule=object({id:uuid,code:{type:'string',minLength:1,maxLength:80},label:{type:'string',minLength:1,maxLength:200},points:number,category:{type:'string',minLength:1,maxLength:200},icon:{type:'string',minLength:1,maxLength:80},shareWithParent:bool,attendanceLink:{type:'string',enum:['late','unexcused',null],nullable:true},valueMode:{type:'string',enum:['FIXED','MANUAL']},minimumDelta:nullable(number),maximumDelta:nullable(number),reasonRequired:bool,maxOccurrencesPerDay:{type:'integer',minimum:1,nullable:true}});
 s.RuleWorkspaceBand=object({min:number,label:{type:'string',minLength:1,maxLength:200},tone:{type:'string',enum:['neutral','success','info','warning','danger']}});
 s.RuleWorkspaceItem=object({schoolId:uuid,id:uuid,name:label,versionNo:version,status:{type:'string',enum:['draft','published','retired']},effectiveFrom:nullable(date),effectiveTo:nullable(date),baseScore:number,cap:nullable(number),floor:nullable(number),rules:array(ref('RuleWorkspaceRule')),bands:array(ref('RuleWorkspaceBand'),50),entryDeadlineDays:{type:'integer',minimum:0,maximum:365,nullable:true},createdBy:nullable(uuid),createdByName:nullable(label),publishedAt:nullable(timestamp),version,source:ref('RuleWorkspaceSource'),isCurrent:bool,usedBySnapshots:count,canManage:bool,canIssue:bool});
 s.RuleWorkspaceDirectory=object({schoolId:uuid,today:date,items:array(ref('RuleWorkspaceItem'),100),canManage:bool,applicationHash:s.RuleWorkspaceSource.properties.applicationHash});
 s.RuleWorkspaceCreate=object({applicationHash:s.RuleWorkspaceSource.properties.applicationHash});
 s.RuleWorkspaceDetail=object({ruleSet:ref('RuleWorkspaceItem'),previous:{oneOf:[ref('RuleWorkspaceItem'),{type:'object',nullable:true,enum:[null]}]},usedBySnapshots:count,canManage:bool,earliestEffective:date});
 s.RuleWorkspaceSave=object({source:ref('RuleWorkspaceSource'),name:{type:'string',minLength:5,maxLength:200},baseScore:{type:'number',minimum:0,maximum:1000},cap:nullable(number),floor:nullable(number),rules:array(ref('RuleWorkspaceRule')),bands:{...array(ref('RuleWorkspaceBand'),50),minItems:1},effectiveFrom:date,entryDeadlineDays:{type:'integer',minimum:0,maximum:365}});
 s.RuleWorkspaceAction=object({source:ref('RuleWorkspaceSource')});
 s.RuleWorkspaceDiscard=object({id:uuid,discarded:bool});
 for(const n of ['RuleWorkspaceDetail','RuleWorkspaceItem','RuleWorkspaceDiscard'])s[n+'Response']=object({data:ref(n),requestId:label});
 const page=structuredClone(s.AnnouncementDirectoryResponse.properties.page);
 s.RuleWorkspaceDirectoryResponse=object({data:ref('RuleWorkspaceDirectory'),page,requestId:label});
 const root='/schools/{schoolId}/rule-workspace',path=[{name:'schoolId',in:'path',required:true,schema:uuid}],detail=[...path,{name:'ruleSetId',in:'path',required:true,schema:uuid}];
 extend('getClassOverview','getRuleWorkspaceDirectory',root,'rules.read','RuleWorkspaceDirectory',false,['SC29'],[...path,{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100}},{name:'cursor',in:'query',schema:label}]);
 extend('getClassOverview','getRuleWorkspaceDetail',root+'/{ruleSetId}','rules.read','RuleWorkspaceDetail',false,['SC30'],detail);
 extend('createDuty','createRuleWorkspace',root+'/create','rules.manage','RuleWorkspaceItem',false,['SC29','SC30'],path,'RuleWorkspaceCreate');
 for(const [id,action,permission,response,request]of [['copyRuleWorkspace','copy','rules.manage','RuleWorkspaceItem','RuleWorkspaceAction'],['saveRuleWorkspace','save','rules.manage','RuleWorkspaceItem','RuleWorkspaceSave'],['issueRuleWorkspace','issue','rules.issue+rules.apply','RuleWorkspaceItem','RuleWorkspaceAction'],['discardRuleWorkspace','discard','rules.manage','RuleWorkspaceDiscard','RuleWorkspaceAction']]){
  extend('createDuty',id,root+'/{ruleSetId}/'+action,permission,response,false,['SC29','SC30'],detail,request);
  const op=spec.paths[root+'/{ruleSetId}/'+action].post;
  if(id!=='copyRuleWorkspace'){op.responses['200']=op.responses['201'];delete op.responses['201'];}
 }
 for(const paths of Object.values(spec.paths))for(const op of Object.values(paths))if(/^(getRuleWorkspace|createRuleWorkspace|copyRuleWorkspace|saveRuleWorkspace|issueRuleWorkspace|discardRuleWorkspace)/.test(op?.operationId??'')){
  op.tags=['Conduct'];op.description='Native rule editor with persisted metadata, displayed versions, immutable issued rules, tombstoned unused drafts and atomic future class application.';
  Object.assign(operations.find(v=>v.id===op.operationId),{tag:'Conduct',description:op.description});
 }
}
