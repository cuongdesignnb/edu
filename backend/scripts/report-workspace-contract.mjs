export function extendReportWorkspaceContract(spec,extend,{object,uuid,label,count}){
 const s=spec.components.schemas,ref=n=>({$ref:'#/components/schemas/'+n}),array=(items,maxItems)=>({type:'array',items,maxItems}),date={type:'string',format:'date'},bool={type:'boolean'};
 s.ReportCatalogItem=object({type:{type:'string',enum:['attendance','conduct','activities','student','class-progress','links']},title:label,description:label});
 s.ReportCatalogWeek=object({id:uuid,index:{type:'integer',minimum:1},startDate:date,endDate:date});
 s.ReportCatalog=object({schoolId:uuid,yearId:{...uuid,nullable:true},yearStart:{...date,nullable:true},yearEnd:{...date,nullable:true},classId:{...uuid,nullable:true},today:date,reports:array(ref('ReportCatalogItem'),6),canExport:bool,hiddenCount:count,role:label,students:array(object({id:uuid,fullName:label,code:label}),5000),weeks:array(ref('ReportCatalogWeek'),110),grades:array(object({id:uuid,name:label}),200)});
 s.ReportCatalogResponse=object({data:ref('ReportCatalog'),requestId:label});
 s.TeacherReportCatalog=object({schoolId:uuid,classes:array(object({classId:uuid,yearId:uuid,className:label,role:label,canExport:bool,reports:array(ref('ReportCatalogItem'),4)}),500)});
 s.TeacherReportCatalogResponse=object({data:ref('TeacherReportCatalog'),requestId:label});
 s.SearchWorkspace=object({schoolId:{...uuid,nullable:true},items:array(object({kind:{type:'string',enum:['school','class','student','teacher']},id:uuid,schoolId:uuid,yearId:{...uuid,nullable:true},classId:{...uuid,nullable:true},title:label,sub:{type:'string',maxLength:1000},schoolWorkspace:bool}),30)});
 s.SearchWorkspaceResponse=object({data:ref('SearchWorkspace'),requestId:label});
 for(const name of ['ExportJob','ExportCreate'])s[name].properties.reportType.enum.push('student-directory');
 s.ExportCreate.properties.studentIds={type:'array',items:uuid,minItems:1,maxItems:5000,uniqueItems:true};
 Object.assign(s.ExportJob.properties,{title:label,rowCount:count,filters:{type:'object',additionalProperties:true},fileName:label});
 const school=[{name:'schoolId',in:'path',required:true,schema:uuid}];
 extend('getSchoolReport','getSchoolReportCatalog','/schools/{schoolId}/report-catalog','report.read','ReportCatalog',false,['SC37'],[...school,{name:'yearId',in:'query',schema:uuid}]);
 extend('getClassReport','getClassReportCatalog','/schools/{schoolId}/academic-years/{yearId}/classes/{classId}/report-catalog','report.read','ReportCatalog',false,['CL25'],[...school,...['yearId','classId'].map(name=>({name,in:'path',required:true,schema:uuid}))]);
 extend('getTeacherOverview','getTeacherReportCatalog','/schools/{schoolId}/me/report-catalog','teacher.self','TeacherReportCatalog',false,['TE06'],school);
 extend('getMyContext','searchWorkspace','/me/search','authenticated','SearchWorkspace',false,['C008'],[{name:'q',in:'query',required:true,schema:{type:'string',minLength:2,maxLength:200}},{name:'schoolId',in:'query',schema:uuid}]);
}
