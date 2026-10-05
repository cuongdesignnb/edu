import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { Database,one,iso,type Row,type Transaction } from '../../database/database';
import { dto,getResource,resource,listResource,type Resource } from '../../database/resources';
import { Permissions,grantAllows } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,notFound,validation } from '../../common/problem';
import { PublicationsService,type ParentItem } from '../publications/publications.service';
import { FilesService } from '../files/files.service';
import { notify } from '../notifications/notify';
import type { Handler,RequestContext,Result } from '../../api.router';
import {activityWorkspace,activityWorkspaceAccess} from './activity-workspace';
import {canonical} from '../../common/commands';

const meta={id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at'};
const activity:Resource={table:'app.activities',fields:{...meta,classId:'class_id',yearId:'year_id',title:'title',description:'description',dueAt:'due_at',startsAt:'starts_at',maxFiles:'max_files',evidenceRequired:'evidence_required',status:'status',dataVersion:'data_version',assignedAt:'assigned_at',illustration:'illustration'},writeFields:[],search:['title','description'],filters:{status:'status'}};
const participant:Resource={table:'app.activity_participants',fields:{...meta,activityId:'activity_id',enrollmentId:'enrollment_id',status:'status',reviewNote:'review_note',cancelledAt:'cancelled_at'},writeFields:[],search:[],filters:{status:'status'}};
const evidence:Resource={table:'app.evidence',fields:{...meta,participantId:'participant_id',fileId:'file_id',submittedBy:'submitted_by',caption:'caption',status:'status',reviewReason:'review_reason',shareWithGuardian:'share_with_guardian'},writeFields:[],search:['caption'],filters:{status:'status',participantId:'participant_id'}};
function cleanDto(r:Resource,row:Row){const value=dto(r,row);for(const key of ['reviewNote','caption','reviewReason'])if(value[key]===null)delete value[key];return value;}
function version(row:Row,expected:unknown,source=false){const n=Number(source?row.data_version:row.version);if(n!==expected)throw new Problem(409,source?'STALE_SOURCE':'VERSION_CONFLICT',undefined,n);}
@Injectable()
export class ActivitiesService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly publications:PublicationsService,private readonly files:FilesService){}
  handlers():Record<string,Handler>{return {...Object.fromEntries(['listActivities','createActivity','getActivity','updateActivity','listParticipants','setParticipantStatus','assignActivity','publishActivity','listEvidence','createEvidence','reviewEvidence'].map(id=>[id,(c:RequestContext)=>this.handle(c)])),getClassActivitiesWorkspace:c=>this.db.transaction(async tx=>({data:await activityWorkspace(tx,this.policy,c)}),{schoolId:c.params.schoolId,userId:c.principal!.userId,readOnly:true}),saveActivityWorkspace:c=>this.workspaceCommand(c),reviewEvidenceBatch:c=>this.workspaceCommand(c),setActivityParticipantStatuses:c=>this.workspaceCommand(c)};}
  private async workspaceCommand(c:RequestContext):Promise<Result>{
    const permission=c.operation.id==='reviewEvidenceBatch'?'evidence.review':c.operation.id==='setActivityParticipantStatuses'?'activity.review':c.body.action==='publish'?'activity.publish':'activity.manage';
    const authorize=(tx:Transaction)=>activityWorkspaceAccess(tx,this.policy,c,permission);
    return this.commands.execute(c,authorize,async tx=>{
      await authorize(tx);
      const invoke=(id:string,permission:string,body:Row,params:Record<string,string>={})=>this.handle({...c,operation:{...c.operation,id,permission,method:id==='updateActivity'?'PATCH':'POST'},body,params:{...c.params,...params}},tx);
      if(c.operation.id==='reviewEvidenceBatch'||c.operation.id==='setActivityParticipantStatuses'){
        const items=c.body.items as {id:string;expectedVersion:number}[];if(!items.length||items.length>200||new Set(items.map(i=>i.id)).size!==items.length)validation('items','Chọn 1–200 đối tượng không trùng');
        for(const item of items){if(c.operation.id==='reviewEvidenceBatch')await invoke('reviewEvidence','evidence.review',{expectedVersion:item.expectedVersion,decision:c.body.decision,reason:c.body.reason,shareWithGuardian:c.body.shareWithGuardian},{evidenceId:item.id});
          else await invoke('setParticipantStatus','activity.review',{expectedVersion:item.expectedVersion,status:c.body.status,reason:c.body.reason},{activityId:String(c.body.activityId),participantId:item.id});}
        return {data:{count:items.length}};
      }
      const source=c.body.source as Row|null,action=String(c.body.action);let row:Row|undefined;
      if(source){row=await this.activity(tx,c,String(source.id),true);const pub=await one<Row>(tx,"SELECT id FROM app.publication_revisions WHERE school_id=$1 AND activity_id=$2 AND status='PUBLISHED'",[c.params.schoolId,row.id]);if(canonical(source)!==canonical({id:row.id,version:Number(row.version),dataVersion:Number(row.data_version),publicationId:pub?.id??null}))throw new Problem(409,'ACTIVITY_SOURCE_CHANGED');}
      if(action==='draft'||action==='save'||action==='assign'){
        const input=c.body.input as Row;if(!input)validation('input','Thiếu nội dung hoạt động');
        const result=await invoke(row?'updateActivity':'createActivity','activity.manage',{...input,...(row?{expectedVersion:Number(row.version)}:{})},row?{activityId:String(row.id)}:{});
        row=await this.activity(tx,c,String((result.data as Row).id),true);
        if(action==='assign'&&row.status==='DRAFT'){await invoke('assignActivity','activity.manage',{expectedVersion:Number(row.version)},{activityId:String(row.id)});row=await this.activity(tx,c,String(row.id));}
      }else{
        if(!row)notFound();
        if(action==='publish')await invoke('publishActivity','activity.publish',{expectedSourceVersion:Number(row.data_version),expectedPublicationId:source!.publicationId},{activityId:String(row.id)});
        else await invoke('updateActivity','activity.manage',{expectedVersion:Number(row.version),status:action==='close'?'CLOSED':'ASSIGNED'},{activityId:String(row.id)});
      }
      const workspace=await activityWorkspace(tx,this.policy,c),saved=workspace.activities.find(a=>a.id===row!.id);if(!saved)notFound();return {data:saved};
    });
  }
  private async context(tx:Transaction,c:RequestContext){
    const schoolId=c.params.schoolId!,classId=c.params.classId!,access=await this.policy.require(tx,c.principal!,c.operation.permission,{schoolId,classId,allowSubject:c.operation.permission==='activity.read'});
    const cls=await getResource(tx,resource('class'),schoolId,classId),year=await getResource(tx,resource('year'),schoolId,String(cls.year_id));
    if(c.operation.method!=='GET'&&(cls.status==='ARCHIVED'||year.status==='ARCHIVED'))throw new Problem(409,'YEAR_ARCHIVED');
    return {schoolId,classId,cls,year,...access};
  }
  private async activity(tx:Transaction,c:RequestContext,id:string,lock=false){const row=await one<Row>(tx,`SELECT * FROM app.activities WHERE school_id=$1 AND class_id=$2 AND id=$3${lock?' FOR UPDATE':''}`,[c.params.schoolId,c.params.classId,id]);if(!row)notFound();return row;}
  private async counts(tx:Transaction,row:Row){const count=await one<{n:number;approved:number}>(tx,"SELECT count(*)::int AS n,count(*) FILTER(WHERE status='APPROVED')::int AS approved FROM app.activity_participants WHERE school_id=$1 AND activity_id=$2 AND cancelled_at IS NULL",[row.school_id,row.id]);return {...cleanDto(activity,row),participantCount:count!.n,approvedCount:count!.approved};}
  private async roster(tx:Transaction,c:RequestContext,ids:string[],today:string){
    if(!ids.length||ids.length>200||new Set(ids).size!==ids.length)validation('enrollmentIds','Chọn 1–200 học sinh, không trùng');
    for(const id of ids)if(!await one(tx,"SELECT id FROM app.enrollments WHERE school_id=$1 AND class_id=$2 AND id=$3 AND status<>'CANCELLED' AND starts_on<=$4 AND (ends_on IS NULL OR ends_on>$4)",[c.params.schoolId,c.params.classId,id,today]))validation('enrollmentIds','Học sinh không thuộc lớp trong ngày giao');
  }
  private async due(tx:Transaction,c:RequestContext,value:unknown,year:Row,today:string){
    const date=new Date(String(value));if(!Number.isFinite(date.getTime())||date.getTime()<Date.now())validation('dueAt','Hạn hoàn thành từ hôm nay và thuộc năm học');
    const day=(await one<{day:string}>(tx,'SELECT ($2::timestamptz AT TIME ZONE timezone)::date AS day FROM platform.schools WHERE id=$1',[c.params.schoolId,value]))!.day;
    if(day<String(year.starts_on)||day>=String(year.ends_on)||day<today)validation('dueAt','Hạn hoàn thành từ hôm nay và thuộc năm học');
  }
  private async handle(c:RequestContext,existingTx?:Transaction):Promise<Result>{
    const authorize=(tx:Transaction)=>this.context(tx,c),work=async(tx:Transaction):Promise<Result>=>{
      const ctx=await authorize(tx),op=c.operation.id;
      const canDraft=ctx.grants.some(g=>grantAllows(g,'activity.manage',{schoolId:ctx.schoolId,classId:ctx.classId},ctx.today));
      if(op==='listActivities'){
        const result=await listResource(tx,activity,ctx.schoolId,c.query,{sql:`t.class_id=$1${canDraft?'':" AND t.status<>'DRAFT'"}`,values:[ctx.classId]},c.principal!.userId);
        const data=[];for(const item of result.data)data.push(await this.counts(tx,await this.activity(tx,c,String(item.id))));return {...result,data};
      }
      if(op==='listEvidence')return listResource(tx,evidence,ctx.schoolId,c.query,{sql:`EXISTS(SELECT 1 FROM app.activity_participants p JOIN app.activities a ON a.school_id=p.school_id AND a.id=p.activity_id WHERE p.school_id=t.school_id AND p.id=t.participant_id AND p.class_id=$1${c.query.activityId?' AND p.activity_id=$2':''}${canDraft?'':" AND a.status<>'DRAFT'"})`,values:c.query.activityId?[ctx.classId,c.query.activityId]:[ctx.classId]},c.principal!.userId).then(result=>({...result,data:result.data.map(value=>{for(const key of ['caption','reviewReason'])if(value[key]===null)delete value[key];return value;})}));
      if(op==='createActivity'){
        await this.due(tx,c,c.body.dueAt,ctx.year,ctx.today);await this.roster(tx,c,c.body.enrollmentIds as string[],ctx.today);
        if(c.body.startsAt&&new Date(String(c.body.startsAt))>=new Date(String(c.body.dueAt)))validation('startsAt','Ngày bắt đầu phải trước hạn hoàn thành');
        const row=(await one<Row>(tx,'INSERT INTO app.activities(school_id,class_id,year_id,title,description,due_at,evidence_required,created_by,illustration,starts_at,max_files) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[ctx.schoolId,ctx.classId,ctx.year.id,c.body.title,c.body.description,c.body.dueAt,c.body.evidenceRequired,c.principal!.userId,c.body.illustration??'heart',c.body.startsAt??null,c.body.maxFiles??5]))!;
        for(const id of c.body.enrollmentIds as string[])await tx.query('INSERT INTO app.activity_participants(school_id,class_id,activity_id,enrollment_id) VALUES($1,$2,$3,$4)',[ctx.schoolId,ctx.classId,row.id,id]);
        await audit(tx,c,'activity',String(row.id),{participantCount:(c.body.enrollmentIds as string[]).length});return {data:await this.counts(tx,await this.activity(tx,c,String(row.id))),status:201};
      }
      let evidenceRow:Row|undefined,participantRow:Row|undefined,aid=c.params.activityId;
      if(op==='reviewEvidence'){
        evidenceRow=await one<Row>(tx,`SELECT ev.* FROM app.evidence ev JOIN app.activity_participants p ON p.school_id=ev.school_id AND p.id=ev.participant_id WHERE ev.school_id=$1 AND p.class_id=$2 AND ev.id=$3 FOR UPDATE OF ev`,[ctx.schoolId,ctx.classId,c.params.evidenceId])??undefined;if(!evidenceRow)notFound();
      }
      if(op==='createEvidence'||op==='reviewEvidence'){
        participantRow=await one<Row>(tx,'SELECT * FROM app.activity_participants WHERE school_id=$1 AND class_id=$2 AND id=$3 AND cancelled_at IS NULL FOR UPDATE',[ctx.schoolId,ctx.classId,evidenceRow?.participant_id??c.body.participantId])??undefined;if(!participantRow)notFound();aid=String(participantRow.activity_id);
      }
      const row=await this.activity(tx,c,aid!,c.operation.method!=='GET');if(row.status==='DRAFT'&&!canDraft)notFound();
      if(op==='getActivity')return {data:await this.counts(tx,row)};
      if(op==='listParticipants')return listResource(tx,participant,ctx.schoolId,c.query,{sql:'t.class_id=$1 AND t.activity_id=$2 AND t.cancelled_at IS NULL',values:[ctx.classId,row.id]},c.principal!.userId).then(result=>({...result,data:result.data.map(value=>{if(value.reviewNote===null)delete value.reviewNote;return value;})}));
      if(row.status==='ARCHIVED')throw new Problem(409,'ACTIVITY_ARCHIVED');
      if(op==='updateActivity'){
        version(row,c.body.expectedVersion);if(c.body.dueAt)await this.due(tx,c,c.body.dueAt,ctx.year,ctx.today);
        const start=Object.hasOwn(c.body,'startsAt')?c.body.startsAt:row.starts_at;
        if(start&&new Date(String(start))>=new Date(String(c.body.dueAt??row.due_at)))validation('startsAt','Ngày bắt đầu phải trước hạn hoàn thành');
        if(c.body.maxFiles&&await one(tx,'SELECT participant_id FROM app.evidence WHERE school_id=$1 AND participant_id IN (SELECT id FROM app.activity_participants WHERE school_id=$1 AND activity_id=$2) GROUP BY participant_id HAVING count(*)>$3 LIMIT 1',[ctx.schoolId,row.id,c.body.maxFiles]))validation('maxFiles','Không giảm giới hạn dưới số tệp đã nộp');
        if(c.body.status==='DRAFT'||(c.body.status==='CLOSED'&&row.status==='DRAFT'))throw new Problem(409,'INVALID_STATE');
        if(c.body.status==='ASSIGNED'&&row.status==='DRAFT')throw new Problem(409,'ASSIGNMENT_REQUIRED');
        if(c.body.enrollmentIds){
          if(row.status==='CLOSED')throw new Problem(409,'ACTIVITY_CLOSED');const ids=c.body.enrollmentIds as string[];await this.roster(tx,c,ids,ctx.today);
          const removed=(await tx.query<Row>('SELECT * FROM app.activity_participants WHERE school_id=$1 AND activity_id=$2 AND cancelled_at IS NULL AND NOT(enrollment_id=ANY($3::uuid[]))',[ctx.schoolId,row.id,ids])).rows;
          for(const p of removed){if(p.status!=='ASSIGNED'||await one(tx,'SELECT id FROM app.evidence WHERE school_id=$1 AND participant_id=$2 LIMIT 1',[ctx.schoolId,p.id]))validation('enrollmentIds','Không bỏ học sinh đã có bài hoặc minh chứng');await tx.query('UPDATE app.activity_participants SET cancelled_at=now() WHERE school_id=$1 AND id=$2',[ctx.schoolId,p.id]);}
          for(const id of ids)await tx.query('INSERT INTO app.activity_participants(school_id,class_id,activity_id,enrollment_id) VALUES($1,$2,$3,$4) ON CONFLICT(school_id,activity_id,enrollment_id) DO UPDATE SET cancelled_at=NULL',[ctx.schoolId,ctx.classId,row.id,id]);
        }
        const fields:Record<string,string>={title:'title',description:'description',dueAt:'due_at',startsAt:'starts_at',maxFiles:'max_files',evidenceRequired:'evidence_required',illustration:'illustration',status:'status'},values:unknown[]=[ctx.schoolId,row.id],changes=[];
        for(const [key,col] of Object.entries(fields))if(Object.hasOwn(c.body,key)){values.push(c.body[key]);changes.push(`${col}=$${values.length}`);}if(changes.length)await tx.query(`UPDATE app.activities SET ${changes.join(',')} WHERE school_id=$1 AND id=$2`,values);
        await audit(tx,c,'activity',String(row.id));return {data:await this.counts(tx,await this.activity(tx,c,String(row.id)))};
      }
      if(op==='assignActivity'){
        version(row,c.body.expectedVersion);if(row.status!=='DRAFT')throw new Problem(409,'INVALID_STATE');await this.due(tx,c,iso(row.due_at as Date),ctx.year,ctx.today);
        const ids=(await tx.query<{enrollment_id:string}>('SELECT enrollment_id FROM app.activity_participants WHERE school_id=$1 AND activity_id=$2 AND cancelled_at IS NULL',[ctx.schoolId,row.id])).rows.map(p=>p.enrollment_id);await this.roster(tx,c,ids,ctx.today);
        await tx.query("UPDATE app.activities SET status='ASSIGNED',assigned_at=now() WHERE school_id=$1 AND id=$2",[ctx.schoolId,row.id]);await audit(tx,c,'activity',String(row.id),{status:'ASSIGNED'});return {data:await this.counts(tx,await this.activity(tx,c,String(row.id)))};
      }
      if(op==='publishActivity'){
        version(row,c.body.expectedSourceVersion,true);if(!['ASSIGNED','CLOSED'].includes(String(row.status)))throw new Problem(409,'INVALID_STATE');
        const participants=(await tx.query<Row>('SELECT p.*,e.student_id FROM app.activity_participants p JOIN app.enrollments e ON e.school_id=p.school_id AND e.id=p.enrollment_id WHERE p.school_id=$1 AND p.activity_id=$2 AND p.cancelled_at IS NULL ORDER BY p.id',[ctx.schoolId,row.id])).rows;
        if(!participants.length)throw new Problem(422,'EMPTY_PARTICIPANTS');const items:ParentItem[]=[],documents:{id:string;studentId:string;file:Row}[]=[];
        const at=new Date().toISOString();
        for(const p of participants){const docs=[];const shared=(await tx.query<Row>(`SELECT f.* FROM app.evidence ev JOIN app.files f ON f.school_id=ev.school_id AND f.id=ev.file_id WHERE ev.school_id=$1 AND ev.participant_id=$2 AND ev.status='APPROVED' AND ev.share_with_guardian AND f.status='READY' AND (f.expires_at IS NULL OR f.expires_at>now()) ORDER BY ev.id`,[ctx.schoolId,p.id])).rows;
          for(const file of shared){const id=crypto.randomUUID();documents.push({id,studentId:String(p.student_id),file});docs.push({id,title:String(file.original_name).slice(0,200),contentType:file.content_type,byteSize:Number(file.byte_size),downloadAllowed:true,publishedAt:at});}
          items.push({studentId:String(p.student_id),section:'activities',schema:'ParentActivity',payload:{id:row.id,title:row.title,description:row.description,dueAt:iso(row.due_at as Date),studentStatus:p.status,...(p.review_note?{publicReviewNote:p.review_note}:{}),documents:docs,publishedAt:at}});
        }
        const publication=await this.publications.create(tx,c,{kind:'ACTIVITY',id:String(row.id),schoolId:ctx.schoolId,classId:ctx.classId,yearId:String(ctx.year.id),version:Number(row.data_version)},{activity:await this.counts(tx,row)},items,true);
        // An unchanged-source replay returns the existing publication; its documents already exist.
        for(const doc of documents)if(!await one(tx,'SELECT id FROM app.parent_document_items WHERE school_id=$1 AND publication_id=$2 AND student_id=$3 AND file_id=$4',[ctx.schoolId,publication.id,doc.studentId,doc.file.id]))await tx.query('INSERT INTO app.parent_document_items(id,school_id,student_id,year_id,file_id,publication_id,title,published_at,download_allowed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)',[doc.id,ctx.schoolId,doc.studentId,ctx.year.id,doc.file.id,publication.id,String(doc.file.original_name).slice(0,200),publication.publishedAt]);
        return {data:publication};
      }
      if(row.status!=='ASSIGNED')throw new Problem(409,'ACTIVITY_CLOSED');
      if(op==='setParticipantStatus'){
        const p=await one<Row>(tx,'SELECT * FROM app.activity_participants WHERE school_id=$1 AND activity_id=$2 AND id=$3 AND cancelled_at IS NULL FOR UPDATE',[ctx.schoolId,row.id,c.params.participantId]);if(!p)notFound();version(p,c.body.expectedVersion);
        const status=String(c.body.status);if(['APPROVED','NEEDS_REVISION','EXCUSED'].includes(status)&&String(c.body.reason??'').trim().length<3)validation('reason','Cần lý do rà soát');
        if(status==='APPROVED'&&row.evidence_required&&!await one(tx,"SELECT id FROM app.evidence WHERE school_id=$1 AND participant_id=$2 AND status='APPROVED'",[ctx.schoolId,p.id]))throw new Problem(422,'APPROVED_EVIDENCE_REQUIRED');
        const saved=await one<Row>(tx,'UPDATE app.activity_participants SET status=$3,review_note=$4,reviewed_by=$5,reviewed_at=now() WHERE school_id=$1 AND id=$2 RETURNING *',[ctx.schoolId,p.id,status,c.body.reason??null,c.principal!.userId]);await audit(tx,c,'activity-participant',String(p.id),{status,activityId:row.id});return {data:cleanDto(participant,saved!)};
      }
      if(op==='createEvidence'){
        if(c.body.shareWithGuardian)validation('shareWithGuardian','Chỉ chia sẻ sau khi duyệt');const file=await this.files.authorizeFile(tx,ctx.schoolId,String(c.body.fileId),c.principal!.userId,'file.read');
        if(file.status!=='READY'||file.purpose!=='EVIDENCE'||file.upload_class_id!==ctx.classId||(file.expires_at&&new Date(file.expires_at as Date).getTime()<=Date.now()))throw new Problem(409,'FILE_UNAVAILABLE');
        const saved=await one<Row>(tx,'INSERT INTO app.evidence(school_id,participant_id,file_id,submitted_by,caption) VALUES($1,$2,$3,$4,$5) RETURNING *',[ctx.schoolId,participantRow!.id,file.id,c.principal!.userId,c.body.caption??null]);
        const owner=await one<{id:string}>(tx,"SELECT id FROM app.memberships WHERE school_id=$1 AND user_id=$2 AND status='ACTIVE' AND ended_at IS NULL",[ctx.schoolId,row.created_by]);if(owner)await notify(tx,{schoolId:ctx.schoolId,memberId:owner.id,classId:ctx.classId,kind:'task',title:'Đã nhận minh chứng hoạt động',body:String(row.title).slice(0,2000),targetType:'activity',targetId:String(row.id),requiredAction:'evidence.review',sourceKey:`evidence:${saved!.id}:submitted`});
        await tx.query("UPDATE app.activity_participants SET status='SUBMITTED',review_note=NULL,reviewed_by=NULL,reviewed_at=NULL WHERE school_id=$1 AND id=$2",[ctx.schoolId,participantRow!.id]);await audit(tx,c,'evidence',String(saved!.id),{activityId:row.id});return {data:cleanDto(evidence,saved!),status:201};
      }
      version(evidenceRow!,c.body.expectedVersion);if(String(c.body.reason??'').trim().length<3)validation('reason','Cần lý do duyệt minh chứng');
      const file=await this.files.authorizeFile(tx,ctx.schoolId,String(evidenceRow!.file_id),c.principal!.userId,'file.read');if(file.status!=='READY')throw new Problem(409,'FILE_UNAVAILABLE');
      const saved=await one<Row>(tx,'UPDATE app.evidence SET status=$3,reviewed_by=$4,reviewed_at=now(),review_reason=$5,share_with_guardian=$6 WHERE school_id=$1 AND id=$2 RETURNING *',[ctx.schoolId,evidenceRow!.id,c.body.decision,c.principal!.userId,c.body.reason,c.body.decision==='APPROVED'&&c.body.shareWithGuardian===true]);
      if(c.body.decision!=='APPROVED'||c.body.shareWithGuardian!==true)await tx.query('UPDATE app.parent_document_items SET revoked_at=now() WHERE school_id=$1 AND file_id=$2 AND revoked_at IS NULL',[ctx.schoolId,evidenceRow!.file_id]);
      const approved=await one(tx,"SELECT id FROM app.evidence WHERE school_id=$1 AND participant_id=$2 AND status='APPROVED' LIMIT 1",[ctx.schoolId,participantRow!.id]);
      const status=approved?'APPROVED':'NEEDS_REVISION';await tx.query('UPDATE app.activity_participants SET status=$3,review_note=$4,reviewed_by=$5,reviewed_at=now() WHERE school_id=$1 AND id=$2',[ctx.schoolId,participantRow!.id,status,c.body.reason,c.principal!.userId]);await audit(tx,c,'evidence',String(saved!.id),{activityId:row.id,status:saved!.status,shared:saved!.share_with_guardian});return {data:cleanDto(evidence,saved!)};
    };
    return existingTx?work(existingTx):c.operation.method==='GET'?this.db.transaction(work,{schoolId:c.params.schoolId}):this.commands.execute(c,authorize,work);
  }
}
