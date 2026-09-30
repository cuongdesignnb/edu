import { Injectable } from '@nestjs/common';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { parse } from 'csv-parse/sync';
import { Database,one,type Transaction,type Row } from '../../database/database';
import { dto,listResource,type Resource,getResource,resource } from '../../database/resources';
import { Permissions,grantAllows,type Grant } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { validateSchema } from '../../common/contract';
import { runtimeConfig } from '../../common/config';
import { Problem,notFound,validation,mapError } from '../../common/problem';
import { objectPath,stagingPath,streamUpload,atomicStore,removeStaging,digestFile,safeName } from './storage';
import { inspectXlsx } from './xlsx';
import type { RequestContext,Handler,Result } from '../../api.router';

export const fileResource:Resource={table:'app.files',fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',
  originalName:'original_name',contentType:'content_type',byteSize:'byte_size',sha256:'sha256',status:'status',uploadedBy:'uploaded_by',scanStatus:'scan_status',rejectionCode:'rejection_code'},writeFields:[],search:['original_name'],filters:{status:'status'}};
export function fileDto(row:Row){const value=dto(fileResource,row);value.byteSize=Number(value.byteSize);return value;}
@Injectable()
export class FilesService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands){}
  handlers():Record<string,Handler>{return Object.fromEntries(['uploadFile','listClassFiles','getFile','downloadFile','archiveFile','createFileLink']
    .map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  private async handle(c:RequestContext):Promise<Result>{
    if(c.operation.id==='uploadFile')return this.upload(c);
    const schoolId=c.params.schoolId!,op=c.operation.id;
    const authorize=async(tx:Transaction)=>{
      if(op==='listClassFiles')return this.policy.require(tx,c.principal!,c.operation.permission,{schoolId,classId:c.params.classId,yearId:c.query.yearId,allowSubject:true});
      const row=await this.authorizeFile(tx,schoolId,c.params.fileId??String(c.body.fileId),c.principal!.userId,c.operation.permission);
      if(op==='createFileLink')await this.targetScope(tx,c);return row;
    };
    const work=async(tx:Transaction):Promise<Result>=>{
      const row=await authorize(tx);
      if(op==='listClassFiles'){
        const access=row as {grants:Grant[];today:string};
        const full=access.grants.some(g=>grantAllows(g,'file.read',{schoolId,classId:c.params.classId},access.today));
        const result=await listResource(tx,fileResource,schoolId,c.query,{sql:`${full?'':"t.purpose='CLASS_DOCUMENT' AND "}(t.upload_class_id=$1 OR EXISTS
          (SELECT 1 FROM app.file_links l WHERE l.school_id=t.school_id AND l.file_id=t.id AND l.class_id=$1))`,values:[c.params.classId]},c.principal!.userId);
        for(const file of result.data)file.byteSize=Number(file.byteSize);return result;
      }
      const file=row as Row;
      if(op==='getFile')return {data:fileDto(file)};
      if(op==='downloadFile'){
        if(file.status!=='READY'||(file.expires_at&&new Date(String(file.expires_at))<=new Date()))throw new Problem(409,'FILE_UNAVAILABLE');
        const filename=objectPath(schoolId,String(file.object_key));await fs.access(filename);
        return {data:null,binary:{stream:createReadStream(filename),contentType:String(file.content_type),filename:String(file.original_name),byteSize:Number(file.byte_size)}};
      }
      if(op==='archiveFile'){
        const current=await one<Row>(tx,'SELECT * FROM app.files WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,file.id]);
        if(current!.version!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(current!.version));
        const saved=await one<Row>(tx,"UPDATE app.files SET status='ARCHIVED' WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,file.id]);
        await audit(tx,c,'file',String(file.id),{status:'ARCHIVED'});return {data:fileDto(saved!)};
      }
      if(file.status!=='READY')throw new Problem(409,'FILE_UNAVAILABLE');
      if(file.purpose==='EVIDENCE')validation('fileId','Minh chứng chỉ được gắn với người được giao qua luồng minh chứng');
      const link=await one<{id:string}>(tx,`INSERT INTO app.file_links(school_id,file_id,student_id,class_id,activity_id,announcement_id,share_with_guardian)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[schoolId,file.id,c.body.studentId??null,c.body.classId??null,c.body.activityId??null,c.body.announcementId??null,c.body.shareWithGuardian]);
      await audit(tx,c,'file-link',link!.id,{fileId:file.id,shareWithGuardian:c.body.shareWithGuardian});return {data:{id:link!.id,status:'CREATED'},status:201};
    };
    if(c.operation.method==='GET')return this.db.transaction(work,{schoolId});return this.commands.execute(c,authorize,work);
  }
  async authorizeFile(tx:Transaction,schoolId:string,fileId:string,userId:string,action:string){
    try{return await this.fileScope(tx,schoolId,fileId,userId,action);}
    catch(error){if(error instanceof Problem&&error.code==='FORBIDDEN')notFound();throw error;}
  }
  private async fileScope(tx:Transaction,schoolId:string,fileId:string,userId:string,action:string){
    const file=await one<Row>(tx,'SELECT * FROM app.files WHERE school_id=$1 AND id=$2',[schoolId,fileId]);if(!file)notFound();
    // Current role/scope is always checked; uploader ownership alone grants no access.
    if(!['file.read','file.download'].includes(action)||file.uploaded_by===userId){
      await this.policy.require(tx,{userId},action,{schoolId,classId:file.upload_class_id as string|undefined,allowSubject:file.purpose==='CLASS_DOCUMENT'});return file;
    }
    const access=await this.policy.collection(tx,{userId},action,schoolId,file.purpose==='CLASS_DOCUMENT');
    if(access.all)return file;
    const familyClasses=access.classIds.filter(classId=>access.grants.some(g=>grantAllows(g,'guardian.read',{schoolId,classId},access.today)));
    if(file.purpose==='EVIDENCE'&&await one(tx,`SELECT ev.id FROM app.evidence ev JOIN app.activity_participants p ON p.school_id=ev.school_id AND p.id=ev.participant_id
      WHERE ev.school_id=$1 AND ev.file_id=$2 AND p.class_id=ANY($3::uuid[]) LIMIT 1`,[schoolId,fileId,access.classIds]))return file;
    const link=await one(tx,`SELECT l.id FROM app.file_links l
      LEFT JOIN app.activities a ON a.school_id=l.school_id AND a.id=l.activity_id
      LEFT JOIN app.announcements n ON n.school_id=l.school_id AND n.id=l.announcement_id
      WHERE l.school_id=$1 AND l.file_id=$2 AND (l.class_id=ANY($3::uuid[]) OR a.class_id=ANY($3::uuid[])
        OR n.class_id=ANY($3::uuid[]) OR EXISTS(SELECT 1 FROM app.enrollments e WHERE e.school_id=l.school_id AND e.student_id=l.student_id
          AND e.class_id=ANY($5::uuid[]) AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4))) LIMIT 1`,[schoolId,fileId,access.classIds,access.today,familyClasses]);
    if(!link)notFound();return file;
  }
  private async targetScope(tx:Transaction,c:RequestContext){
    const schoolId=c.params.schoolId!,body=c.body;
    if(['studentId','classId','activityId','announcementId'].filter(key=>body[key]).length!==1)validation('fileId','Cần đúng một đối tượng dùng tệp');
    if(body.classId)return this.policy.require(tx,c.principal!,'file.manage',{schoolId,classId:String(body.classId)});
    if(body.studentId){
      const access=await this.policy.collection(tx,c.principal!,'guardian.manage',schoolId);
      await getResource(tx,resource('student'),schoolId,String(body.studentId));
      if(!access.all&&!await one(tx,`SELECT id FROM app.enrollments WHERE school_id=$1 AND student_id=$2 AND class_id=ANY($3::uuid[])
        AND status<>'CANCELLED' AND starts_on<=$4 AND (ends_on IS NULL OR ends_on>$4) LIMIT 1`,[schoolId,body.studentId,access.classIds,access.today]))notFound();
      return;
    }
    const activity=!!body.activityId;
    const target=await one<Row>(tx,`SELECT id,class_id FROM ${activity?'app.activities':'app.announcements'} WHERE school_id=$1 AND id=$2`,[schoolId,activity?body.activityId:body.announcementId]);
    if(!target)notFound();await this.policy.require(tx,c.principal!,activity?'activity.manage':'announcement.manage',{schoolId,classId:target.class_id as string|undefined});
  }
  private async upload(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!;
    if(!c.request.isMultipart())throw new Problem(400,'MULTIPART_REQUIRED');
    await this.db.transaction(tx=>this.policy.collection(tx,c.principal!,'file.upload',schoolId),{schoolId});
    const temporary=stagingPath(),fields:Record<string,unknown>={};let file:{bytes:number;sha256:string;name:string;type:string}|undefined;
    try{
      for await(const part of c.request.parts()){
        if(part.type==='file'){
          if(part.fieldname!=='file'||file)validation('file','Cần đúng một tệp');
          const received=await streamUpload(part.file,temporary);
          if(part.file.truncated)throw new Problem(422,'FILE_TOO_LARGE');
          file={...received,name:safeName(part.filename),type:part.mimetype};
        }else{
          if(!['purpose','classId'].includes(part.fieldname)||Object.hasOwn(fields,part.fieldname)||typeof part.value!=='string')validation('file','Trường upload không hợp lệ');
          fields[part.fieldname]=part.value;
        }
      }
      if(!file||!file.bytes)validation('file','Tệp rỗng');
      c.body={...fields,file:`${file.sha256}:${file.name}:${file.type}`};validateSchema('UploadRequest',c.body);
      if(fields.purpose==='IMPORT'&&file.bytes>10*1024*1024)throw new Problem(422,'FILE_TOO_LARGE');
      const upload=file,id=crypto.randomUUID(),key=`${id}.source`;
      const authorize=async(tx:Transaction)=>{
        await this.policy.require(tx,c.principal!,'file.upload',{schoolId,classId:fields.classId as string|undefined});
        if(fields.purpose==='IMPORT')await this.policy.require(tx,c.principal!,'import.manage',{schoolId});
        if(fields.purpose==='SCHOOL_LOGO')await this.policy.require(tx,c.principal!,'school.settings',{schoolId});
      };
      return await this.commands.execute(c,authorize,async tx=>{
        await tx.query('SELECT id FROM platform.schools WHERE id=$1 FOR UPDATE',[schoolId]);
        const quota=Number(process.env.SCHOOL_FILE_QUOTA_MB??512)*1024*1024;
        const used=await one<{total:string}>(tx,'SELECT coalesce(sum(byte_size),0)::text AS total FROM app.files WHERE school_id=$1',[schoolId]);
        if(Number(used!.total)+upload.bytes>quota)throw new Problem(422,'FILE_QUOTA_EXCEEDED');
        await atomicStore(schoolId,key,temporary);
        const row=await one<Row>(tx,`INSERT INTO app.files(id,school_id,object_key,original_name,content_type,byte_size,sha256,status,uploaded_by,purpose,upload_class_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,'QUARANTINED',$8,$9,$10) RETURNING *`,[id,schoolId,key,upload.name,upload.type,upload.bytes,upload.sha256,c.principal!.userId,fields.purpose,fields.classId??null]);
        await tx.query(`INSERT INTO app.outbox_events(school_id,kind,dedupe_key,payload) VALUES($1,'PROCESS_FILE',$2,$3)`,[schoolId,`file:${id}`,{fileId:id,userId:c.principal!.userId}]);
        await audit(tx,c,'file',id,{status:'QUARANTINED',byteSize:upload.bytes});return {data:fileDto(row!)};
      });
    }finally{await removeStaging(temporary);}
  }
  async processFile(schoolId:string,fileId:string,userId:string,guard:(tx:Transaction)=>Promise<void>){
    const file=await this.db.transaction(async tx=>{
      await guard(tx);
      const user=await one(tx,"SELECT id FROM identity.users WHERE id=$1 AND status='ACTIVE'",[userId]);if(!user)throw new Problem(403,'REQUESTER_REVOKED');
      return this.authorizeFile(tx,schoolId,fileId,userId,'file.upload');
    },{schoolId});
    if(file.status==='READY'||file.status==='ARCHIVED'||file.status==='REJECTED')return;
    if(file.status!=='QUARANTINED')throw new Problem(409,'FILE_UNAVAILABLE');
    const source=objectPath(schoolId,String(file.object_key)),output=stagingPath();
    try{
      const input=await digestFile(source);if(input.sha256!==file.sha256||input.bytes!==Number(file.byte_size))throw new Problem(422,'FILE_HASH_MISMATCH');
      const head=await fs.open(source,'r');let prefix:Buffer;
      try{prefix=Buffer.alloc(16);await head.read(prefix,0,16,0);}finally{await head.close();}
      let contentType:string;
      const image=prefix.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||prefix.subarray(0,3).equals(Buffer.from([255,216,255]))
        ||(prefix.subarray(0,4).toString()==='RIFF'&&prefix.subarray(8,12).toString()==='WEBP');
      if(image){
        const image=sharp(source,{limitInputPixels:20_000_000,animated:false,failOn:'warning'});
        const meta=await image.metadata();if((meta.pages??1)>1)throw new Problem(422,'MULTIPAGE_IMAGE_REJECTED');
        await image.rotate().png().toFile(output);contentType='image/png';
      }else if(file.purpose==='IMPORT'){
        if(prefix.subarray(0,2).toString()==='PK'){
          await inspectXlsx(source);contentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        }else{
          const bytes=await fs.readFile(source);
          const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
          if(text.includes('\0')||/^\s*</.test(text)||/^[\s\S]{0,200}<script/i.test(text))throw new Problem(422,'FILE_TYPE_REJECTED');
          const rows=parse(text,{bom:true,skip_empty_lines:true,max_record_size:128*1024,relax_column_count:false}) as string[][];
          if(rows.length<2||rows.length>5001||rows.some(row=>row.length>50))throw new Problem(422,'IMPORT_LIMIT_EXCEEDED');
          contentType='text/csv';
        }
        await fs.copyFile(source,output);
      }else if(prefix.subarray(0,5).toString()==='%PDF-'&&file.purpose==='CLASS_DOCUMENT'){
        // Local PDF validation is deliberately limited; it is not virus scanning.
        const bytes=await fs.readFile(source);
        if(!bytes.subarray(-2048).toString('latin1').includes('%%EOF')||/\/(JavaScript|JS|OpenAction|AA|EmbeddedFile|Launch)\b/.test(bytes.toString('latin1')))
          throw new Problem(422,'ACTIVE_PDF_REJECTED');
        if(runtimeConfig().appEnv==='production')throw new Problem(422,'PRODUCTION_SCANNER_REQUIRED');
        await fs.copyFile(source,output);contentType='application/pdf';
      }else throw new Problem(422,'FILE_TYPE_REJECTED');
      if(runtimeConfig().appEnv==='production'&&contentType!=='image/png')throw new Problem(422,'PRODUCTION_SCANNER_REQUIRED');
      if(file.purpose==='SCHOOL_LOGO'&&!image)throw new Problem(422,'FILE_TYPE_REJECTED');
      const processed=await digestFile(output),key=`${fileId}.ready`;
      if(processed.bytes>25*1024*1024)throw new Problem(422,'FILE_TOO_LARGE');
      await atomicStore(schoolId,key,output);
      await this.db.transaction(async tx=>{
        await guard(tx);await this.authorizeFile(tx,schoolId,fileId,userId,'file.upload');
        await tx.query(`UPDATE app.files SET object_key=$3,content_type=$4,byte_size=$5,sha256=$6,status='READY',scan_status='NOT_SCANNED',rejection_code=NULL
          WHERE school_id=$1 AND id=$2 AND status='QUARANTINED'`,[schoolId,fileId,key,contentType,processed.bytes,processed.sha256]);
      },{schoolId});
    }catch(error){
      const transient=mapError(error);if(transient.status===503||transient.code==='JOB_LEASE_LOST')throw transient;
      const code=error instanceof Problem?error.code:'FILE_PARSE_REJECTED';
      await this.db.transaction(async tx=>{await guard(tx);await tx.query("UPDATE app.files SET status='REJECTED',rejection_code=$3 WHERE school_id=$1 AND id=$2 AND status='QUARANTINED'",[schoolId,fileId,code]);},{schoolId});
      throw new Problem(422,code);
    }finally{await removeStaging(output);}
  }
}
