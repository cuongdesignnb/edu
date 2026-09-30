import { Injectable } from '@nestjs/common';
import { Database,one,type Transaction,type Row } from '../../database/database';
import { dto,listResource,getResource,resource,type Resource } from '../../database/resources';
import { Permissions } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,validation } from '../../common/problem';
import { ConductService } from './conduct.service';
import { conductPeriod,conductSummary,reason,version } from './conduct-data';
import { score } from './scoring';
import { loadRules } from './rules.service';
import type { RequestContext,Handler,Result } from '../../api.router';

const r:Resource={table:'app.adjustment_requests',fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',periodId:'period_id',baselinePublicationId:'baseline_publication_id',reason:'reason',status:'status',proposedChanges:'proposed_changes',preview:'preview',decisionReason:'decision_reason',resultPublicationId:'result_publication_id'},writeFields:[],search:[],filters:{status:'status',periodId:'period_id'}};
interface Change {recordId:string;action:'EXCLUDE'|'REPLACE';replacement?:Record<string,unknown>}
function adjustmentDto(row:Row){return Object.fromEntries(Object.entries(dto(r,row)).filter(([,v])=>v!==null));}
@Injectable()
export class AdjustmentsService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly conduct:ConductService){}
  handlers():Record<string,Handler>{return Object.fromEntries(['listAdjustments','createAdjustment','approveAdjustment','rejectAdjustment','applyAdjustment'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  private async get(tx:Transaction,c:RequestContext,lock=false){const row=await one<Row>(tx,`SELECT a.* FROM app.adjustment_requests a JOIN app.conduct_periods p ON p.school_id=a.school_id AND p.id=a.period_id WHERE a.school_id=$1 AND p.class_id=$2 AND a.id=$3${lock?' FOR UPDATE OF a':''}`,[c.params.schoolId,c.params.classId,c.params.adjustmentId]);if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');return row;}
  private async baseline(tx:Transaction,c:RequestContext,proposal:Row){
    const p=await conductPeriod(tx,c.params.schoolId!,c.params.classId!,String(proposal.period_id),true);
    const pub=await one<Row>(tx,'SELECT * FROM app.publication_revisions WHERE school_id=$1 AND class_id=$2 AND conduct_period_id=$3 AND id=$4 FOR UPDATE',[c.params.schoolId,c.params.classId,p.id,proposal.baseline_publication_id]);
    if(p.status!=='LOCKED'||!pub||pub.status!=='PUBLISHED'||pub.source_version!==p.data_version||(proposal.baseline_source_version!==undefined&&proposal.baseline_source_version!==p.data_version))throw new Problem(409,'STALE_BASELINE',undefined,Number(p.data_version));return {p,pub};
  }
  private async changes(tx:Transaction,c:RequestContext,p:Row,value:unknown,authority:string){
    const changes=value as Change[];
    if(!Array.isArray(changes)||changes.length<1||changes.length>100||new Set(changes.map(x=>x.recordId)).size!==changes.length)validation('proposedChanges','Chọn 1–100 sự kiện khác nhau');
    const records=await conductSummary(tx,p),after=records.records.map(row=>({...row}));
    for(const change of changes){
      const old=after.find(row=>row.id===change.recordId);if(!old||old.status!=='APPROVED')validation('proposedChanges','Chỉ điều chỉnh sự kiện đã duyệt trong kỳ này');
      old.status='EXCLUDED';
      if(change.action==='EXCLUDE'){if(change.replacement)validation('proposedChanges','Loại sự kiện không kèm bản thay thế');}
      else{
        const replacement=change.replacement;if(!replacement||replacement.periodId!==p.id||replacement.enrollmentId!==old.enrollment_id)validation('proposedChanges','Bản thay thế phải cùng kỳ và học sinh');
        const checked=await this.conduct.prepareRecord(tx,c,replacement,{locked:true,supersedesId:String(old.id),authority});
        after.push({...old,status:'APPROVED',delta_snapshot:checked.delta,rule_id:checked.rule.id,rule_label_snapshot:checked.rule.label,public_reason:replacement.publicReason});
      }
    }
    const set=(await one<Row>(tx,'SELECT * FROM app.rule_sets WHERE school_id=$1 AND id=$2',[p.school_id,p.rule_set_id]))!,config=await loadRules(tx,String(p.school_id),String(p.rule_set_id));
    const students=records.summary.students.map(student=>{
      const enrollmentIds=records.enrollments.filter(e=>e.student_id===student.studentId).map(e=>e.id);
      return {...student,...score(set,after.filter(row=>enrollmentIds.includes(row.enrollment_id)&&row.status==='APPROVED').map(row=>String(row.delta_snapshot)),config.thresholds)};
    });return {before:records.summary,after:{...records.summary,students}};
  }
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,classId=c.params.classId!,op=c.operation.id;
    const authorize=async(tx:Transaction)=>this.policy.require(tx,c.principal!,c.operation.permission,{schoolId,classId});
    const work=async(tx:Transaction):Promise<Result>=>{
      if(op==='listAdjustments'){
        const result=await listResource(tx,r,schoolId,c.query,{sql:'EXISTS(SELECT 1 FROM app.conduct_periods p WHERE p.school_id=t.school_id AND p.id=t.period_id AND p.class_id=$1)',values:[classId]},c.principal!.userId);
        result.data=result.data.map(row=>Object.fromEntries(Object.entries(row).filter(([,v])=>v!==null)));return result;
      }
      await tx.query('SELECT app.lock_school()');
      const cls=await getResource(tx,resource('class'),schoolId,classId),year=await getResource(tx,resource('year'),schoolId,String(cls.year_id));if(cls.status==='ARCHIVED'||year.status==='ARCHIVED')throw new Problem(409,'YEAR_ARCHIVED');
      if(op==='createAdjustment'){
        const {p,pub}=await this.baseline(tx,c,{period_id:c.body.periodId,baseline_publication_id:c.body.baselinePublicationId});
        const explanation=reason(c.body.reason),preview=await this.changes(tx,c,p,c.body.proposedChanges,'conduct.adjust.request');
        const saved=await one<Row>(tx,`INSERT INTO app.adjustment_requests(school_id,period_id,baseline_publication_id,baseline_source_version,reason,proposed_changes,requested_by,preview) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[schoolId,p.id,pub.id,p.data_version,explanation,JSON.stringify(c.body.proposedChanges),c.principal!.userId,preview]);
        await audit(tx,c,'adjustment',String(saved!.id),{baselinePublicationId:pub.id,sourceVersion:p.data_version});return {data:adjustmentDto(saved!),status:201};
      }
      const adjustment=await this.get(tx,c,true);
      if(op==='rejectAdjustment'){
        version(adjustment,c.body.expectedVersion);if(!['SUBMITTED','APPROVED'].includes(String(adjustment.status)))throw new Problem(409,'INVALID_STATE');
        const saved=await one<Row>(tx,"UPDATE app.adjustment_requests SET status='REJECTED',decided_by=$3,decided_at=now(),decision_reason=$4 WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,adjustment.id,c.principal!.userId,reason(c.body.reason)]);await audit(tx,c,'adjustment',String(adjustment.id),{status:'REJECTED'});return {data:adjustmentDto(saved!)};
      }
      const {p,pub}=await this.baseline(tx,c,adjustment);
      await this.changes(tx,c,p,adjustment.proposed_changes,'conduct.adjust.approve');
      if(op==='approveAdjustment'){
        version(adjustment,c.body.expectedVersion);if(adjustment.status!=='SUBMITTED')throw new Problem(409,'INVALID_STATE');
        const saved=await one<Row>(tx,"UPDATE app.adjustment_requests SET status='APPROVED',decided_by=$3,decided_at=now() WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,adjustment.id,c.principal!.userId]);await audit(tx,c,'adjustment',String(adjustment.id),{status:'APPROVED'});return {data:adjustmentDto(saved!)};
      }
      if(adjustment.status!=='APPROVED')throw new Problem(409,'ADJUSTMENT_NOT_APPROVED');
      if(c.body.expectedSourceVersion!==p.data_version)throw new Problem(409,'STALE_SOURCE',undefined,Number(p.data_version));
      if(Object.hasOwn(c.body,'expectedPublicationId')&&c.body.expectedPublicationId!==pub.id)throw new Problem(409,'PUBLICATION_CONFLICT');
      await tx.query("SELECT set_config('app.adjustment_id',$1,true)",[adjustment.id]);
      for(const change of adjustment.proposed_changes as Change[]){
        await tx.query("UPDATE app.conduct_records SET status='EXCLUDED',exclusion_reason=$3 WHERE school_id=$1 AND id=$2",[schoolId,change.recordId,adjustment.reason]);
        if(change.action==='REPLACE')await this.conduct.insertRecord(tx,c,change.replacement!,{approved:true,supersedesId:change.recordId,authorId:String(adjustment.requested_by)});
      }
      const next=await conductPeriod(tx,schoolId,classId,String(p.id)),publication=await this.conduct.publish(tx,c,next,true);
      await tx.query("UPDATE app.adjustment_requests SET status='APPLIED',applied_at=now(),result_publication_id=$3 WHERE school_id=$1 AND id=$2",[schoolId,adjustment.id,publication.id]);
      await audit(tx,c,'adjustment',String(adjustment.id),{status:'APPLIED',publicationId:publication.id,sourceVersion:next.data_version});return {data:publication};
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId});return this.commands.execute(c,authorize,work);
  }
}
