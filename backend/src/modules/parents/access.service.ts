import { Injectable } from '@nestjs/common';
import { Database,one,type Transaction,type Row } from '../../database/database';
import { dto,listResource,type Resource } from '../../database/resources';
import { Permissions } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { randomToken,hashToken } from '../../common/security';
import { runtimeConfig } from '../../common/config';
import { Problem,validation } from '../../common/problem';
import { reason,version } from '../conduct/conduct-data';
import { ParentService } from './parent.service';
import { schoolSettings } from '../settings/school-settings';
import { parentIssueContext,parentIssueStudents,parentIssueSource,reviewParentIssue } from './access-issue-source';
import { parentAccessDirectory,parentAccessDirectorySummary,parentAccessDetails } from './access-directory';
import type { RequestContext,Handler,Result } from '../../api.router';
const r:Resource={table:'app.parent_access_links',fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',studentId:'student_id',yearId:'year_id',relationshipId:'relationship_id',allowedSections:'allowed_sections',allowDownload:'allow_download',expiresAt:'expires_at',revokedAt:'revoked_at',revokeReason:'revoke_reason'},writeFields:[],search:[],filters:{studentId:'student_id',yearId:'year_id'}};
const events:Resource={table:'app.parent_access_events',fields:{id:'id',accessLinkId:'access_link_id',eventKind:'event_kind',occurredAt:'created_at',deviceSummary:'device_summary',section:'section'},writeFields:[],search:[],filters:{}};
@Injectable()
export class ParentAccessService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly parent:ParentService){}
  handlers():Record<string,Handler>{return Object.fromEntries(['listParentAccess','issueParentAccess','getParentAccess','revokeParentAccess','reissueParentAccess','listParentAccessEvents','previewParent','previewParentAttendanceMonth','previewParentTeacherDirectory','previewParentDutySchedule','previewParentTimetableWeek','previewParentDocumentDirectory','previewParentDocument','previewParentDocumentView','previewParentDocumentDownload','getParentAccessIssueContext','listParentAccessIssueStudents','getStudentParentAccessIssueSource','issueReviewedParentAccess','listParentAccessDirectory','getParentAccessDirectorySummary','getParentAccessDetails','listParentAccessHistory'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  private async get(tx:Transaction,c:RequestContext,lock=false){const row=await one<Row>(tx,`SELECT * FROM app.parent_access_links WHERE school_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[c.params.schoolId,c.params.accessId]);if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');return row;}
  private async scope(tx:Transaction,c:RequestContext,studentId:string,yearId:string,action:string){
    const schoolId=c.params.schoolId!,scope=await this.policy.collection(tx,c.principal!,action,schoolId);
    const enrollment=await one<Row>(tx,`SELECT id FROM app.enrollments WHERE school_id=$1 AND student_id=$2 AND year_id=$3 AND status<>'CANCELLED'${scope.all?'':" AND class_id=ANY($4::uuid[]) AND starts_on<=$5 AND (ends_on IS NULL OR ends_on>$5)"} LIMIT 1`,scope.all?[schoolId,studentId,yearId]:[schoolId,studentId,yearId,scope.classIds,scope.today]);if(!enrollment)throw new Problem(404,'RESOURCE_NOT_FOUND');return scope;
  }
  private async display(tx:Transaction,row:Row){const guardian=await one<Row>(tx,'SELECT g.full_name FROM app.guardian_relationships r JOIN app.guardians g ON g.school_id=r.school_id AND g.id=r.guardian_id WHERE r.school_id=$1 AND r.id=$2',[row.school_id,row.relationship_id]);return {...dto(r,row),...(guardian?{issuedToGuardianName:guardian.full_name}:{})};}
  private async revoke(tx:Transaction,c:RequestContext,row:Row){await tx.query('UPDATE app.parent_access_links SET revoked_at=now(),revoke_reason=$3 WHERE school_id=$1 AND id=$2',[c.params.schoolId,row.id,reason(c.body.reason)]);await tx.query('UPDATE identity.parent_sessions SET revoked_at=now() WHERE school_id=$1 AND access_link_id=$2 AND revoked_at IS NULL',[c.params.schoolId,row.id]);}
  private async issue(tx:Transaction,c:RequestContext,body:Record<string,unknown>){
    const schoolId=c.params.schoolId!,year=await one<Row>(tx,'SELECT y.*,s.timezone,s.slug,s.settings FROM app.academic_years y JOIN platform.schools s ON s.id=y.school_id WHERE y.school_id=$1 AND y.id=$2',[schoolId,body.yearId]);if(!year)throw new Problem(404,'RESOURCE_NOT_FOUND');if(year.status!=='ACTIVE')throw new Problem(422,'YEAR_NOT_ACTIVE');
    const sections=body.allowedSections as string[];if(!sections.length)validation('allowedSections','Chọn ít nhất một mục');if(body.allowDownload&&!sections.includes('documents'))validation('allowDownload','Quyền tải chỉ dùng khi được xem tài liệu');
    const relationship=await one(tx,"SELECT id FROM app.guardian_relationships WHERE school_id=$1 AND id=$2 AND student_id=$3 AND status='VERIFIED' AND can_receive_info AND revoked_at IS NULL",[schoolId,body.relationshipId,body.studentId]);if(!relationship)validation('relationshipId','Quan hệ cần được xác minh và cho phép nhận thông tin');
    const ttl=schoolSettings(year).parentLinkTtlDays;
    const expiry=(await one<{at:Date}>(tx,"SELECT least($1::timestamptz,now()+$4::int*interval '1 day',$2::date::timestamp AT TIME ZONE $3) AS at",[body.expiresAt,year.ends_on,year.timezone,ttl]))!.at;
    if(expiry.getTime()<=Date.now()+1000)validation('expiresAt','Link phải còn hạn');
    const token=randomToken(),saved=await one<Row>(tx,`INSERT INTO app.parent_access_links(school_id,student_id,year_id,relationship_id,token_hash,allowed_sections,allow_download,expires_at,issued_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[schoolId,body.studentId,body.yearId,body.relationshipId,hashToken(token),sections,body.allowDownload,expiry,c.principal!.userId]);
    await audit(tx,c,'parentAccess',String(saved!.id),{studentId:body.studentId,yearId:body.yearId,sections,allowDownload:body.allowDownload,...(body.replacesAccessId?{replacesAccessId:body.replacesAccessId}:{})});return {access:await this.display(tx,saved!),link:`${runtimeConfig().appUrl}/p/${year.slug}/access#token=${token}`,displayOnce:true};
  }
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,op=c.operation.id;
    const authorize=async(tx:Transaction)=>{
      if(op==='listParentAccess'||['getParentAccessIssueContext','listParentAccessIssueStudents','getStudentParentAccessIssueSource','listParentAccessDirectory','getParentAccessDirectorySummary'].includes(op))return this.policy.collection(tx,c.principal!,c.operation.permission,schoolId);
      const target=op==='issueParentAccess'||op==='issueReviewedParentAccess'?{student_id:c.body.studentId,year_id:c.body.yearId}:await this.get(tx,c);
      return this.scope(tx,c,String(target.student_id),String(target.year_id),c.operation.permission);
    };
    if(['previewParent','previewParentAttendanceMonth','previewParentTeacherDirectory','previewParentDutySchedule','previewParentTimetableWeek','previewParentDocumentDirectory','previewParentDocument','previewParentDocumentView','previewParentDocumentDownload'].includes(op)){
      await this.db.transaction(authorize,{schoolId});return this.parent.preview(c,schoolId,c.params.accessId!);
    }
    const work=async(tx:Transaction):Promise<Result>=>{
      const scope=await authorize(tx);
      if(op==='listParentAccessDirectory')return parentAccessDirectory(tx,c,scope);
      if(op==='getParentAccessDirectorySummary')return {data:await parentAccessDirectorySummary(tx,c,scope)};
      if(op==='getParentAccessDetails')return {data:await parentAccessDetails(tx,c,scope)};
      if(op==='getParentAccessIssueContext')return {data:await parentIssueContext(tx,c,scope)};
      if(op==='listParentAccessIssueStudents')return parentIssueStudents(tx,c,scope);
      if(op==='getStudentParentAccessIssueSource')return {data:await parentIssueSource(tx,c,scope)};
      if(op==='issueReviewedParentAccess'){
        const reviewed=await reviewParentIssue(tx,c,scope),replace=c.body.replace as {accessId:string;expectedVersion:number}|undefined;
        if(replace){
          reason(c.body.reason);
          const old=await one<Row>(tx,'SELECT * FROM app.parent_access_links WHERE school_id=$1 AND id=$2 FOR UPDATE',[schoolId,replace.accessId]);
          if(!old||old.student_id!==c.body.studentId||old.year_id!==c.body.yearId||old.relationship_id!==c.body.relationshipId)throw new Problem(404,'RESOURCE_NOT_FOUND');
          version(old,replace.expectedVersion);
          if(!old.revoked_at){await this.revoke(tx,c,old);await audit(tx,c,'parentAccess',String(old.id),{status:'REVOKED',replaced:true});}
        }
        return {data:await this.issue(tx,c,{...c.body,expiresAt:reviewed.expiresAt,...(replace?{replacesAccessId:replace.accessId}:{})}),status:replace?200:201};
      }
      if(op==='listParentAccess'){
        const result=await listResource(tx,r,schoolId,c.query,scope.all?undefined:{sql:"EXISTS(SELECT 1 FROM app.enrollments e WHERE e.school_id=t.school_id AND e.student_id=t.student_id AND e.year_id=t.year_id AND e.status<>'CANCELLED' AND e.class_id=ANY($1::uuid[]) AND e.starts_on<=$2 AND (e.ends_on IS NULL OR e.ends_on>$2))",values:[scope.classIds,scope.today]},c.principal!.userId);return result;
      }
      if(op==='issueParentAccess')return {data:await this.issue(tx,c,c.body),status:201};
      const row=await this.get(tx,c,c.operation.method!=='GET');
      if(op==='getParentAccess')return {data:await this.display(tx,row)};
      if(op==='listParentAccessEvents'||op==='listParentAccessHistory'){
        const result=await listResource(tx,events,schoolId,op==='listParentAccessHistory'?{...c.query,sort:c.query.sort??'occurredAt',dir:c.query.dir??'desc'}:c.query,{sql:'t.access_link_id=$1',values:[row.id]},c.principal!.userId);
        if(op==='listParentAccessEvents')result.data=result.data.map(row=>Object.fromEntries(Object.entries(row).filter(([,v])=>v!==null)));return result;
      }
      version(row,c.body.expectedVersion);if(op==='revokeParentAccess'&&row.revoked_at)throw new Problem(409,'LINK_ALREADY_REVOKED');
      await this.revoke(tx,c,row);
      if(op==='reissueParentAccess')return {data:await this.issue(tx,c,{studentId:row.student_id,yearId:row.year_id,relationshipId:row.relationship_id,allowedSections:row.allowed_sections,allowDownload:row.allow_download,expiresAt:new Date(Date.now()+90*86400000).toISOString()})};
      await audit(tx,c,'parentAccess',String(row.id),{status:'REVOKED'});return {data:await this.display(tx,await this.get(tx,c))};
    };
    if(c.operation.method==='GET')return this.db.transaction(work,{schoolId,readOnly:true});return this.commands.execute(c,authorize,work,['issueParentAccess','reissueParentAccess','issueReviewedParentAccess'].includes(op));
  }
}
