import { Injectable } from '@nestjs/common';
import { Database,one,type Transaction,type Row } from '../../database/database';
import { dto,getResource,resource,listResource,type Resource } from '../../database/resources';
import { Permissions } from '../../common/permissions';
import { Commands,audit,canonical } from '../../common/commands';
import { hashToken } from '../../common/security';
import { Problem,validation,notFound } from '../../common/problem';
import { StaffService } from '../staff/staff.service';
import { placeEnrollment,checkCapacity } from './enrollment';
import type { RequestContext,Result,Handler } from '../../api.router';

const meta={id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at'};
const transfer:Resource={table:'app.transfer_requests',fields:{...meta,studentId:'student_id',fromEnrollmentId:'from_enrollment_id',toClassId:'to_class_id',effectiveOn:'effective_on',reason:'reason',status:'status'},writeFields:[],search:[],filters:{studentId:'student_id',status:'status'}};
const handover:Resource={table:'app.handover_requests',fields:{...meta,classId:'class_id',fromAssignmentId:'from_assignment_id',toMemberId:'to_member_id',effectiveOn:'effective_on',reason:'reason',status:'status'},writeFields:[],search:[],filters:{classId:'class_id',status:'status'}};
const rollover:Resource={table:'app.rollover_batches',fields:{...meta,sourceYearId:'source_year_id',targetYearId:'target_year_id',plan:'plan',planHash:'plan_hash',status:'status'},writeFields:[],search:[],filters:{}};
interface RolloverItem {studentId:string;fromClassId:string;toClassId?:string;decision:'PROMOTED'|'REPEATED'|'LEFT'|'GRADUATED'}
@Injectable()
export class TransitionsService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly staff:StaffService){}
  handlers():Record<string,Handler>{
    return Object.fromEntries(['listTransfers','createTransfer','approveTransfer','rejectTransfer','listHandovers','createHandover','approveHandover',
      'createRollover','getRollover','validateRollover','commitRollover'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));
  }
  private version(row:Row,expected:unknown){if(row.version!==expected)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row.version));}
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,op=c.operation.id;
    const authorize=async(tx:Transaction)=>{
      if(op==='createTransfer'){
        const from=await getResource(tx,resource('enrollment'),schoolId,String(c.body.fromEnrollmentId));
        if(from.student_id!==c.body.studentId)notFound();
        const access=await this.policy.require(tx,c.principal!,c.operation.permission,{schoolId,classId:String(from.class_id),date:String(c.body.effectiveOn)});
        if(String(c.body.effectiveOn)<access.today)await this.policy.require(tx,c.principal!,'student.transfer',{schoolId});
        return access;
      }
      return this.policy.require(tx,c.principal!,c.operation.permission,{schoolId});
    };
    const work=async(tx:Transaction):Promise<Result>=>{
      if(op==='listTransfers')return listResource(tx,transfer,schoolId,c.query,undefined,c.principal!.userId);
      if(op==='listHandovers')return listResource(tx,handover,schoolId,c.query,undefined,c.principal!.userId);
      if(op==='getRollover')return {data:this.rolloverDto(await getResource(tx,rollover,schoolId,c.params.rolloverId!))};
      await tx.query('SELECT id FROM platform.schools WHERE id=$1 FOR UPDATE',[schoolId]);
      if(op==='createTransfer'){
        if(String(c.body.reason).trim().length<3)validation('reason','Cần lý do chuyển lớp');
        const from=await getResource(tx,resource('enrollment'),schoolId,String(c.body.fromEnrollmentId),true);
        await this.validateTransfer(tx,schoolId,from,c.body.studentId,c.body.toClassId,String(c.body.effectiveOn));
        const row=await one<Row>(tx,`INSERT INTO app.transfer_requests(school_id,student_id,from_enrollment_id,to_class_id,effective_on,reason,status,requested_by)
          VALUES($1,$2,$3,$4,$5,$6,'SUBMITTED',$7) RETURNING *`,[schoolId,c.body.studentId,from.id,c.body.toClassId??null,c.body.effectiveOn,c.body.reason,c.principal!.userId]);
        await audit(tx,c,'transfer',String(row!.id));return {data:dto(transfer,row!),status:201};
      }
      if(op==='approveTransfer'||op==='rejectTransfer'){
        const row=await getResource(tx,transfer,schoolId,c.params.transferId!,true);this.version(row,c.body.expectedVersion);
        if(row.status!=='SUBMITTED')throw new Problem(409,'INVALID_STATE');
        if(op==='rejectTransfer'){
          const saved=await one<Row>(tx,"UPDATE app.transfer_requests SET status='REJECTED',decided_by=$3 WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,row.id,c.principal!.userId]);
          await audit(tx,c,'transfer',String(row.id),{status:'REJECTED'});return {data:dto(transfer,saved!)};
        }
        // Stable lock order: school -> student -> class IDs -> enrollment.
        await getResource(tx,resource('student'),schoolId,String(row.student_id),true);
        const from=await getResource(tx,resource('enrollment'),schoolId,String(row.from_enrollment_id));
        const classIds=[...new Set([String(from.class_id),...(row.to_class_id?[String(row.to_class_id)]:[])])].sort();
        for(const id of classIds)await getResource(tx,resource('class'),schoolId,id,true);
        const locked=await getResource(tx,resource('enrollment'),schoolId,String(row.from_enrollment_id),true);
        await this.validateTransfer(tx,schoolId,locked,row.student_id,row.to_class_id,String(row.effective_on));
        await tx.query("UPDATE app.enrollments SET ends_on=$3,status='ENDED' WHERE school_id=$1 AND id=$2",[schoolId,locked.id,row.effective_on]);
        if(row.to_class_id)await placeEnrollment(tx,schoolId,String(row.student_id),String(row.to_class_id),String(row.effective_on),String(locked.ends_on));
        const saved=await one<Row>(tx,"UPDATE app.transfer_requests SET status='APPLIED',decided_by=$3,applied_at=now() WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,row.id,c.principal!.userId]);
        await audit(tx,c,'transfer',String(row.id),{status:'APPLIED',fromClassId:locked.class_id,toClassId:row.to_class_id});return {data:dto(transfer,saved!)};
      }
      if(op==='createHandover'){
        if(String(c.body.reason).trim().length<3)validation('reason','Cần lý do bàn giao');
        await this.validateHandover(tx,schoolId,c.body);
        const checklist=await this.checklist(tx,schoolId,String(c.body.classId));
        const row=await one<Row>(tx,`INSERT INTO app.handover_requests(school_id,class_id,from_assignment_id,to_member_id,effective_on,reason,checklist,status,requested_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,'SUBMITTED',$8) RETURNING *`,[schoolId,c.body.classId,c.body.fromAssignmentId,c.body.toMemberId,c.body.effectiveOn,c.body.reason,checklist,c.principal!.userId]);
        await audit(tx,c,'handover',String(row!.id),{checklist});return {data:dto(handover,row!),status:201};
      }
      if(op==='approveHandover'){
        const row=await getResource(tx,handover,schoolId,c.params.handoverId!,true);this.version(row,c.body.expectedVersion);
        if(row.status!=='SUBMITTED')throw new Problem(409,'INVALID_STATE');
        const body={classId:row.class_id,fromAssignmentId:row.from_assignment_id,toMemberId:row.to_member_id,effectiveOn:row.effective_on};
        await getResource(tx,resource('class'),schoolId,String(row.class_id),true);
        const previous=await this.validateHandover(tx,schoolId,body,true);
        const until=await one<{end:Date}>(tx,"SELECT $2::date::timestamp AT TIME ZONE timezone AS end FROM platform.schools WHERE id=$1",[schoolId,row.effective_on]);
        await tx.query('UPDATE app.teaching_assignments SET ends_on=$3 WHERE school_id=$1 AND id=$2',[schoolId,previous.id,row.effective_on]);
        await tx.query('UPDATE app.role_grants SET valid_until=$3 WHERE school_id=$1 AND id=$2',[schoolId,previous.role_grant_id,until!.end]);
        const assignment=await this.staff.createAssignment(tx,c,{classId:row.class_id,memberId:row.to_member_id,kind:'HOMEROOM',startsOn:row.effective_on,endsOn:previous.ends_on,reason:row.reason});
        const checklist=await this.checklist(tx,schoolId,String(row.class_id));
        const saved=await one<Row>(tx,"UPDATE app.handover_requests SET status='APPLIED',decided_by=$3,checklist=$4 WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,row.id,c.principal!.userId,checklist]);
        await audit(tx,c,'handover',String(row.id),{status:'APPLIED',assignmentId:assignment.id,checklist});return {data:dto(handover,saved!)};
      }
      if(op==='createRollover'){
        for(const id of [c.params.yearId!,String(c.body.targetYearId)].sort())await getResource(tx,resource('year'),schoolId,id,true);
        const row=await one<Row>(tx,`INSERT INTO app.rollover_batches(school_id,source_year_id,target_year_id,plan,requested_by)
          VALUES($1,$2,$3,$4,$5) RETURNING *`,[schoolId,c.params.yearId,c.body.targetYearId,JSON.stringify(c.body.plan),c.principal!.userId]);
        await this.validatePlan(tx,schoolId,row!);
        await audit(tx,c,'rollover',String(row!.id));return {data:this.rolloverDto(row!),status:201};
      }
      const batch=await getResource(tx,rollover,schoolId,c.params.rolloverId!,true);this.version(batch,c.body.expectedVersion);
      if(!['DRAFT','VALIDATED'].includes(String(batch.status)))throw new Problem(409,'INVALID_STATE');
      for(const id of [String(batch.source_year_id),String(batch.target_year_id)].sort())await getResource(tx,resource('year'),schoolId,id,true);
      const preview=await this.validatePlan(tx,schoolId,batch);
      if(op==='validateRollover'){
        const row=await one<Row>(tx,"UPDATE app.rollover_batches SET status='VALIDATED',plan_hash=$3 WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,batch.id,preview.hash]);
        await audit(tx,c,'rollover',String(batch.id),{status:'VALIDATED',count:preview.plan.length});return {data:this.rolloverDto(row!)};
      }
      if(batch.status!=='VALIDATED'||batch.plan_hash!==c.body.previewHash||preview.hash!==batch.plan_hash)throw new Problem(409,'STALE_PREVIEW');
      for(const id of preview.plan.map(item=>item.studentId).sort())await getResource(tx,resource('student'),schoolId,id,true);
      for(const id of [...new Set(preview.plan.flatMap(item=>item.toClassId?[item.toClassId]:[]))].sort())await getResource(tx,resource('class'),schoolId,id,true);
      // Rerun after locks: a student/reference edit cannot race the approved hash.
      if((await this.validatePlan(tx,schoolId,batch)).hash!==preview.hash)throw new Problem(409,'STALE_PREVIEW');
      for(const item of preview.plan)if(item.toClassId)await placeEnrollment(tx,schoolId,item.studentId,item.toClassId,String(preview.target.starts_on),String(preview.target.ends_on));
      const row=await one<Row>(tx,"UPDATE app.rollover_batches SET status='APPLIED',applied_at=now() WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,batch.id]);
      await audit(tx,c,'rollover',String(batch.id),{status:'APPLIED',count:preview.plan.length});return {data:this.rolloverDto(row!)};
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId});
    return this.commands.execute(c,authorize,work);
  }
  private async validateTransfer(tx:Transaction,schoolId:string,from:Row,studentId:unknown,toClassId:unknown,date:string){
    if(from.student_id!==studentId)notFound();
    const year=await getResource(tx,resource('year'),schoolId,String(from.year_id));
    if(year.status==='ARCHIVED'||from.status==='CANCELLED'||date<=String(from.starts_on)||date>=String(from.ends_on??year.ends_on))validation('effectiveOn','Ngày chuyển phải thuộc quá trình theo học hiện tại');
    if(toClassId){const target=await getResource(tx,resource('class'),schoolId,String(toClassId));
      if(target.id===from.class_id||target.year_id!==from.year_id||target.status==='ARCHIVED')validation('toClassId','Lớp nhận phải khác lớp cũ và cùng năm học');
    }
  }
  private async validateHandover(tx:Transaction,schoolId:string,body:Record<string,unknown>,lock=false){
    const previous=await one<Row>(tx,`SELECT * FROM app.teaching_assignments WHERE school_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[schoolId,body.fromAssignmentId]);
    if(!previous||previous.class_id!==body.classId||previous.kind!=='HOMEROOM')notFound();
    if(previous.revoked_at||previous.member_id===body.toMemberId||String(body.effectiveOn)<=String(previous.starts_on)
      ||String(body.effectiveOn)>=String(previous.ends_on))validation('effectiveOn','Phân công/nhân sự/ngày bàn giao không hợp lệ');
    const member=await getResource(tx,resource('member'),schoolId,String(body.toMemberId));
    if(member.status!=='ACTIVE')validation('toMemberId','Nhân sự nhận chưa hoạt động');
    const grant=await one<Row>(tx,'SELECT revoked_at FROM app.role_grants WHERE school_id=$1 AND id=$2',[schoolId,previous.role_grant_id]);
    if(!grant||grant.revoked_at)throw new Problem(409,'ASSIGNMENT_REVOKED');
    return previous;
  }
  private async checklist(tx:Transaction,schoolId:string,classId:string){
    const row=await one(tx,`SELECT
      (SELECT count(*) FROM app.conduct_periods WHERE school_id=$1 AND class_id=$2 AND status IN ('OPEN','IN_REVIEW'))::int AS "openConductPeriods",
      (SELECT count(*) FROM app.attendance_sessions WHERE school_id=$1 AND class_id=$2 AND status='OPEN')::int AS "openAttendanceSessions",
      (SELECT count(*) FROM app.activities WHERE school_id=$1 AND class_id=$2 AND status IN ('DRAFT','ASSIGNED'))::int AS "openActivities"`,[schoolId,classId]);
    return row!;
  }
  private rolloverDto(row:Row){const result=dto(rollover,row);if(result.planHash===null)delete result.planHash;
    result.warnings=['Phân công giáo viên và link phụ huynh năm mới cần được phê duyệt riêng.'];return result;}
  private async validatePlan(tx:Transaction,schoolId:string,batch:Row){
    const source=await getResource(tx,resource('year'),schoolId,String(batch.source_year_id)),target=await getResource(tx,resource('year'),schoolId,String(batch.target_year_id));
    if(source.id===target.id||String(target.starts_on)<String(source.ends_on)||target.status==='ARCHIVED')validation('targetYearId','Năm nhận phải sau năm nguồn và chưa lưu trữ');
    const plan=batch.plan as RolloverItem[];
    if(!plan.length||new Set(plan.map(item=>item.studentId)).size!==plan.length)validation('plan','Cần học sinh và không được trùng học sinh');
    const versions:unknown[]=[source,target];const targets=new Map<string,{cls:Row;count:number}>();
    for(const item of plan){
      const student=await getResource(tx,resource('student'),schoolId,item.studentId);
      const enrollment=await one<Row>(tx,`SELECT id,version,ends_on FROM app.enrollments WHERE school_id=$1 AND student_id=$2 AND class_id=$3
        AND year_id=$4 AND status<>'CANCELLED' AND ends_on=$5 ORDER BY starts_on DESC LIMIT 1`,[schoolId,item.studentId,item.fromClassId,source.id,source.ends_on]);
      if(!enrollment)validation('plan','Học sinh/lớp nguồn không đúng quá trình cuối năm');
      versions.push([student.id,student.version,enrollment.id,enrollment.version]);
      const continues=['PROMOTED','REPEATED'].includes(item.decision);
      if(continues!==!!item.toClassId)validation('plan','Học sinh tiếp tục học cần lớp nhận, chuyển đi/tốt nghiệp không có lớp nhận');
      if(item.toClassId){
        let entry=targets.get(item.toClassId);
        if(!entry){const cls=await getResource(tx,resource('class'),schoolId,item.toClassId);
          if(cls.year_id!==target.id||cls.status==='ARCHIVED')validation('plan','Lớp nhận không thuộc năm mới');
          entry={cls,count:0};targets.set(item.toClassId,entry);versions.push([cls.id,cls.version]);
        }
        entry.count++;
        const overlap=await one(tx,`SELECT id FROM app.enrollments WHERE school_id=$1 AND student_id=$2 AND status<>'CANCELLED'
          AND daterange(starts_on,ends_on,'[)')&&daterange($3::date,$4::date,'[)') LIMIT 1`,[schoolId,item.studentId,target.starts_on,target.ends_on]);
        if(overlap)throw new Problem(409,'ENROLLMENT_OVERLAP');
      }
    }
    for(const {cls,count} of targets.values())await checkCapacity(tx,schoolId,cls,String(target.starts_on),String(target.ends_on),count);
    const targetEnrollments=(await tx.query<Row>(`SELECT id,version FROM app.enrollments WHERE school_id=$1 AND class_id=ANY($2::uuid[])
      AND status<>'CANCELLED' ORDER BY id`,[schoolId,[...targets.keys()]])).rows;
    return {plan,target,hash:hashToken(canonical({plan,versions,targetEnrollments}))};
  }
}
