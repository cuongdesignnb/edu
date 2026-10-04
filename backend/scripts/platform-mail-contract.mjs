export function applyPlatformMailContract(spec,extendOperation,operations){
 const str={type:'string'},ref=n=>({$ref:'#/components/schemas/'+n}),object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
 const fields={enabled:{type:'boolean'},host:{type:'string',maxLength:253},port:{type:'integer',minimum:1,maximum:65535},security:{type:'string',enum:['STARTTLS','TLS']},username:{type:'string',maxLength:320},fromEmail:{type:'string',maxLength:320},fromName:{type:'string',maxLength:120}};
 spec.components.schemas.PlatformMailSettings=object({...fields,passwordConfigured:{type:'boolean'},version:{type:'integer',minimum:1},updatedAt:{type:'string',format:'date-time'},lastTestedAt:{type:'string',format:'date-time',nullable:true},lastTestStatus:{type:'string',enum:['NOT_TESTED','PENDING','SENT','FAILED','CANCELLED']},lastErrorCode:{type:'string',nullable:true},configurationStatus:{type:'string',enum:['UNCONFIGURED','DISABLED','ENABLED_UNVERIFIED','WORKING','ERROR']}});
 spec.components.schemas.PlatformMailSettingsResponse=object({data:ref('PlatformMailSettings'),requestId:str});
 spec.components.schemas.PlatformMailUpdate=object({...fields,expectedVersion:{type:'integer',minimum:1},password:{type:'string',maxLength:512},clearPassword:{type:'boolean'}});
 spec.components.schemas.PlatformMailUpdate.required=Object.keys(fields).concat('expectedVersion');
 spec.components.schemas.PlatformMailTest=object({expectedVersion:{type:'integer',minimum:1},recipient:{type:'string',format:'email',maxLength:320}});
 extendOperation('getPlatformSettings','getPlatformMailSettings','/platform/settings/mail','platform.mail.manage','PlatformMailSettings',false,['PL11'],[]);
 const headers=[{name:'X-CSRF-Token',in:'header',required:true,schema:str},{name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',minLength:16,maxLength:128}}];
 extendOperation('updatePlatformSettings','updatePlatformMailSettings','/platform/settings/mail','platform.mail.manage','PlatformMailSettings',false,['PL11'],headers,'PlatformMailUpdate');
 extendOperation('updatePlatformSettings','testPlatformMailSettings','/platform/settings/mail/test','platform.mail.manage','PlatformMailSettings',false,['PL11'],headers,'PlatformMailTest');
 for(const [id,path,method]of [['updatePlatformMailSettings','/platform/settings/mail','put'],['testPlatformMailSettings','/platform/settings/mail/test','post']]){
  const p=spec.paths[path];p[method]=p.patch;delete p.patch;operations.find(o=>o.id===id).method=method.toUpperCase();
 }
}
