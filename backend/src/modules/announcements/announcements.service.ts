import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { Database,one,iso,type Row,type Transaction } from '../../database/database';
import { dto,getResource,resource,listResource,type Resource,type Predicate } from '../../database/resources';
import { Permissions,grantAllows } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,notFound,validation } from '../../common/problem';
import { operations,validateSchema } from '../../common/contract';
import { PublicationsService,type ParentItem,publicationDto } from '../publications/publications.service';
import { FilesService } from '../files/files.service';
import { announcementHtml } from './html';
import { notifyMany } from '../notifications/notify';
import type { Handler,RequestContext,ActorContext,Result } from '../../api.router';
import {announcementWorkspace,announcementWorkspaceCommand} from './announcement-workspace';
import {teacherAnnouncementFeed,markTeacherAnnouncementsRead} from './teacher-announcements';
import {publicAnnouncementWorkspace} from './public-announcements';

const r:Resource={table:'app.announcements',fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',rootId:'root_id',yearId:'year_id',classId:'class_id',title:'title',sanitizedHtml:'sanitized_html',status:'status',scheduledAt:'scheduled_at',dataVersion:'data_version',summary:'summary',audience:'audience',internalNote:'internal_note',discardedAt:'discarded_at'},writeFields:[],search:['title','summary'],filters:{status:'status',yearId:'year_id'}};
interface Audience {kind:'PUBLIC'|'SCHOOL'|'GRADE'|'CLASS'|'STUDENT'|'STAFF';id?:string}
interface ReadScope {predicate:Predicate;all:boolean;internal:boolean;classIds:string[];fullClassIds:string[];manageClassIds:string[];memberId:string;today:string}
const targetColumns:Record<string,string>={GRADE:'grade_id',CLASS:'class_id',STUDENT:'student_id',STAFF:'member_id'};
function version(row:Row,expected:unknown,source=false){const n=Number(source?row.data_version:row.version);if(n!==expected)throw new Problem(409,source?'STALE_SOURCE':'VERSION_CONFLICT',undefined,n);}
@Injectable()
export class AnnouncementsService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly publications:PublicationsService,private readonly files:FilesService){}
  handlers():Record<string,Handler>{return {...Object.fromEntries(['getPublicSchoolWorkspace','getPublicNewsWorkspace','downloadPublicNewsFile'].map(id=>[id,(c:RequestContext)=>publicAnnouncementWorkspace(this.db,c)])),getTeacherAnnouncementFeed:c=>teacherAnnouncementFeed(this.db,this,c),markTeacherAnnouncementsRead:c=>markTeacherAnnouncementsRead(this.commands,this,c),...Object.fromEntries(['listSchoolAnnouncements','listTeacherAnnouncements','createSchoolAnnouncement','getSchoolAnnouncement','updateSchoolAnnouncement','publishSchoolAnnouncement','scheduleSchoolAnnouncement','withdrawSchoolAnnouncement','listClassAnnouncements','createClassAnnouncement','getClassAnnouncement','updateClassAnnouncement','publishClassAnnouncement','scheduleClassAnnouncement','withdrawClassAnnouncement','getPublicSchool','getPublicAnnouncement'].map(id=>[id,(c:RequestContext)=>this.handle(c)])),...Object.fromEntries(['getAnnouncementDirectory','getClassAnnouncementDirectory','getAnnouncementWorkspaceDetail','getAnnouncementComposeWorkspace','estimateAnnouncementAudience'].map(id=>[id,(c:RequestContext)=>announcementWorkspace(this.db,this.policy,this,c)])),...Object.fromEntries(['saveAnnouncementWorkspace','publishAnnouncementWorkspace','withdrawAnnouncementWorkspace','discardAnnouncementWorkspace'].map(id=>[id,(c:RequestContext)=>announcementWorkspaceCommand(this.db,this.policy,this.commands,this,c)]))};}
  private async row(tx:Transaction,c:RequestContext,lock=false){const row=await one<Row>(tx,`SELECT * FROM app.announcements WHERE school_id=$1 AND id=$2${c.params.classId?' AND class_id=$3':''} AND discarded_at IS NULL${lock?' FOR UPDATE':''}`,c.params.classId?[c.params.schoolId,c.params.announcementId,c.params.classId]:[c.params.schoolId,c.params.announcementId]);if(!row)notFound();return row;}
  private async view(tx:Transaction,row:Row,includeInternal=true){
    const value=dto(r,row);if(value.internalNote===null||!includeInternal)delete value.internalNote;
    const targets=(await tx.query<Row>('SELECT * FROM app.announcement_targets WHERE school_id=$1 AND announcement_id=$2 ORDER BY id',[row.school_id,row.id])).rows;
    value.targets=targets.map(t=>({kind:t.audience_kind,...(targetColumns[String(t.audience_kind)]?{id:t[targetColumns[String(t.audience_kind)]!]}:{})}));
    value.fileIds=(await tx.query<{file_id:string}>('SELECT file_id FROM app.file_links WHERE school_id=$1 AND announcement_id=$2 ORDER BY id',[row.school_id,row.id])).rows.map(f=>f.file_id);
    if(row.status==='SCHEDULED'){const job=await one<Row>(tx,"SELECT status,last_error_code FROM app.outbox_events WHERE school_id=$1 AND kind='PUBLISH_ANNOUNCEMENT' AND payload->>'announcementId'=$2 ORDER BY created_at DESC,id DESC LIMIT 1",[row.school_id,row.id]);if(job){value.scheduleState=job.status;if(job.last_error_code)value.scheduleErrorCode=job.last_error_code;}}
    return value;
  }
  private async scope(tx:Transaction,c:ActorContext,row?:Row){
    const classId=(row?.class_id??c.params.classId) as string|undefined,schoolId=c.params.schoolId!;
    const access=await this.policy.require(tx,c.principal!,c.operation.permission,{schoolId,classId,allowSubject:c.operation.permission==='announcement.read'});
    const yearId=String(row?.year_id??c.body.yearId??''),year=yearId?await getResource(tx,resource('year'),schoolId,yearId):undefined;
    if(c.operation.method!=='GET'&&year?.status==='ARCHIVED')throw new Problem(409,'YEAR_ARCHIVED');
    if(classId){const cls=await getResource(tx,resource('class'),schoolId,classId);if(year&&cls.year_id!==year.id)validation('yearId','Năm học không khớp lớp');if(c.operation.method!=='GET'&&cls.status==='ARCHIVED')throw new Problem(409,'CLASS_ARCHIVED');}
    return {schoolId,classId,year,...access};
  }
  private async targets(tx:Transaction,c:ActorContext,yearId:string,classId:string|undefined,targets:Audience[],audience:string,today:string){
    if(!targets.length||new Set(targets.map(t=>`${t.kind}:${t.id??''}`)).size!==targets.length)validation('targets','Đối tượng nhận trống hoặc trùng');
    const pub=targets.some(t=>t.kind==='PUBLIC');if(pub&&(classId||audience==='STAFF'||targets.some(t=>!['PUBLIC','SCHOOL'].includes(t.kind))))validation('targets','Công khai chỉ cho thông báo toàn trường gửi gia đình');
    for(const t of targets){
      if(['PUBLIC','SCHOOL'].includes(t.kind)){if(t.id||classId)validation('targets','Thông báo lớp không gửi toàn trường/công khai');continue;}
      if(!t.id)validation('targets','Cần mã đối tượng nhận');
      if(t.kind==='GRADE'){if(classId||!await one(tx,"SELECT id FROM app.grade_levels WHERE school_id=$1 AND id=$2 AND status='ACTIVE'",[c.params.schoolId,t.id]))validation('targets','Khối ngoài phạm vi');}
      if(t.kind==='CLASS'){const cls=await one<Row>(tx,"SELECT * FROM app.classes WHERE school_id=$1 AND id=$2 AND year_id=$3 AND status='ACTIVE'",[c.params.schoolId,t.id,yearId]);if(!cls||(classId&&classId!==t.id))validation('targets','Lớp ngoài phạm vi');}
      if(t.kind==='STUDENT'){if(!await one(tx,`SELECT e.id FROM app.enrollments e WHERE e.school_id=$1 AND e.student_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4)${classId?' AND e.class_id=$5':''} LIMIT 1`,classId?[c.params.schoolId,t.id,yearId,today,classId]:[c.params.schoolId,t.id,yearId,today]))validation('targets','Học sinh ngoài phạm vi ngày công bố');}
      if(t.kind==='STAFF'){if(!await one(tx,`SELECT m.id FROM app.memberships m WHERE m.school_id=$1 AND m.id=$2 AND m.status='ACTIVE' AND m.ended_at IS NULL${classId?` AND EXISTS(SELECT 1 FROM app.teaching_assignments a WHERE a.school_id=m.school_id AND a.member_id=m.id AND a.class_id=$3 AND a.revoked_at IS NULL AND a.starts_on<=$4 AND (a.ends_on IS NULL OR a.ends_on>$4))`:''}`,classId?[c.params.schoolId,t.id,classId,today]:[c.params.schoolId,t.id]))validation('targets','Nhân sự ngoài phạm vi');}
    }
  }
  private async attach(tx:Transaction,c:ActorContext,classId:string|undefined,ids:string[],targets:Audience[]=[]){
    if(new Set(ids).size!==ids.length)validation('fileIds','Tệp bị trùng');
    for(const id of ids){const file=await this.files.authorizeFile(tx,c.params.schoolId!,id,c.principal!.userId,'file.read');if(file.status!=='READY'||file.purpose!=='CLASS_DOCUMENT'||(classId&&file.upload_class_id&&file.upload_class_id!==classId)||(file.expires_at&&new Date(file.expires_at as Date).getTime()<=Date.now()))validation('fileIds','Tệp chưa sẵn sàng hoặc ngoài phạm vi; không chia sẻ tệp minh chứng');
      const privateLinks=(await tx.query<{student_id:string}>('SELECT student_id FROM app.file_links WHERE school_id=$1 AND file_id=$2 AND student_id IS NOT NULL',[c.params.schoolId,id])).rows;
      if(privateLinks.length&&(targets.length!==1||targets[0]!.kind!=='STUDENT'||privateLinks.some(link=>targets[0]!.id!==link.student_id)))validation('fileIds','Tệp cá nhân chỉ dùng cho thông báo gửi đúng một học sinh được gắn với tệp');
    }
  }
  private async children(tx:Transaction,c:RequestContext,id:string,targets:Audience[],fileIds:string[]){
    await tx.query('DELETE FROM app.announcement_targets WHERE school_id=$1 AND announcement_id=$2',[c.params.schoolId,id]);await tx.query('DELETE FROM app.file_links WHERE school_id=$1 AND announcement_id=$2',[c.params.schoolId,id]);
    for(const t of targets)await tx.query(`INSERT INTO app.announcement_targets(school_id,announcement_id,audience_kind${targetColumns[t.kind]?','+targetColumns[t.kind]:''}) VALUES($1,$2,$3${targetColumns[t.kind]?',$4':''})`,targetColumns[t.kind]?[c.params.schoolId,id,t.kind,t.id]:[c.params.schoolId,id,t.kind]);
    for(const fileId of fileIds)await tx.query('INSERT INTO app.file_links(school_id,announcement_id,file_id,share_with_guardian) VALUES($1,$2,$3,true)',[c.params.schoolId,id,fileId]);
  }
  async readPredicate(tx:Transaction,c:RequestContext):Promise<ReadScope>{
    const schoolId=c.params.schoolId!,publishedOnly=c.operation.id==='listTeacherAnnouncements',scope=await this.policy.collection(tx,c.principal!,'announcement.read',schoolId,true);
    let classes=c.params.classId?[c.params.classId]:scope.classIds;
    if(publishedOnly){const self=await this.policy.collection(tx,c.principal!,'teacher.self',schoolId,true);let own=self.classIds;
      if(self.all)own=(await tx.query<{class_id:string}>(`SELECT DISTINCT a.class_id FROM app.teaching_assignments a JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id AND m.user_id=$2
        JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()) JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
        WHERE a.school_id=$1 AND a.revoked_at IS NULL AND a.starts_on<=$3 AND (a.ends_on IS NULL OR a.ends_on>$3)`,[schoolId,c.principal!.userId,self.today])).rows.map(a=>a.class_id);
      classes=scope.all?own:classes.filter(id=>own.includes(id));}
    if(c.params.classId)await this.policy.require(tx,c.principal!,'announcement.read',{schoolId,classId:c.params.classId,allowSubject:true});
    const member=(await one<{id:string}>(tx,"SELECT id FROM app.memberships WHERE school_id=$1 AND user_id=$2 AND status='ACTIVE' AND ended_at IS NULL",[schoolId,c.principal!.userId]))!;
    const manageAll=!publishedOnly&&scope.grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes('announcement.manage'));
    if(scope.all&&!c.params.classId&&!publishedOnly)return {all:true,internal:manageAll,classIds:[],fullClassIds:[],manageClassIds:[],memberId:member.id,today:scope.today,predicate:{sql:`t.discarded_at IS NULL AND NOT EXISTS(SELECT 1 FROM app.announcements newer WHERE newer.school_id=t.school_id AND newer.root_id=t.root_id AND newer.discarded_at IS NULL AND (newer.created_at,newer.id)>(t.created_at,t.id))`,values:[]}};
    const full=classes.filter(classId=>scope.grants.some(g=>grantAllows(g,'announcement.read',{schoolId,classId},scope.today))),manage=publishedOnly?[]:classes.filter(classId=>scope.grants.some(g=>grantAllows(g,'announcement.manage',{schoolId,classId},scope.today)));
    return {all:false,internal:manageAll,classIds:classes,fullClassIds:full,manageClassIds:manage,memberId:member.id,today:scope.today,predicate:{sql:`t.discarded_at IS NULL AND (
      (t.class_id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM app.announcements newer WHERE newer.school_id=t.school_id AND newer.root_id=t.root_id AND newer.discarded_at IS NULL AND (newer.created_at,newer.id)>(t.created_at,t.id))) OR
      (EXISTS(SELECT 1 FROM app.publication_revisions p WHERE p.school_id=t.school_id AND p.announcement_id=t.id AND p.status='PUBLISHED') AND (t.audience<>'FAMILIES' OR cardinality($3::uuid[])>0) AND EXISTS(
       SELECT 1 FROM app.announcement_targets target WHERE target.school_id=t.school_id AND target.announcement_id=t.id AND (target.audience_kind IN ('PUBLIC','SCHOOL')
        OR (target.audience_kind='STAFF' AND target.member_id=$4)
        OR (target.audience_kind='CLASS' AND target.class_id=ANY(CASE WHEN t.audience='FAMILIES' THEN $3::uuid[] ELSE $2::uuid[] END))
        OR (target.audience_kind='GRADE' AND EXISTS(SELECT 1 FROM app.classes cls WHERE cls.school_id=t.school_id AND cls.id=ANY(CASE WHEN t.audience='FAMILIES' THEN $3::uuid[] ELSE $2::uuid[] END) AND cls.grade_level_id=target.grade_id AND cls.year_id=t.year_id))
        OR (target.audience_kind='STUDENT' AND EXISTS(SELECT 1 FROM app.enrollments e WHERE e.school_id=t.school_id AND e.student_id=target.student_id AND e.class_id=ANY($3::uuid[]) AND e.year_id=t.year_id AND e.status<>'CANCELLED' AND e.starts_on<=$5 AND (e.ends_on IS NULL OR e.ends_on>$5)))))))`,values:[manage,classes,full,member.id,scope.today]}};
  }
  async readView(tx:Transaction,row:Row,read:ReadScope){
    const manages=read.internal||read.manageClassIds.includes(String(row.class_id)),value=await this.view(tx,row,manages);
    if(read.all||manages)return value;
    const cls=(await tx.query<Row>('SELECT id,grade_level_id FROM app.classes WHERE school_id=$1 AND id=ANY($2::uuid[])',[row.school_id,read.classIds])).rows;
    const students=(await tx.query<{student_id:string}>("SELECT DISTINCT student_id FROM app.enrollments WHERE school_id=$1 AND class_id=ANY($2::uuid[]) AND year_id=$3 AND status<>'CANCELLED' AND starts_on<=$4 AND (ends_on IS NULL OR ends_on>$4)",[row.school_id,read.fullClassIds,row.year_id,read.today])).rows;
    value.targets=(value.targets as Audience[]).filter(t=>['PUBLIC','SCHOOL'].includes(t.kind)||(t.kind==='STAFF'&&t.id===read.memberId)||(t.kind==='CLASS'&&read.classIds.includes(t.id!))||(t.kind==='GRADE'&&cls.some(c=>c.grade_level_id===t.id))||(t.kind==='STUDENT'&&students.some(s=>s.student_id===t.id)));
    return value;
  }
  private async cancelJobs(tx:Transaction,schoolId:string,id:string,preserveLease=false){await tx.query(`UPDATE app.outbox_events SET status='CANCELLED',lease_owner=NULL,lease_until=NULL WHERE school_id=$1 AND kind='PUBLISH_ANNOUNCEMENT' AND payload->>'announcementId'=$2 AND status IN (${preserveLease?"'PENDING','FAILED'":"'PENDING','FAILED','LEASED'"})`,[schoolId,id]);}
  private async handle(c:RequestContext):Promise<Result>{
    if(c.operation.id.startsWith('getPublic'))return this.public(c);
    const schoolId=c.params.schoolId!,op=c.operation.id;
    const authorize=async(tx:Transaction)=>c.operation.method==='GET'?this.readPredicate(tx,c):this.scope(tx,c,op.startsWith('create')?undefined:await this.row(tx,c));
    const work=(tx:Transaction)=>this.applyInTransaction(tx,c);
    return c.operation.method==='GET'?this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId}):this.commands.execute(c,authorize,work);
  }
  async validateWorkspaceTargets(tx:Transaction,c:ActorContext,yearId:string,classId:string|undefined,targets:Audience[],audience:string,today:string){return this.targets(tx,c,yearId,classId,targets,audience,today);}
  async workspaceFiles(tx:Transaction,c:RequestContext,classId?:string){
    const schoolId=c.params.schoolId!,access=await this.policy.collection(tx,c.principal!,'file.read',schoolId,true),family=access.classIds.filter(id=>access.grants.some(g=>grantAllows(g,'guardian.read',{schoolId,classId:id},access.today)));
    const rows=(await tx.query<Row>(`SELECT f.id,f.original_name,f.content_type,f.byte_size,f.version,f.upload_class_id,EXISTS(SELECT 1 FROM app.file_links l WHERE l.school_id=f.school_id AND l.file_id=f.id AND l.student_id IS NOT NULL) AS private
      FROM app.files f WHERE f.school_id=$1 AND f.purpose='CLASS_DOCUMENT' AND f.status='READY' AND (f.expires_at IS NULL OR f.expires_at>now()) AND ($6::uuid IS NULL OR f.upload_class_id IS NULL OR f.upload_class_id=$6)
      AND ($7::boolean OR (f.uploaded_by=$2 AND f.upload_class_id=ANY($3::uuid[])) OR EXISTS(SELECT 1 FROM app.file_links l LEFT JOIN app.activities a ON a.school_id=l.school_id AND a.id=l.activity_id LEFT JOIN app.announcements n ON n.school_id=l.school_id AND n.id=l.announcement_id
       WHERE l.school_id=f.school_id AND l.file_id=f.id AND (l.class_id=ANY($3::uuid[]) OR a.class_id=ANY($3::uuid[]) OR n.class_id=ANY($3::uuid[]) OR EXISTS(SELECT 1 FROM app.enrollments e WHERE e.school_id=l.school_id AND e.student_id=l.student_id AND e.class_id=ANY($5::uuid[]) AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4)))))
      AND NOT EXISTS(SELECT 1 FROM app.file_links l WHERE l.school_id=f.school_id AND l.file_id=f.id AND l.student_id IS NOT NULL AND ($6::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM app.enrollments e WHERE e.school_id=l.school_id AND e.student_id=l.student_id AND e.class_id=$6 AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4))))
      ORDER BY f.original_name,f.id LIMIT 1001`,[schoolId,c.principal!.userId,access.classIds,access.today,family,classId??null,access.all])).rows;
    if(rows.length>1000)throw new Problem(422,'ANNOUNCEMENT_WORKSPACE_LIMIT');return rows.map(f=>({id:f.id,name:f.original_name,mime:f.content_type,size:Number(f.byte_size),version:Number(f.version),share:f.private?'student_parent':f.upload_class_id?'class_parent':'school_parent'}));
  }
  /** Internal use: native composer/discard/schedule and publish share one school-locked transaction. */
  async applyInTransaction(tx:Transaction,c:RequestContext):Promise<Result>{
      const schoolId=c.params.schoolId!,op=c.operation.id,list=op.startsWith('list');
      if(list){const read=await this.readPredicate(tx,c),result=await listResource(tx,r,schoolId,c.query,read.predicate,c.principal!.userId),data=[];for(const item of result.data){const row=await one<Row>(tx,'SELECT * FROM app.announcements WHERE school_id=$1 AND id=$2',[schoolId,item.id]);data.push(await this.readView(tx,row!,read));}return {...result,data};}
      let row=op.startsWith('create')?undefined:await this.row(tx,c,c.operation.method!=='GET');
      if(op.startsWith('get')){const read=await this.readPredicate(tx,c);const filtered=await listResource(tx,r,schoolId,{limit:'1'},{sql:`t.id=$1 AND (${read.predicate.sql.replace(/\$(\d+)/g,(_,n)=>'$'+(Number(n)+1))})`,values:[row!.id,...read.predicate.values]},c.principal!.userId);if(!filtered.data.length)notFound();return {data:await this.readView(tx,row!,read)};}
      const ctx=await this.scope(tx,c,row);
      if(op.startsWith('create')||op.startsWith('update')){
        if(row){version(row,c.body.expectedVersion);if(row.status==='WITHDRAWN')throw new Problem(409,'INVALID_STATE');}
        if(c.body.discard===true){
          if(!row||row.status!=='DRAFT')throw new Problem(409,'INVALID_STATE');
          await this.cancelJobs(tx,schoolId,String(row.id));row=(await one<Row>(tx,'UPDATE app.announcements SET discarded_at=now() WHERE school_id=$1 AND id=$2 RETURNING *',[schoolId,row.id]))!;await audit(tx,c,'announcement',String(row.id),{discarded:true});return {data:await this.view(tx,row)};
        }
        if(c.body.classId&&c.body.classId!==ctx.classId)validation('classId','Lớp không khớp đường dẫn');
        const previous=row?await this.view(tx,row):undefined,targets=(c.body.targets??previous?.targets) as Audience[],fileIds=(c.body.fileIds??previous?.fileIds??[]) as string[],audience=String(c.body.audience??row?.audience??'ALL');
        await this.targets(tx,c,String(ctx.year!.id),ctx.classId,targets,audience,ctx.today);await this.attach(tx,c,ctx.classId,fileIds,targets);
        const html=announcementHtml(String(c.body.sanitizedHtml??row?.sanitized_html??''));
        if(row?.status==='SCHEDULED'){await this.cancelJobs(tx,schoolId,String(row.id));await tx.query("UPDATE app.announcements SET status='DRAFT' WHERE school_id=$1 AND id=$2",[schoolId,row.id]);}
        if(!row||row.status==='PUBLISHED'){
          const id=crypto.randomUUID();row=(await one<Row>(tx,`INSERT INTO app.announcements(id,school_id,year_id,class_id,root_id,title,sanitized_html,summary,audience,internal_note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[id,schoolId,ctx.year!.id,ctx.classId??null,row?.root_id??id,c.body.title??row?.title,html,c.body.summary??row?.summary??'',audience,c.body.internalNote??row?.internal_note??null,c.principal!.userId]))!;
        }else row=(await one<Row>(tx,'UPDATE app.announcements SET title=$3,sanitized_html=$4,summary=$5,audience=$6,internal_note=$7 WHERE school_id=$1 AND id=$2 RETURNING *',[schoolId,row.id,c.body.title??row.title,html,c.body.summary??row.summary,audience,c.body.internalNote??row.internal_note]))!;
        await this.children(tx,c,String(row.id),targets,fileIds);row=await this.row(tx,{...c,params:{...c.params,announcementId:String(row.id)}});await audit(tx,c,'announcement',String(row.id),{rootId:row.root_id,status:'DRAFT'});return {data:await this.view(tx,row),status:op.startsWith('create')?201:200};
      }
      if(op.startsWith('withdraw')){
        version(row!,c.body.expectedVersion);if(!['PUBLISHED','SCHEDULED'].includes(String(row!.status)))throw new Problem(409,'INVALID_STATE');await this.cancelJobs(tx,schoolId,String(row!.id));
        await tx.query("UPDATE app.publication_revisions p SET status='WITHDRAWN',withdrawn_at=now() FROM app.announcements a WHERE a.school_id=p.school_id AND a.id=p.announcement_id AND a.school_id=$1 AND a.root_id=$2 AND p.status='PUBLISHED'",[schoolId,row!.root_id]);
        row=(await one<Row>(tx,"UPDATE app.announcements SET status='WITHDRAWN' WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,row!.id]))!;await audit(tx,c,'announcement',String(row.id),{status:'WITHDRAWN'});return {data:await this.view(tx,row)};
      }
      if(op.startsWith('schedule')){
        version(row!,c.body.expectedVersion);if(!['DRAFT','SCHEDULED'].includes(String(row!.status))||new Date(String(c.body.scheduledAt)).getTime()<=Date.now())validation('scheduledAt','Chọn bản nháp và thời điểm sau hiện tại');
        await this.targets(tx,c,String(ctx.year!.id),ctx.classId,(await this.view(tx,row!)).targets as Audience[],String(row!.audience),ctx.today);await this.cancelJobs(tx,schoolId,String(row!.id));
        row=(await one<Row>(tx,"UPDATE app.announcements SET status='SCHEDULED',scheduled_at=$3 WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,row!.id,c.body.scheduledAt]))!;
        await tx.query("INSERT INTO app.outbox_events(school_id,kind,dedupe_key,payload,run_after) VALUES($1,'PUBLISH_ANNOUNCEMENT',$2,$3,$4)",[schoolId,`announcement:${row.id}:${row.version}`,{announcementId:row.id,userId:c.principal!.userId,sourceVersion:row.data_version},row.scheduled_at]);await audit(tx,c,'announcement',String(row.id),{status:'SCHEDULED'});return {data:await this.view(tx,row)};
      }
      return {data:await this.publish(tx,c,row!)};
  }
  private async publish(tx:Transaction,c:ActorContext,row:Row,preserveLease=false){
    const ctx=await this.scope(tx,c,row);version(row,c.body.expectedSourceVersion,true);
    const current=await one<Row>(tx,"SELECT p.* FROM app.publication_revisions p JOIN app.announcements a ON a.school_id=p.school_id AND a.id=p.announcement_id WHERE a.school_id=$1 AND a.root_id=$2 AND p.status='PUBLISHED' FOR UPDATE OF p",[ctx.schoolId,row.root_id]);
    if(Object.hasOwn(c.body,'expectedPublicationId')&&(c.body.expectedPublicationId??null)!==(current?.id??null))throw new Problem(409,'PUBLICATION_CONFLICT');
    if(row.status==='PUBLISHED'&&current&&current.announcement_id===row.id&&current.source_version===row.data_version)return publicationDto(current);
    if(!['DRAFT','SCHEDULED'].includes(String(row.status)))throw new Problem(409,'INVALID_STATE');
    const view=await this.view(tx,row),targets=view.targets as Audience[],fileIds=view.fileIds as string[];await this.targets(tx,c,String(ctx.year!.id),ctx.classId,targets,String(row.audience),ctx.today);await this.attach(tx,c,ctx.classId,fileIds,targets);
    if(announcementHtml(String(row.sanitized_html))!==row.sanitized_html)throw new Problem(422,'UNSAFE_ANNOUNCEMENT');
    const students=row.audience==='STAFF'?[]:(await tx.query<{student_id:string}>(`SELECT DISTINCT e.student_id FROM app.enrollments e JOIN app.classes cls ON cls.school_id=e.school_id AND cls.id=e.class_id
      WHERE e.school_id=$1 AND e.year_id=$2 AND e.status<>'CANCELLED' AND e.starts_on<=$3 AND (e.ends_on IS NULL OR e.ends_on>$3) AND cls.status='ACTIVE' AND EXISTS(
       SELECT 1 FROM app.announcement_targets target WHERE target.school_id=e.school_id AND target.announcement_id=$4 AND (target.audience_kind IN ('PUBLIC','SCHOOL') OR (target.audience_kind='GRADE' AND target.grade_id=cls.grade_level_id) OR (target.audience_kind='CLASS' AND target.class_id=e.class_id) OR (target.audience_kind='STUDENT' AND target.student_id=e.student_id))) ORDER BY e.student_id`,[ctx.schoolId,ctx.year!.id,ctx.today,row.id])).rows;
    if(students.length>20000)throw new Problem(422,'PROJECTION_LIMIT');
    const files=(await tx.query<Row>('SELECT * FROM app.files WHERE school_id=$1 AND id=ANY($2::uuid[]) ORDER BY id',[ctx.schoolId,fileIds])).rows;
    const at=new Date().toISOString(),sender=ctx.classId?String((await getResource(tx,resource('class'),ctx.schoolId,ctx.classId)).name):String((await one<Row>(tx,'SELECT name FROM platform.schools WHERE id=$1',[ctx.schoolId]))!.name);
    const base={id:row.root_id,title:row.title,sanitizedHtml:row.sanitized_html,publishedAt:at,senderLabel:sender},items:ParentItem[]=[],documents:{id:string;studentId:string;file:Row}[]=[];
    for(const student of students){const docs=files.map(file=>{const id=crypto.randomUUID();documents.push({id,studentId:student.student_id,file});return {id,title:String(file.original_name).slice(0,200),contentType:file.content_type,byteSize:Number(file.byte_size),downloadAllowed:true,publishedAt:at};});items.push({studentId:student.student_id,section:'announcements',schema:'ParentAnnouncement',payload:{...base,documents:docs}});}
    const publicPayload=targets.some(t=>t.kind==='PUBLIC')?{...base,documents:files.map(file=>({id:file.id,title:String(file.original_name).slice(0,200),contentType:file.content_type,byteSize:Number(file.byte_size),downloadAllowed:false,publishedAt:at}))}:undefined;if(publicPayload)validateSchema('ParentAnnouncement',publicPayload,true);
    if(current)await tx.query("UPDATE app.publication_revisions SET status='SUPERSEDED' WHERE school_id=$1 AND id=$2",[ctx.schoolId,current.id]);
    await tx.query("UPDATE app.announcements SET status='PUBLISHED' WHERE school_id=$1 AND id=$2",[ctx.schoolId,row.id]);
    const saved=(await one<Row>(tx,'SELECT * FROM app.announcements WHERE school_id=$1 AND id=$2',[ctx.schoolId,row.id]))!;
    const published=await this.publications.create(tx,{...c,body:{...c.body,expectedPublicationId:null}},{kind:'ANNOUNCEMENT',id:String(row.id),schoolId:ctx.schoolId,classId:ctx.classId,yearId:String(ctx.year!.id),version:Number(row.data_version)},{announcement:await this.view(tx,saved)},items,true,publicPayload);
    for(const doc of documents)await tx.query('INSERT INTO app.parent_document_items(id,school_id,student_id,year_id,file_id,publication_id,title,published_at,download_allowed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)',[doc.id,ctx.schoolId,doc.studentId,ctx.year!.id,doc.file.id,published.id,String(doc.file.original_name).slice(0,200),published.publishedAt]);
    if(row.audience!=='FAMILIES'){
      const recipients=(await tx.query<{id:string;class_id:string|null;subject_id:string|null}>(`SELECT m.id,assignment.class_id,assignment.subject_id FROM app.memberships m JOIN identity.users u ON u.id=m.user_id AND u.status='ACTIVE'
        LEFT JOIN LATERAL(SELECT a.class_id,a.subject_id FROM app.teaching_assignments a JOIN app.classes cls ON cls.school_id=a.school_id AND cls.id=a.class_id AND cls.year_id=$2
          JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
          JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
          WHERE a.school_id=m.school_id AND a.member_id=m.id AND a.revoked_at IS NULL AND a.starts_on<=$4 AND (a.ends_on IS NULL OR a.ends_on>$4)
          AND EXISTS(SELECT 1 FROM app.announcement_targets t WHERE t.school_id=m.school_id AND t.announcement_id=$3 AND (t.audience_kind IN ('PUBLIC','SCHOOL') OR (t.audience_kind='STAFF' AND t.member_id=m.id)
           OR (t.audience_kind='CLASS' AND t.class_id=a.class_id) OR (t.audience_kind='GRADE' AND t.grade_id=cls.grade_level_id)
           OR (t.audience_kind='STUDENT' AND a.kind='HOMEROOM' AND EXISTS(SELECT 1 FROM app.enrollments e WHERE e.school_id=m.school_id AND e.class_id=a.class_id AND e.student_id=t.student_id AND e.year_id=$2 AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4)))))
          ORDER BY CASE WHEN a.kind='HOMEROOM' THEN 0 ELSE 1 END,a.id LIMIT 1) assignment ON true
        WHERE m.school_id=$1 AND m.status='ACTIVE' AND m.ended_at IS NULL AND (assignment.class_id IS NOT NULL
         OR EXISTS(SELECT 1 FROM app.announcement_targets t WHERE t.school_id=m.school_id AND t.announcement_id=$3 AND t.audience_kind IN ('PUBLIC','SCHOOL'))
         OR EXISTS(SELECT 1 FROM app.announcement_targets t WHERE t.school_id=m.school_id AND t.announcement_id=$3 AND t.audience_kind='STAFF' AND t.member_id=m.id)
         OR EXISTS(SELECT 1 FROM app.role_grants g JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE' JOIN app.role_permissions rp ON rp.school_id=r.school_id AND rp.role_id=r.id AND rp.action_code='announcement.read' AND 'SCHOOL'=ANY(rp.allowed_scopes)
          WHERE g.school_id=m.school_id AND g.member_id=m.id AND g.scope_type='SCHOOL' AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()))) ORDER BY m.id LIMIT 5001`,[ctx.schoolId,ctx.year!.id,row.id,ctx.today])).rows;
      if(recipients.length>5000)throw new Problem(422,'NOTIFICATION_LIMIT');
      await notifyMany(tx,recipients.map(m=>({schoolId:ctx.schoolId,memberId:m.id,kind:'announcement',title:String(row.title),body:'Thông báo mới đã được công bố trong phạm vi bạn được cấp.',targetType:'announcement',targetId:String(row.id),...(ctx.classId||m.class_id?{classId:ctx.classId??m.class_id!}:{}),...(m.subject_id?{subjectId:m.subject_id}:{}),requiredAction:'announcement.read',sourceKey:`publication:${published.id}`})));
    }
    await this.cancelJobs(tx,ctx.schoolId,String(row.id),preserveLease);await audit(tx,c,'announcement',String(row.id),{rootId:row.root_id,status:'PUBLISHED',studentCount:students.length,public:!!publicPayload});return published;
  }
  async runScheduled(schoolId:string,id:string,userId:string,sourceVersion:number,guard:(tx:Transaction)=>Promise<void>){
    return this.db.transaction(async tx=>{
      await tx.query('SELECT app.lock_school()');await guard(tx);
      const row=await one<Row>(tx,'SELECT * FROM app.announcements WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,id]);if(!row)notFound();
      if(row.status==='PUBLISHED')return;if(row.status!=='SCHEDULED'||new Date(row.scheduled_at as Date).getTime()>Date.now())throw new Problem(422,'SCHEDULE_UNAVAILABLE');
      if(!await one(tx,"SELECT id FROM identity.users WHERE id=$1 AND status='ACTIVE'",[userId]))throw new Problem(403,'REQUESTER_REVOKED');
      const operation=operations.find(op=>op.id===(row.class_id?'publishClassAnnouncement':'publishSchoolAnnouncement'))!;
      const c:ActorContext={params:{schoolId,announcementId:id,...(row.class_id?{classId:String(row.class_id)}:{})},principal:{userId},operation,body:{expectedSourceVersion:sourceVersion},requestId:crypto.randomUUID(),query:{}};
      await this.publish(tx,c,row,true);
    },{schoolId,userId});
  }
  private async public(c:RequestContext):Promise<Result>{
    const school=(await this.db.app.query<Row>('SELECT * FROM platform.schools WHERE slug=$1 AND status=\'ACTIVE\'',[c.params.schoolSlug])).rows[0];if(!school)notFound();
    return this.db.transaction(async tx=>{
      const rows=(await tx.query<Row>(`SELECT p.public_payload,p.published_at FROM app.publication_revisions p JOIN app.announcements a ON a.school_id=p.school_id AND a.id=p.announcement_id
        WHERE p.school_id=$1 AND p.kind='ANNOUNCEMENT' AND p.status='PUBLISHED' AND p.public_payload IS NOT NULL${c.params.announcementId?' AND (a.root_id=$2 OR a.id=$2)':''} ORDER BY p.published_at DESC,p.id DESC LIMIT ${c.params.announcementId?1:101}`,c.params.announcementId?[school.id,c.params.announcementId]:[school.id])).rows;
      const values=[];
      for(const row of rows){const payload=row.public_payload as Record<string,unknown>,docs=payload.documents as {id:string}[];
        const available=(await tx.query<Row>("SELECT id,original_name,content_type,byte_size FROM app.files WHERE school_id=$1 AND id=ANY($2::uuid[]) AND status='READY' AND (expires_at IS NULL OR expires_at>now()) ORDER BY id",[school.id,docs.map(d=>d.id)])).rows;
        values.push({...payload,publishedAt:iso(row.published_at as Date),documents:available.map(file=>({id:file.id,title:String(file.original_name).slice(0,200),contentType:file.content_type,byteSize:Number(file.byte_size),downloadAllowed:false,publishedAt:iso(row.published_at as Date)}))});
      }
      if(c.params.announcementId){if(!values.length)notFound();return {data:values[0]};}
      if(values.length>100)values.pop();return {data:{name:school.name,slug:school.slug,...(school.public_address?{publicAddress:school.public_address}:{}),...(school.public_contact_email?{publicContactEmail:school.public_contact_email}:{}),...(school.public_contact_phone?{publicContactPhone:school.public_contact_phone}:{}),announcements:values}};
    },{schoolId:String(school.id)});
  }
}
