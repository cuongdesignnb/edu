/** Public school identity and immutable PUBLIC announcement projections only. */
export function extendPublicAnnouncementContract(spec,extend,{object,uuid,label,count,timestamp,operations}){
 const schemas=spec.components.schemas,nullable=s=>({...s,nullable:true}),ref=n=>({$ref:'#/components/schemas/'+n}),array=(items,maxItems)=>({type:'array',items,maxItems});
 schemas.PublicSchoolCard=object({name:label,shortName:nullable(label),slug:label,address:nullable(label),publicPhone:nullable(label),publicEmail:nullable(label),website:nullable({type:'string',maxLength:2048}),motto:{type:'string',maxLength:300},publicIntro:{type:'string',maxLength:4000},accentColor:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},status:{type:'string',enum:['active','suspended','archived']},level:nullable(label)});
 schemas.PublicNewsSource=object({rootId:uuid,publicationId:uuid});
 schemas.PublicNewsSummary=object({id:uuid,title:label,summary:{type:'string',maxLength:2000},publishedAt:timestamp});
 schemas.PublicSchoolWorkspace=object({school:ref('PublicSchoolCard'),news:array(ref('PublicNewsSummary'),100)});
 schemas.PublicSchoolWorkspaceResponse=object({data:ref('PublicSchoolWorkspace'),page:structuredClone(schemas.AnnouncementDirectoryResponse.properties.page),requestId:label});
 schemas.PublicNewsWorkspace=object({school:object({name:label,slug:label}),news:object({...schemas.PublicNewsSummary.properties,body:array(object({type:{type:'string',enum:['p','h','li']},text:{type:'string',minLength:1,maxLength:50000}}),500),source:ref('PublicNewsSource'),attachments:array(object({id:uuid,name:label,mime:label,size:count}),100)})});
 schemas.PublicNewsWorkspaceResponse=object({data:ref('PublicNewsWorkspace'),requestId:label});
 const root='/public/schools/{schoolSlug}',slug={name:'schoolSlug',in:'path',required:true,schema:label},ann={name:'announcementId',in:'path',required:true,schema:uuid};
 extend('getPublicSchool','getPublicSchoolWorkspace',root+'/workspace','public','PublicSchoolWorkspace',false,['SY01'],[slug,{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100}},{name:'cursor',in:'query',schema:label}]);
 extend('getPublicSchool','getPublicNewsWorkspace',root+'/announcements/{announcementId}/workspace','public','PublicNewsWorkspace',false,['SY02'],[slug,ann]);
 extend('downloadFile','downloadPublicNewsFile',root+'/announcements/{announcementId}/revisions/{publicationId}/files/{fileId}','public','File',false,['SY02'],[slug,ann,...['publicationId','fileId'].map(name=>({name,in:'path',required:true,schema:uuid}))]);
 for(const paths of Object.values(spec.paths))for(const op of Object.values(paths))if(['getPublicSchoolWorkspace','getPublicNewsWorkspace','downloadPublicNewsFile'].includes(op?.operationId)){
  op.security=[];op.tags=['Public'];op['x-scope']='none';op.description='Public identity and current immutable PUBLIC publications only. No pupil lookup, recipient identities, internal notes or upload-directory exposure. File streams require the exact live publication and current safe document association.';
  const registered=operations.find(o=>o.id===op.operationId);registered.auth='none';registered.scope='none';registered.tag='Public';registered.description=op.description;
 }
}
