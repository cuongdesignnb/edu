import { Injectable } from '@nestjs/common';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { parse } from 'csv-parse/sync';
import { Database,one,type Transaction,type Row } from '../../database/database';
import { dto,getResource,listResource,resource,type Resource } from '../../database/resources';
import { Permissions } from '../../common/permissions';
import { Commands,audit,canonical } from '../../common/commands';
import { Problem,validation } from '../../common/problem';
import { hashToken } from '../../common/security';
import { FilesService } from '../files/files.service';
import { objectPath,digestFile } from '../files/storage';
import { readXlsx } from '../files/xlsx';
import { readImportContext } from './import-context';
import {importWorkspace} from './import-workspace';
import {createStudentPaste,isStudentPaste} from './student-paste';
import type { RequestContext,Result,Handler } from '../../api.router';
const importResource:Resource={table:'app.import_jobs',fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',
  kind:'kind',fileId:'file_id',status:'status',previewHash:'preview_hash',summary:'summary',yearId:'year_id',classId:'class_id',columns:'source_columns'},
  writeFields:[],search:[],filters:{kind:'kind',status:'status'}};
const rowResource:Resource={table:'app.import_rows',fields:{id:'id',rowNumber:'row_number',status:'status',errors:'errors',values:'source_data',plan:'normalized_data'},writeFields:[],search:[],filters:{status:'status'}};
const importReadResource:Resource={...importResource,table:"(SELECT j.*,CASE WHEN j.kind='STUDENTS' AND j.column_mapping->>'source'='PASTE' THEN 'PASTE' ELSE 'FILE' END AS import_source,f.original_name AS file_name,cl.name AS class_name,m.work_display_name AS requester_name FROM app.import_jobs j JOIN app.files f ON f.school_id=j.school_id AND f.id=j.file_id LEFT JOIN app.classes cl ON cl.school_id=j.school_id AND cl.id=j.class_id LEFT JOIN app.memberships m ON m.school_id=j.school_id AND m.user_id=j.requested_by)",fields:{...importResource.fields,source:'import_source',fileName:'file_name',className:'class_name',createdByName:'requester_name'}};
const fieldSets:Record<string,readonly string[]>={
  STUDENTS:['studentCode','fullName','dateOfBirth','gender','preferredName','classCode','startsOn','guardianName','guardianPhone','guardianEmail','relationshipLabel'],
  CLASSES:['code','name','gradeCode','capacity'],
  STAFF:['email','staffCode','workDisplayName','workPhone','department','roleCode','classCode','subjectCode','startsOn','endsOn','reason'],
  TIMETABLE:['weekday','slot','startsAt','endsAt','subjectCode','staffCode','roomCode'],
};
const actions:Record<string,string>={STUDENTS:'student.manage',CLASSES:'class.manage',STAFF:'member.manage',TIMETABLE:'schedule.manage'};
export const emptySummary=()=>({added:0,updated:0,skipped:0,invalid:0,processed:0});
export function importDto(row:Row){const value:Record<string,unknown>={...dto(importResource,row),source:row.import_source??(isStudentPaste(row)?'PASTE':'FILE')};if(value.previewHash===null)delete value.previewHash;
  if(!value.summary||Object.keys(value.summary as object).length===0)value.summary=emptySummary();return value;}
