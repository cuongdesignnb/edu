export function applyDirectSchoolAdminContract(spec,extendOperation){
 const str={type:'string'},uuid={type:'string',format:'uuid'},date={type:'string',format:'date-time'},ref=n=>({$ref:'#/components/schemas/'+n});
 const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
 // Optional for backward-compatible context fixtures; native identity always returns the flag.
 spec.components.schemas.User.properties.mustChangePassword={type:'boolean'};
 const fields={displayName:{type:'string',minLength:3,maxLength:200},email:{type:'string',format:'email',maxLength:320},validFrom:{...date,nullable:true},validUntil:{...date,nullable:true}};
 spec.components.schemas.DirectSchoolAdminCreate=object({...fields,password:{type:'string',minLength:12,maxLength:256},mustChangePassword:{type:'boolean'}});
 spec.components.schemas.AssignExistingSchoolAdmin=object(fields);
 for(const name of ['DirectSchoolAdminCreate','AssignExistingSchoolAdmin'])spec.components.schemas[name].required=spec.components.schemas[name].required.filter(k=>!['validFrom','validUntil'].includes(k));
 spec.components.schemas.DirectSchoolAdmin=object({id:uuid,userId:uuid,displayName:str,email:str,status:{type:'string',enum:['ACTIVE']},grantId:uuid,roleCode:{type:'string',enum:['SCHOOL_ADMIN']},scopeType:{type:'string',enum:['SCHOOL']},validFrom:date,validUntil:{...date,nullable:true},mustChangePassword:{type:'boolean'}});
 spec.components.schemas.DirectSchoolAdminResponse=object({data:ref('DirectSchoolAdmin'),requestId:str});
 const params=[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'X-CSRF-Token',in:'header',required:true,schema:str},{name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',minLength:16,maxLength:128}}];
 extendOperation('inviteSchoolAdmin','createSchoolAdminAccount','/platform/schools/{schoolId}/admins','platform.admins.create_direct','DirectSchoolAdmin',false,['PL05'],params,'DirectSchoolAdminCreate');
 extendOperation('inviteSchoolAdmin','assignExistingSchoolAdmin','/platform/schools/{schoolId}/admins/assign-existing','platform.admins.create_direct','DirectSchoolAdmin',false,['PL05'],params,'AssignExistingSchoolAdmin');
}
