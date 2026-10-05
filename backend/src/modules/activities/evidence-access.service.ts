import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import sharp from 'sharp';
import {Injectable} from '@nestjs/common';
import type {FastifyRequest} from 'fastify';
import {Database,one,type Row,type Transaction} from '../../database/database';
import {Permissions} from '../../common/permissions';
import {Commands,audit} from '../../common/commands';
import {hashToken,randomToken,csrfFor,setCookie} from '../../common/security';
import {runtimeConfig} from '../../common/config';
import {Problem,notFound,validation} from '../../common/problem';
import {IdentityService} from '../identity/identity.service';
import {objectPath,stagingPath,streamUpload,atomicStore,removeStaging,digestFile,safeName} from '../files/storage';
import {id,text,expected,classPortal,capabilityCommand} from '../classroom/notebook-common';
import type {Handler,RequestContext,CapabilityPrincipal,Result} from '../../api.router';
const maxBytes=()=>Math.max(0.5,Math.min(10,Number(process.env.STUDENT_EVIDENCE_MAX_MB)||10))*1024*1024;
const cookie=()=>runtimeConfig().secure?'__Host-edu_evidence':'edu_evidence';
@Injectable()
export class EvidenceAccessService{
 constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly identity:IdentityService){}
 handlers():Record<string,Handler>{return {issueStudentEvidenceAccess:c=>this.staff(c),revokeStudentEvidenceAccess:c=>this.staff(c),getStudentEvidenceAccesses:c=>this.staff(c),getActivityReminders:c=>this.reminders(c),exchangeStudentEvidenceAccess:c=>this.exchange(c),getStudentEvidenceWorkspace:c=>this.workspace(c),uploadStudentEvidence:c=>this.upload(c),downloadStudentEvidence:c=>this.download(c)};}
 private async portal(slug:string){const row=await one<Row>(this.db.app as unknown as Transaction,`SELECT p.* FROM platform.public_class_portals p JOIN platform.schools s ON s.id=p.school_id AND s.status='ACTIVE' WHERE p.slug=$1`,[slug]);if(!row)notFound();return row;}
 private async access(tx:Transaction,schoolId:string,classId:string,accessId:string){
  const row=await one<Row>(tx,`SELECT x.*,p.activity_id,p.enrollment_id,p.status AS participant_status,a.title,a.description,a.due_at,a.starts_at,a.max_files,a.year_id,st.full_name,c.name AS class_name
  FROM app.evidence_access x JOIN app.activity_participants p ON p.school_id=x.school_id AND p.id=x.participant_id AND p.class_id=x.class_id
  JOIN app.activities a ON a.school_id=p.school_id AND a.id=p.activity_id AND a.class_id=p.class_id
  JOIN app.enrollments e ON e.school_id=p.school_id AND e.id=p.enrollment_id AND e.class_id=p.class_id AND e.year_id=a.year_id
  JOIN app.students st ON st.school_id=e.school_id AND st.id=e.student_id JOIN app.classes c ON c.school_id=x.school_id AND c.id=x.class_id
  JOIN app.academic_years y ON y.school_id=a.school_id AND y.id=a.year_id JOIN platform.schools s ON s.id=x.school_id
  WHERE x.school_id=$1 AND x.class_id=$2 AND x.id=$3 AND x.revoked_at IS NULL AND x.expires_at>now() AND p.cancelled_at IS NULL
  AND a.status='ASSIGNED' AND (a.starts_at IS NULL OR a.starts_at<=now()) AND c.status<>'ARCHIVED' AND y.status<>'ARCHIVED'
  AND e.status<>'CANCELLED' AND e.starts_on<=(now() AT TIME ZONE s.timezone)::date AND (e.ends_on IS NULL OR e.ends_on>(now() AT TIME ZONE s.timezone)::date)`,[schoolId,classId,accessId]);if(!row)throw new Problem(401,'EVIDENCE_ACCESS_INVALID');return row;
 }
 private async staff(c:RequestContext):Promise<Result>{
  const school=c.params.schoolId!,classId=c.params.classId!,authorize=async(tx:Transaction)=>this.policy.require(tx,c.principal!,'evidence.manage',{schoolId:school,classId});
  const work=async(tx:Transaction)=>{
   await authorize(tx);
   if(c.operation.id==='getStudentEvidenceAccesses')return {data:(await tx.query<Row>(`SELECT x.id,x.participant_id,x.expires_at,x.revoked_at,x.version,x.created_at FROM app.evidence_access x JOIN app.activity_participants p ON p.school_id=x.school_id AND p.id=x.participant_id WHERE x.school_id=$1 AND x.class_id=$2 AND p.activity_id=$3 ORDER BY x.created_at DESC`,[school,classId,id(c.query.activityId)])).rows};
   if(c.operation.id==='revokeStudentEvidenceAccess'){
    const row=await one<Row>(tx,'SELECT id,version FROM app.evidence_access WHERE school_id=$1 AND class_id=$2 AND id=$3 FOR UPDATE',[school,classId,id(c.body.accessId)]);if(!row)notFound();expected(row,c.body.expectedVersion);text(c.body.reason,'reason',5,2000);
    await tx.query('UPDATE app.evidence_access SET revoked_at=now() WHERE school_id=$1 AND id=$2',[school,row.id]);await tx.query('UPDATE identity.evidence_sessions SET revoked_at=now() WHERE school_id=$1 AND access_id=$2 AND revoked_at IS NULL',[school,row.id]);await audit(tx,c,'evidence-access',String(row.id),{revoked:true});return {data:{id:row.id,revoked:true}};
   }
   const participant=await one<Row>(tx,`SELECT p.id,a.due_at,a.status FROM app.activity_participants p JOIN app.activities a ON a.school_id=p.school_id AND a.id=p.activity_id WHERE p.school_id=$1 AND p.class_id=$2 AND p.id=$3 AND p.cancelled_at IS NULL AND a.status='ASSIGNED'`,[school,classId,id(c.body.participantId)]);if(!participant)notFound();
   const expiry=new Date(String(c.body.expiresAt));if(!Number.isFinite(+expiry)||+expiry<=Date.now()||+expiry>Date.now()+30*86400000)validation('expiresAt','Hạn mã truy cập từ hôm nay đến 30 ngày');
   await tx.query('UPDATE app.evidence_access SET revoked_at=now() WHERE school_id=$1 AND class_id=$2 AND participant_id=$3 AND revoked_at IS NULL',[school,classId,participant.id]);
   const token=randomToken(),row=(await one<Row>(tx,'INSERT INTO app.evidence_access(school_id,class_id,participant_id,token_hash,expires_at,issued_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,version,expires_at',[school,classId,participant.id,hashToken(token),expiry,c.principal!.userId]))!;
   const slug=await classPortal(tx,school,classId);await audit(tx,c,'evidence-access',String(row.id),{participantId:participant.id,expiresAt:expiry.toISOString()});return {data:{access:row,path:'/lop/'+slug+'/minh-chung#access='+token}};
  };
  if(c.operation.method==='GET')return this.db.transaction(work,{schoolId:school,userId:c.principal!.userId,readOnly:true});return this.commands.execute(c,authorize,work,c.operation.id==='issueStudentEvidenceAccess');
 }
 private async exchange(c:RequestContext):Promise<Result>{
  await this.identity.rateLimit('student-evidence-exchange:'+c.request.ip,20,300);const portal=await this.portal(c.params.publicClassSlug!),token=text(c.body.accessToken,'accessToken',32,128);
  const result=await this.db.transaction(async tx=>{
   const row=await one<Row>(tx,'SELECT id FROM app.evidence_access WHERE school_id=$1 AND class_id=$2 AND token_hash=$3',[portal.school_id,portal.class_id,hashToken(token)]);if(!row)throw new Problem(401,'EVIDENCE_ACCESS_INVALID');await this.access(tx,String(portal.school_id),String(portal.class_id),String(row.id));
   const sessionId=crypto.randomUUID(),sessionToken=randomToken(),tokenHash=hashToken(sessionToken),csrfToken=csrfFor(sessionId,tokenHash);
   await tx.query("INSERT INTO identity.evidence_sessions(id,school_id,access_id,token_hash,csrf_hash,expires_at) SELECT $1,$2,$3,$4,$5,least(now()+interval '30 minutes',expires_at) FROM app.evidence_access WHERE school_id=$2 AND id=$3",[sessionId,portal.school_id,row.id,tokenHash,hashToken(csrfToken)]);return {sessionToken,csrfToken};
  },{schoolId:String(portal.school_id)});setCookie(c.reply,cookie(),result.sessionToken,1800);return {data:{csrfToken:result.csrfToken}};
 }
 async authenticate(request:FastifyRequest,slug:string):Promise<CapabilityPrincipal>{
  const token=request.cookies[cookie()];if(!token)throw new Problem(401,'EVIDENCE_ACCESS_INVALID');const portal=await this.portal(slug);
  return this.db.transaction(async tx=>{const session=await one<Row>(tx,'SELECT * FROM identity.evidence_sessions WHERE school_id=$1 AND token_hash=$2 AND expires_at>now() AND revoked_at IS NULL',[portal.school_id,hashToken(token)]);if(!session)throw new Problem(401,'EVIDENCE_ACCESS_INVALID');const row=await this.access(tx,String(portal.school_id),String(portal.class_id),String(session.access_id));return {sessionId:String(session.id),schoolId:String(portal.school_id),classId:String(portal.class_id),yearId:String(row.year_id),accessId:String(row.id),tokenHash:String(session.token_hash),csrfHash:String(session.csrf_hash),row};},{schoolId:String(portal.school_id)});
 }
 private async fresh(tx:Transaction,c:RequestContext){const p=c.capability!;if(!await one(tx,'SELECT id FROM identity.evidence_sessions WHERE school_id=$1 AND id=$2 AND expires_at>now() AND revoked_at IS NULL',[p.schoolId,p.sessionId]))throw new Problem(401,'EVIDENCE_ACCESS_INVALID');return this.access(tx,p.schoolId,p.classId,p.accessId!);}
 private async workspace(c:RequestContext):Promise<Result>{const p=c.capability!;return this.db.transaction(async tx=>{const row=await this.fresh(tx,c),files=(await tx.query<Row>(`SELECT ev.id,ev.file_id,ev.caption,ev.status,ev.review_reason,ev.created_at,f.original_name,f.byte_size FROM app.evidence ev JOIN app.files f ON f.school_id=ev.school_id AND f.id=ev.file_id WHERE ev.school_id=$1 AND ev.participant_id=$2 ORDER BY ev.created_at DESC`,[p.schoolId,row.participant_id])).rows;return {data:{studentName:row.full_name,className:row.class_name,title:row.title,description:row.description,dueAt:row.due_at,maxFiles:row.max_files,expiresAt:row.expires_at,csrfToken:csrfFor(p.sessionId,p.tokenHash),files,acceptedTypes:['image/png','image/jpeg','image/webp'],maxBytes:maxBytes()}};},{schoolId:p.schoolId,readOnly:true});}
 private async upload(c:RequestContext):Promise<Result>{
  const p=c.capability!;await this.identity.rateLimit('evidence-upload:'+p.accessId,20,300);const temporary=stagingPath(),output=stagingPath();let name='',mime='',received=false,caption='';
  try{
   for await(const part of c.request.parts()){
    if(part.type==='file'){if(received||part.fieldname!=='file'||!['image/png','image/jpeg','image/webp'].includes(part.mimetype))validation('file','Chọn một ảnh PNG, JPEG hoặc WebP');received=true;name=safeName(part.filename);mime=part.mimetype;const raw=await streamUpload(part.file,temporary,maxBytes());if(!raw.bytes||part.file.truncated)throw new Problem(422,'FILE_TOO_LARGE');}
    else if(part.fieldname==='caption'&&typeof part.value==='string'&&!caption)caption=text(part.value,'caption',1,200);else validation('file','Trường upload không hợp lệ');
   }
   if(!received)validation('file','Chọn ảnh minh chứng');const metadata=await sharp(temporary,{limitInputPixels:20_000_000,failOn:'warning'}).metadata().catch(()=>{throw new Problem(422,'FILE_TYPE_REJECTED');});
   if(metadata.format!==({'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'} as Record<string,string>)[mime]||Number(metadata.pages??1)!==1)throw new Problem(422,'FILE_TYPE_REJECTED');
   await sharp(temporary,{limitInputPixels:20_000_000,failOn:'warning'}).rotate().png().toFile(output);const file=await digestFile(output);if(file.bytes>maxBytes())throw new Problem(422,'FILE_TOO_LARGE');
   c.body={sha256:file.sha256,name,caption};
   return await this.db.transaction(async tx=>{
    await tx.query('SELECT app.lock_school()');const row=await this.fresh(tx,c);
    return capabilityCommand(tx,c,async()=>{
     const count=await one<Row>(tx,'SELECT count(*)::integer AS count FROM app.evidence WHERE school_id=$1 AND participant_id=$2',[p.schoolId,row.participant_id]);if(Number(count!.count)>=Number(row.max_files))throw new Problem(422,'EVIDENCE_FILE_LIMIT');
     const used=await one<Row>(tx,'SELECT coalesce(sum(byte_size),0)::text AS total FROM app.files WHERE school_id=$1',[p.schoolId]);if(Number(used!.total)+file.bytes>Number(process.env.SCHOOL_FILE_QUOTA_MB??512)*1024*1024)throw new Problem(422,'FILE_QUOTA_EXCEEDED');
     const fileId=crypto.randomUUID(),key=fileId+'.ready';await atomicStore(p.schoolId,key,output);
     await tx.query(`INSERT INTO app.files(id,school_id,object_key,original_name,content_type,byte_size,sha256,status,uploaded_by,purpose,upload_class_id,scan_status) VALUES($1,$2,$3,$4,'image/png',$5,$6,'READY',$7,'EVIDENCE',$8,'NOT_SCANNED')`,[fileId,p.schoolId,key,name.replace(/\.[^.]+$/,'')+'.png',file.bytes,file.sha256,row.issued_by,p.classId]);
     const saved=await one<Row>(tx,'INSERT INTO app.evidence(school_id,participant_id,file_id,submitted_by,caption,access_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status,created_at',[p.schoolId,row.participant_id,fileId,row.issued_by,caption||null,p.accessId]);
     await tx.query("UPDATE app.activity_participants SET status='SUBMITTED',review_note=NULL,reviewed_by=NULL,reviewed_at=NULL WHERE school_id=$1 AND id=$2",[p.schoolId,row.participant_id]);
     await tx.query(`INSERT INTO app.audit_events(school_id,actor_kind,action,target_type,target_id,request_id,redacted_after) VALUES($1,'STUDENT','evidence.student-submit','evidence',$2,$3,$4)`,[p.schoolId,saved!.id,c.requestId,{accessId:p.accessId,activityId:row.activity_id,participantId:row.participant_id,byteSize:file.bytes,late:new Date(row.due_at as Date)<new Date()}]);return {data:saved};
    });
   },{schoolId:p.schoolId});
  }finally{await removeStaging(temporary);await removeStaging(output);}
 }
 private async download(c:RequestContext):Promise<Result>{const p=c.capability!;return this.db.transaction(async tx=>{const row=await this.fresh(tx,c),f=await one<Row>(tx,`SELECT f.* FROM app.evidence ev JOIN app.files f ON f.school_id=ev.school_id AND f.id=ev.file_id WHERE ev.school_id=$1 AND ev.participant_id=$2 AND f.id=$3 AND f.status='READY'`,[p.schoolId,row.participant_id,id(c.params.fileId)]);if(!f)notFound();return {data:null,binary:{stream:createReadStream(objectPath(p.schoolId,String(f.object_key))),contentType:String(f.content_type),filename:String(f.original_name),byteSize:Number(f.byte_size)}};},{schoolId:p.schoolId,readOnly:true});}
 private async reminders(c:RequestContext):Promise<Result>{return this.db.transaction(async tx=>{
  await this.policy.require(tx,c.principal!,'activity.manage',{schoolId:c.params.schoolId!,classId:c.params.classId!});
  const rows=(await tx.query<Row>(`SELECT p.id,st.full_name,a.title,a.due_at,c.name AS class_name,p.status,count(ev.id)::int AS file_count,max(ev.created_at) AS last_submission FROM app.activity_participants p JOIN app.activities a ON a.school_id=p.school_id AND a.id=p.activity_id JOIN app.enrollments e ON e.school_id=p.school_id AND e.id=p.enrollment_id JOIN app.students st ON st.school_id=e.school_id AND st.id=e.student_id JOIN app.classes c ON c.school_id=p.school_id AND c.id=p.class_id LEFT JOIN app.evidence ev ON ev.school_id=p.school_id AND ev.participant_id=p.id WHERE p.school_id=$1 AND p.class_id=$2 AND p.activity_id=$3 AND p.cancelled_at IS NULL GROUP BY p.id,st.full_name,a.title,a.due_at,c.name ORDER BY st.full_name`,[c.params.schoolId,c.params.classId,id(c.query.activityId)])).rows;return {data:rows};
 },{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true});}
}