export function csvCell(value:unknown){let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';}
@Injectable()
export class ImportsService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly files:FilesService){}
  handlers():Record<string,Handler>{return Object.fromEntries(['createStudentPasteImport','getImportWorkspace','listImports','createImport','getImport','validateImport','listImportRows','commitImport','cancelImport','downloadImportErrors']
    .map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  async authorize(tx:Transaction,schoolId:string,userId:string,kind:string,classId?:string,paste=false){
    const user=await one(tx,"SELECT id FROM identity.users WHERE id=$1 AND status='ACTIVE'",[userId]);if(!user)throw new Problem(403,'REQUESTER_REVOKED');
    if(!paste)await this.policy.require(tx,{userId},'import.manage',{schoolId});
    if(kind)await this.policy.require(tx,{userId},actions[kind]!,{schoolId,classId:kind==='STUDENTS'||kind==='TIMETABLE'?classId:undefined});
  }
  private async job(tx:Transaction,schoolId:string,id:string,lock=false){
    const row=await one<Row>(tx,`SELECT * FROM app.import_jobs WHERE school_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[schoolId,id]);
    if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');return row;
  }
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,op=c.operation.id;
    if(op==='getImportWorkspace')return this.db.transaction(async tx=>({data:await importWorkspace(tx,this.policy,c)}),{schoolId});
    const authorize=async(tx:Transaction)=>{
      if(op==='createStudentPasteImport')return this.authorize(tx,schoolId,c.principal!.userId,'STUDENTS',String(c.body.classId),true);
      if(c.principal!.support&&['listImports','getImport'].includes(op))return this.policy.require(tx,c.principal!,'import.read',{schoolId});
      if(op==='listImports')return this.authorize(tx,schoolId,c.principal!.userId,'');
      const row=op==='createImport'?c.body:await this.job(tx,schoolId,c.params.importId!);
      const paste=isStudentPaste(row);
      if(paste&&row.requested_by!==c.principal!.userId)throw new Problem(403,'FORBIDDEN');
      await this.authorize(tx,schoolId,c.principal!.userId,String(row.kind),(row.class_id??row.classId) as string|undefined,paste);
    };
    const work=async(tx:Transaction):Promise<Result>=>{
      if(op==='createStudentPasteImport'){const row=await createStudentPaste(tx,this.policy,c);await this.enqueue(tx,schoolId,'VALIDATE_IMPORT',row,{});await audit(tx,c,'import',String(row.id),{source:'PASTE',status:'VALIDATING',rows:(c.body.rows as unknown[]).length});return {data:importDto(row),status:201};}
      if(op==='listImports'){
        const result=await listResource(tx,importReadResource,schoolId,c.query,undefined,c.principal!.userId);
        result.data=result.data.map(row=>({...row,summary:Object.keys(row.summary as object).length?row.summary:emptySummary()}));
        for(const row of result.data)if(row.previewHash===null)delete row.previewHash;return result;
      }
      if(op==='createImport'){
        const year=await getResource(tx,resource('year'),schoolId,String(c.body.yearId));if(year.status==='ARCHIVED')throw new Problem(409,'YEAR_ARCHIVED');
        if(c.body.classId){const cls=await getResource(tx,resource('class'),schoolId,String(c.body.classId));if(cls.year_id!==year.id||cls.status==='ARCHIVED')validation('classId','Lớp không thuộc năm đang nhập');}
        if(c.body.kind==='TIMETABLE'&&!c.body.classId)validation('classId','Nhập thời khóa biểu cần lớp cụ thể');
        const file=await this.files.authorizeFile(tx,schoolId,String(c.body.fileId),c.principal!.userId,'file.read');
        if(file.status!=='READY'||file.purpose!=='IMPORT'||!['text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(String(file.content_type)))throw new Problem(409,'FILE_UNAVAILABLE');
        const row=await one<Row>(tx,`INSERT INTO app.import_jobs(school_id,kind,file_id,requested_by,year_id,class_id,summary)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[schoolId,c.body.kind,file.id,c.principal!.userId,year.id,c.body.classId??null,emptySummary()]);
        await this.enqueue(tx,schoolId,'PARSE_IMPORT',row!,{});await audit(tx,c,'import',String(row!.id),{status:'UPLOADED'});return {data:importDto(row!),status:201};
      }
      if(op==='getImport'){const row=await getResource(tx,importReadResource,schoolId,c.params.importId!);return {data:{...importDto(row),fileName:row.file_name,className:row.class_name??null,createdByName:row.requester_name??null}};}
      if(op==='listImportRows'){
        await this.job(tx,schoolId,c.params.importId!);
        const result=await listResource(tx,rowResource,schoolId,{...c.query,sort:'rowNumber'},
          {sql:'t.import_id=$1',values:[c.params.importId]},c.principal!.userId);
        for(const row of result.data){const plan=row.plan as {decision?:string;id?:string};
          if(plan.decision)row.decision=plan.decision;if(plan.id)row.matchedId=plan.id;if((plan as {warnings?:string[]}).warnings)row.warnings=(plan as {warnings:string[]}).warnings;delete row.plan;delete row.id;}return result;
      }
      if(op==='downloadImportErrors'){
        const rows=(await tx.query<{row_number:number;errors:{field:string;message:string}[];source_data:Record<string,string>}>(
          "SELECT row_number,errors,source_data FROM app.import_rows WHERE school_id=$1 AND import_id=$2 AND status='INVALID' ORDER BY row_number LIMIT 5000",[schoolId,c.params.importId])).rows;
        const columns=[...new Set(rows.flatMap(row=>Object.keys(row.source_data)))];
        const lines=[['row','errors',...columns].map(csvCell).join(',')];
        for(const row of rows)lines.push([row.row_number,row.errors.map(e=>`${e.field}: ${e.message}`).join('; '),...columns.map(key=>row.source_data[key])].map(csvCell).join(','));
        const bytes=Buffer.from('\uFEFF'+lines.join('\r\n')+'\r\n');return {data:null,binary:{stream:Readable.from(bytes),contentType:'text/csv; charset=utf-8',filename:'import-errors.csv',byteSize:bytes.length}};
      }
      await tx.query('SELECT app.lock_school()');
      const row=await this.job(tx,schoolId,c.params.importId!,true);
      if(row.version!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row.version));
      if(op==='cancelImport'){
        if(['COMPLETED','CANCELLED'].includes(String(row.status)))throw new Problem(409,'INVALID_STATE');
        const saved=await one<Row>(tx,"UPDATE app.import_jobs SET status='CANCELLED' WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,row.id]);
        await tx.query("UPDATE app.outbox_events SET status='CANCELLED',lease_until=NULL,lease_owner=NULL WHERE school_id=$1 AND payload->>'importId'=$2 AND status IN ('PENDING','LEASED','FAILED')",[schoolId,String(row.id)]);
        await audit(tx,c,'import',String(row.id),{status:'CANCELLED',summary:row.summary});return {data:importDto(saved!)};
      }
      if(op==='validateImport'){
        if(isStudentPaste(row)&&c.body.mode!=='ADD_ONLY')validation('mode','Dán danh sách chỉ tạo hồ sơ mới, không ghi đè');
        if(!row.parsed_at)throw new Problem(409,'IMPORT_PARSE_PENDING');
        if(!['UPLOADED','READY','FAILED'].includes(String(row.status)))throw new Problem(409,'INVALID_STATE');
        if(Number((row.summary as Record<string,number>).processed)>0)throw new Problem(409,'IMPORT_ALREADY_PARTIAL');
        const mapping=c.body.mapping as {sourceColumn:string;targetField:string}[];
        if(new Set(mapping.map(m=>m.sourceColumn)).size!==mapping.length||new Set(mapping.map(m=>m.targetField)).size!==mapping.length)validation('mapping','Cột ghép bị trùng');
        for(const entry of mapping)if(!(row.source_columns as string[]).includes(entry.sourceColumn)||!fieldSets[String(row.kind)]!.includes(entry.targetField))validation('mapping','Cột nguồn/đích không hợp lệ');
        if(mapping.some(entry=>entry.targetField.startsWith('guardian')||entry.targetField==='relationshipLabel'))await this.policy.require(tx,c.principal!,'guardian.manage',{schoolId,classId:row.class_id as string|undefined});
        const saved=await one<Row>(tx,"UPDATE app.import_jobs SET status='VALIDATING',column_mapping=$3,preview_hash=NULL,summary=$4 WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,row.id,{...row.column_mapping as object,mapping,mode:c.body.mode},emptySummary()]);
        await this.enqueue(tx,schoolId,'VALIDATE_IMPORT',saved!,{});await audit(tx,c,'import',String(row.id),{status:'VALIDATING'});return {data:importDto(saved!),status:202};
      }
      if(row.status!=='READY'||row.preview_hash!==c.body.previewHash)throw new Problem(409,'STALE_PREVIEW');
      if(canonical((row.column_mapping as Record<string,unknown>).preview)!==canonical(await readImportContext(tx,schoolId,String(row.kind))))throw new Problem(409,'STALE_PREVIEW');
      if(Number((row.summary as Record<string,number>).invalid)>0&&!isStudentPaste(row)||isStudentPaste(row)&&Number((row.summary as Record<string,number>).added)<1)throw new Problem(422,'IMPORT_HAS_ERRORS');
      const saved=await one<Row>(tx,"UPDATE app.import_jobs SET status='APPLYING' WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,row.id]);
      await this.enqueue(tx,schoolId,'COMMIT_IMPORT',saved!,{previewHash:c.body.previewHash});await audit(tx,c,'import',String(row.id),{status:'APPLYING'});return {data:importDto(saved!),status:202};
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId});
    return this.commands.execute(c,authorize,work);
  }
  private async enqueue(tx:Transaction,schoolId:string,kind:string,job:Row,extra:Record<string,unknown>){
    await tx.query(`INSERT INTO app.outbox_events(school_id,kind,dedupe_key,payload) VALUES($1,$2,$3,$4)`,
      [schoolId,kind,`import:${job.id}:${kind}:${job.version}`,{importId:job.id,userId:job.requested_by,...extra}]);
  }
  async parseFile(schoolId:string,importId:string,guard:(tx:Transaction)=>Promise<void>){
    const info=await this.db.transaction(async tx=>{
      await guard(tx);const job=await this.job(tx,schoolId,importId);if(job.status==='CANCELLED'||job.parsed_at)return null;
      await this.authorize(tx,schoolId,String(job.requested_by),String(job.kind),job.class_id as string|undefined);
      return {job,file:await this.files.authorizeFile(tx,schoolId,String(job.file_id),String(job.requested_by),'file.read')};
    },{schoolId});if(!info)return;
    const filename=objectPath(schoolId,String(info.file.object_key));
    if(info.file.status!=='READY'||(await digestFile(filename)).sha256!==info.file.sha256)throw new Problem(409,'FILE_UNAVAILABLE');
    const table=info.file.content_type==='text/csv'?parse(new TextDecoder('utf-8',{fatal:true}).decode(await fs.readFile(filename)),
      {bom:true,skip_empty_lines:true,max_record_size:128*1024}) as string[][]:await readXlsx(filename);
    if(table.length<2||table.length>5001||table.some(row=>row.length>50))throw new Problem(422,'IMPORT_LIMIT_EXCEEDED');
    const columns=table.shift()!.map(text=>text.trim());
    if(columns.some(text=>!text||text.length>100)||new Set(columns).size!==columns.length)validation('fileId','Tên cột thiếu hoặc trùng');
    await this.db.transaction(async tx=>{
      await tx.query('SELECT app.lock_school()');
      await guard(tx);const job=await this.job(tx,schoolId,importId,true);if(job.status==='CANCELLED'||job.parsed_at)return;
      await this.authorize(tx,schoolId,String(job.requested_by),String(job.kind),job.class_id as string|undefined);
      for(let index=0;index<table.length;index++){
        const values=table[index]!,source=Object.fromEntries(columns.map((column,c)=>[column,values[c]??'']));
        if(values.length!==columns.length)validation('fileId','Số cột không nhất quán');
        await tx.query(`INSERT INTO app.import_rows(school_id,import_id,row_number,source_data) VALUES($1,$2,$3,$4)
          ON CONFLICT(school_id,import_id,row_number) DO NOTHING`,[schoolId,importId,index+2,source]);
      }
      await tx.query('UPDATE app.import_jobs SET source_columns=$3,parsed_at=now() WHERE school_id=$1 AND id=$2',[schoolId,importId,JSON.stringify(columns)]);
    },{schoolId});
  }
  async sourceHash(tx:Transaction,schoolId:string,job:Row,rows:Row[]){
    const file=await one<{sha256:string}>(tx,"SELECT sha256 FROM app.files WHERE school_id=$1 AND id=$2 AND status='READY'",[schoolId,job.file_id]);if(!file)throw new Problem(409,'FILE_UNAVAILABLE');
    return hashToken(canonical({file:file.sha256,yearId:job.year_id,classId:job.class_id,kind:job.kind,mapping:job.column_mapping,
      rows:rows.map(row=>({rowNumber:row.row_number,canonical:row.normalized_data,errors:row.errors}))}));
  }
}
