/** Public projections are isolated from staff and platform schemas. */
export function applyPublicSystemContract(spec,extendOperation){
 const str={type:'string'},nullable=s=>({...s,nullable:true}),object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false}),ref=n=>({$ref:'#/components/schemas/'+n});
 const s=spec.components.schemas;
 s.PublicPlatformContact=object({brandName:{...str,minLength:1,maxLength:160},supportEmail:nullable({...str,maxLength:320}),supportPhone:nullable({...str,maxLength:120}),footerNote:{...str,maxLength:1000}});
 s.PublicSchoolStatus=object({name:{...str,minLength:1,maxLength:300},slug:{...str,minLength:1,maxLength:40},status:{type:'string',enum:['ACTIVE','SUSPENDED','ARCHIVED']},publicEmail:nullable({...str,maxLength:320}),publicPhone:nullable({...str,maxLength:120})});
 for(const name of ['PublicPlatformContact','PublicSchoolStatus'])s[name+'Response']=object({data:ref(name),requestId:str});
 extendOperation('getPublicSchool','getPublicPlatformContact','/public/platform-contact','public','PublicPlatformContact',false,['SY03','SY04','AU10'],[]);
 extendOperation('getPublicSchool','getPublicSchoolStatus','/public/schools/{schoolSlug}/status','public','PublicSchoolStatus',false,['SY06'],[{name:'schoolSlug',in:'path',required:true,schema:{type:'string',maxLength:40,pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'}}]);
 for(const path of ['/public/platform-contact','/public/schools/{schoolSlug}/status'])spec.paths[path].get.description='Fresh minimal public contact and school access status. Draft schools, private IDs, staff fields and operational reasons are excluded.';
}
