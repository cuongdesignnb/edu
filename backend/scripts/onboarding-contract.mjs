export function applyOnboardingContract(spec,extendOperation,operations){
 const str={type:'string'},ref=n=>({$ref:'#/components/schemas/'+n}),object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
 const key={type:'string',enum:['platform-overview','school-overview','teacher-overview','class-homeroom','class-subject','class-staff']},version={type:'integer',enum:[1]},status={type:'string',enum:['skipped','completed']};
 const s=spec.components.schemas;
 s.OnboardingProgress=object({tourKey:key,tourVersion:version,status,updatedAt:{type:'string',format:'date-time'}});
 s.OnboardingPreferences=object({progress:{type:'array',maxItems:6,items:ref('OnboardingProgress')}});
 s.OnboardingUpdate=object({schoolId:{type:'string',format:'uuid',nullable:true},tourVersion:version,status});
 for(const n of ['OnboardingProgress','OnboardingPreferences'])s[n+'Response']=object({data:ref(n),requestId:str});
 extendOperation('getMyProfile','getMyOnboarding','/me/onboarding','session','OnboardingPreferences',false,[],[{name:'schoolId',in:'query',schema:{type:'string',format:'uuid'}}]);
 extendOperation('updateMyProfile','putMyOnboarding','/me/onboarding/{tourKey}','session','OnboardingProgress',false,[],[{name:'tourKey',in:'path',required:true,schema:key},{name:'X-CSRF-Token',in:'header',required:true,schema:str}],'OnboardingUpdate');
 const path=spec.paths['/me/onboarding/{tourKey}'];path.put=path.patch;delete path.patch;
 for(const op of operations.filter(o=>['getMyOnboarding','putMyOnboarding'].includes(o.id))){op.scope='staff';if(op.id==='putMyOnboarding')op.method='PUT';}
 spec.paths['/me/onboarding/{tourKey}'].put.description='Owner-only onboarding preference; current scope authority checked. Atomic idempotent upsert preserves completed status. No business command or parent write.';
}
