import {Injectable} from '@nestjs/common';
import crypto from 'node:crypto';
import {createReadStream} from 'node:fs';
import {Database,one,type Transaction,type Row} from '../../database/database';
import {dto,listResource,type Resource} from '../../database/resources';
import {Permissions} from '../../common/permissions';
import {Commands,audit,canonical} from '../../common/commands';
import {Problem,notFound,validation,mapError} from '../../common/problem';
import {stagingPath,removeStaging,storageAvailable,digestFile,atomicStore,objectPath} from '../files/storage';
import {reportContext,buildReport,type ReportInput} from './report-data';
import {renderReport,type ReportData} from './report-render';
import {reportCatalog} from './report-catalog';
import {searchWorkspace} from './search-workspace';
import type {Handler,RequestContext,Result} from '../../api.router';
const exportsResource:Resource={table:'app.export_jobs',fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',reportType:'report_type',format:'format',status:'status',fileId:'file_id',expiresAt:'expires_at',classId:'class_id',requestedBy:'requested_by',asOf:'as_of',contentHash:'content_hash',lastErrorCode:'last_error_code'},writeFields:[],search:['report_type'],filters:{status:'status',classId:'class_id'}};
const exportView:Resource={...exportsResource,table:"(SELECT e.*,e.report_snapshot->>'asOf' AS as_of,e.report_snapshot->>'title' AS title,jsonb_array_length(e.report_snapshot->'rows') AS row_count,'EduManage-'||e.report_type||'-'||e.planned_file_id::text||'.'||lower(e.format) AS file_name,CASE WHEN e.expires_at<=now() AND e.status<>'CANCELLED' THEN 'EXPIRED' ELSE e.status END AS visible_status FROM app.export_jobs e)",fields:{...exportsResource.fields,status:'visible_status',title:'title',rowCount:'row_count',filters:'filters',fileName:'file_name'},filters:{...exportsResource.filters,status:'visible_status'}};
function exportDto(r:Row){const snapshot=r.report_snapshot as ReportData|undefined,value=dto(exportView,{...r,as_of:snapshot?.asOf??r.as_of,title:snapshot?.title??r.title,row_count:snapshot?.rows.length??r.row_count,file_name:r.file_name??`EduManage-${r.report_type}-${r.planned_file_id}.${String(r.format).toLowerCase()}`,visible_status:r.expires_at&&new Date(r.expires_at as Date).getTime()<=Date.now()&&r.status!=='CANCELLED'?'EXPIRED':r.visible_status??r.status});if(!value.lastErrorCode)delete value.lastErrorCode;return value;}
export async function authorizeExport(tx:Transaction,policy:Permissions,schoolId:string,job:Row,userId:string){
  if(job.requested_by!==userId)notFound();
  const identity=await one(tx,"SELECT id FROM identity.users WHERE id=$1 AND status='ACTIVE'",[userId]);if(!identity)throw new Problem(403,'REQUESTER_REVOKED');
  const ctx=await reportContext(tx,policy,schoolId,userId,job.filters as ReportInput,true);
  if(ctx.fingerprint!==job.scope_fingerprint)throw new Problem(409,'EXPORT_SCOPE_CHANGED');return ctx;
}
@Injectable()
export class ReportsService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands){}
  handlers():Record<string,Handler>{return {...Object.fromEntries(['getSchoolReportCatalog','getClassReportCatalog','getTeacherReportCatalog'].map(id=>[id,(c:RequestContext)=>reportCatalog(this.db,this.policy,c)])),searchWorkspace:(c:RequestContext)=>searchWorkspace(this.db,this.policy,c),...Object.fromEntries(['getSchoolReport','getClassReport','listExports','createExport','getExport','downloadExport','cancelExport'].map(id=>[id,(c:RequestContext)=>this.handle(c)]))};}
  private async get(tx:Transaction,schoolId:string,id:string,lock=false){const job=await one<Row>(tx,`SELECT * FROM app.export_jobs WHERE school_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[schoolId,id]);if(!job)notFound();return job;}
  private input(c:RequestContext):ReportInput{
    const source=c.operation.id==='createExport'?c.body:c.query,allowed=new Set(['yearId','classId','studentId','gradeId','weekId','from','to','dataSource',...(c.operation.id==='createExport'?['reportType','format','scope','studentIds']:[])]);
    for(const key of Object.keys(source))if(!allowed.has(key))validation(key,'Bộ lọc không được hỗ trợ');
    if(c.params.classId&&source.classId&&c.params.classId!==source.classId)notFound();
    return {...source,reportType:String(c.params.reportType??c.body.reportType),...(c.operation.id==='getSchoolReport'?{scope:'SCHOOL'}:c.operation.id==='getClassReport'?{scope:'CLASS'}:{}),...(c.params.classId?{classId:c.params.classId}:{})} as ReportInput;
  }
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,op=c.operation.id,uid=c.principal!.userId;
    if(['getSchoolReport','getClassReport'].includes(op))return this.db.transaction(async tx=>({data:await buildReport(tx,await reportContext(tx,this.policy,schoolId,uid,this.input(c)))}),{schoolId,userId:uid,readOnly:true});
    if(op==='listExports')return this.db.transaction(async tx=>{
      const access=await this.policy.collection(tx,c.principal!,'report.export',schoolId),classIds=access.all?null:access.classIds;
      const result=await listResource(tx,exportView,schoolId,c.query,{sql:'t.requested_by=$1::uuid AND ($2::uuid[] IS NULL OR t.class_id=ANY($2::uuid[]))',values:[uid,classIds]},uid);
      result.data=result.data.map(r=>{if(!r.lastErrorCode)delete r.lastErrorCode;return r;});return result;
    },{schoolId,userId:uid,readOnly:true});
    const authorize=async(tx:Transaction)=>op==='createExport'?reportContext(tx,this.policy,schoolId,uid,this.input(c),true):authorizeExport(tx,this.policy,schoolId,await this.get(tx,schoolId,c.params.exportId!),uid);
    const work=async(tx:Transaction):Promise<Result>=>{
      if(op==='createExport'){
        const ctx=await reportContext(tx,this.policy,schoolId,uid,this.input(c),true),report=await buildReport(tx,ctx),hash=crypto.createHash('sha256').update(canonical(report)).digest('hex');
        const queued=await one<Row>(tx,"INSERT INTO app.export_jobs(school_id,requested_by,class_id,report_type,format,filters,report_snapshot,content_hash,scope_fingerprint,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '24 hours') RETURNING *",[schoolId,uid,ctx.cls?.id??null,ctx.input.reportType,c.body.format,ctx.input,report,hash,ctx.fingerprint]);
        await tx.query("INSERT INTO app.outbox_events(school_id,kind,dedupe_key,payload) VALUES($1,'EXPORT_REPORT',$2,$3)",[schoolId,`export:${queued!.id}`,{exportId:queued!.id}]);await audit(tx,c,'export',String(queued!.id),{status:'QUEUED',reportType:ctx.input.reportType,format:c.body.format,rows:report.rows.length,contentHash:hash});return {data:exportDto(queued!),status:202};
      }
      const job=await this.get(tx,schoolId,c.params.exportId!,op==='cancelExport');
      if(op==='getExport')return {data:exportDto(job)};
      if(op==='cancelExport'){
        if(job.version!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(job.version));
        if(!['QUEUED','RUNNING','FAILED'].includes(String(job.status)))throw new Problem(409,'INVALID_STATE');
        const saved=await one<Row>(tx,"UPDATE app.export_jobs SET status='CANCELLED',last_error_code=NULL WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,job.id]);
        await tx.query("UPDATE app.outbox_events SET status='DONE',processed_at=now(),lease_owner=NULL,lease_until=NULL WHERE school_id=$1 AND kind='EXPORT_REPORT' AND dedupe_key=$2 AND status<>'LEASED'",[schoolId,`export:${job.id}`]);await audit(tx,c,'export',String(job.id),{status:'CANCELLED'});return {data:exportDto(saved!)};
      }
      if(job.status!=='COMPLETED'||!job.file_id)throw new Problem(409,'EXPORT_NOT_READY');if(new Date(job.expires_at as Date).getTime()<=Date.now())throw new Problem(410,'EXPORT_EXPIRED');
      const file=await one<Row>(tx,"SELECT * FROM app.files WHERE school_id=$1 AND id=$2 AND status='READY' AND purpose='GENERATED' AND expires_at>now()",[schoolId,job.file_id]);if(!file)notFound();
      const filename=objectPath(schoolId,String(file.object_key)),actual=await digestFile(filename);if(actual.sha256!==file.sha256||actual.bytes!==Number(file.byte_size))throw new Problem(503,'FILE_HASH_MISMATCH');
      return {data:null,binary:{stream:createReadStream(filename),contentType:String(file.content_type),filename:String(file.original_name),byteSize:actual.bytes}};
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId,userId:uid,readOnly:true});return this.commands.execute(c,authorize,work);
  }
  async runExport(schoolId:string,exportId:string,guard:(tx:Transaction)=>Promise<void>){
    const tmp=stagingPath();let job:Row|undefined;
    try{
      job=await this.db.transaction(async tx=>{
        await guard(tx);await tx.query('SELECT app.lock_school()');const current=await this.get(tx,schoolId,exportId,true);
        if(['COMPLETED','CANCELLED','EXPIRED'].includes(String(current.status)))return undefined;
        if(new Date(current.expires_at as Date).getTime()<=Date.now()){await tx.query("UPDATE app.export_jobs SET status='EXPIRED' WHERE school_id=$1 AND id=$2",[schoolId,exportId]);return undefined;}
        await authorizeExport(tx,this.policy,schoolId,current,String(current.requested_by));
        if(crypto.createHash('sha256').update(canonical(current.report_snapshot)).digest('hex')!==current.content_hash)throw new Problem(409,'EXPORT_SNAPSHOT_MISMATCH');
        await tx.query("UPDATE app.export_jobs SET status='RUNNING',last_error_code=NULL WHERE school_id=$1 AND id=$2",[schoolId,exportId]);return current;
      },{schoolId});if(!job)return;
      await storageAvailable(25*1024*1024);const type=await renderReport(tmp,String(job.format),job.report_snapshot as ReportData),digest=await digestFile(tmp);if(digest.bytes>25*1024*1024)throw new Problem(422,'EXPORT_FILE_LIMIT_EXCEEDED');
      await this.db.transaction(async tx=>{
        await guard(tx);await tx.query('SELECT app.lock_school()');const current=await this.get(tx,schoolId,exportId,true);
        if(current.status==='CANCELLED')return;if(current.status!=='RUNNING')throw new Problem(409,'INVALID_STATE');await authorizeExport(tx,this.policy,schoolId,current,String(current.requested_by));
        const used=await one<{n:string}>(tx,'SELECT coalesce(sum(byte_size),0)::text AS n FROM app.files WHERE school_id=$1',[schoolId]);if(Number(used!.n)+digest.bytes>Number(process.env.SCHOOL_FILE_QUOTA_MB??512)*1024*1024)throw new Problem(422,'FILE_QUOTA_EXCEEDED');
        const id=String(current.planned_file_id),key=`${id}.ready`;await atomicStore(schoolId,key,tmp);
        const ext=String(current.format).toLowerCase();await tx.query("INSERT INTO app.files(id,school_id,object_key,original_name,content_type,byte_size,sha256,status,uploaded_by,purpose,upload_class_id,scan_status,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'READY',$8,'GENERATED',$9,'GENERATED',now()+interval '24 hours')",[id,schoolId,key,`EduManage-${current.report_type}-${id}.${ext}`,type,digest.bytes,digest.sha256,current.requested_by,current.class_id]);
        await tx.query("UPDATE app.export_jobs SET status='COMPLETED',file_id=$3,completed_at=now(),expires_at=now()+interval '24 hours',last_error_code=NULL WHERE school_id=$1 AND id=$2",[schoolId,exportId,id]);
        await tx.query("INSERT INTO app.audit_events(school_id,actor_user_id,actor_kind,action,target_type,target_id,request_id,redacted_after) VALUES($1,$2,'STAFF','exportCompleted','export',$3,$4,$5)",[schoolId,current.requested_by,exportId,`export:${exportId}`,{format:current.format,byteSize:digest.bytes,contentHash:current.content_hash}]);
      },{schoolId});
    }catch(error){
      const problem=mapError(error);await this.db.transaction(async tx=>{await guard(tx);await tx.query("UPDATE app.export_jobs SET status='FAILED',last_error_code=$3 WHERE school_id=$1 AND id=$2 AND status NOT IN ('COMPLETED','CANCELLED','EXPIRED')",[schoolId,exportId,problem.code]);},{schoolId});throw error;
    }finally{await removeStaging(tmp);}
  }
}
