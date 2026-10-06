export function extendImportWorkspaceContract(spec,extend,{object,uuid,label}){
 const s=spec.components.schemas,str={type:'string'},ref=n=>({$ref:'#/components/schemas/'+n}),date={type:'string',format:'date'},arr=(items,maxItems)=>({type:'array',items,maxItems});
 Object.assign(s.ImportJob.properties,{fileName:label,className:{...label,nullable:true},createdByName:{...label,nullable:true}});
 s.ImportJob.properties.source={type:'string',enum:['FILE','PASTE']};
 s.ImportRow.properties.warnings=arr(label,5);
 const fields=['studentCode','fullName','dateOfBirth','gender','guardianName','guardianPhone','guardianEmail','relationshipLabel'];
 s.StudentPasteRow=object(Object.fromEntries(fields.map(k=>[k,{type:'string',maxLength:200}])));delete s.StudentPasteRow.required;
 s.StudentPasteCreate=object({yearId:uuid,classId:uuid,startsOn:date,rows:{type:'array',minItems:1,maxItems:500,items:ref('StudentPasteRow')}});
 extend('createImport','createStudentPasteImport','/schools/{schoolId}/student-paste-imports','student.manage','ImportJob',false,['SC17','CL02'],undefined,'StudentPasteCreate');
 s.ImportWorkspaceKind=object({kind:{type:'string',enum:['students','teachers','classes','timetable']},apiKind:structuredClone(s.ImportCreate.properties.kind),title:label,description:label,enabled:{type:'boolean'},columns:arr(object({key:str,label:str,required:{type:'boolean'}}),50),sampleRows:arr({type:'object',additionalProperties:str},10)});
 s.ImportWorkspace=object({schoolId:uuid,today:date,timezone:label,kinds:arr(ref('ImportWorkspaceKind'),4),years:arr(object({id:uuid,name:label,startsOn:date,endsOn:date,status:{type:'string',enum:['DRAFT','ACTIVE']}}),100),classes:arr(object({id:uuid,yearId:uuid,name:label,code:label,status:{type:'string',enum:['DRAFT','ACTIVE']}}),5000)});
 s.ImportWorkspaceResponse=object({data:ref('ImportWorkspace'),requestId:label});
 extend('getClassOverview','getImportWorkspace','/schools/{schoolId}/import-workspace','import.manage','ImportWorkspace',false,['SC26','SC27','SC28'],[{name:'schoolId',in:'path',required:true,schema:uuid}]);
}
