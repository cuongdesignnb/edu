import { Injectable } from '@nestjs/common';
import { Database,one,iso,type Transaction,type Row } from '../../database/database';
import { dto,getResource,listResource,resource } from '../../database/resources';
import { Permissions,grantAllows } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,validation } from '../../common/problem';
import { ruleDelta } from './scoring';
import { conductDto,conductPeriod,conductSummary,periodResource,recordResource,periodWritable,version,reason,publicConductItems } from './conduct-data';
import { PublicationsService,type PublicationSource } from '../publications/publications.service';
import type { RequestContext,Handler,Result } from '../../api.router';
import {conductWorkspaceOperations,authorizeConductWorkspace,conductWorkspace} from './conduct-workspace';
import {schoolConductWorkspace} from './school-workspace';
import {publicationPolicy} from './school-policy';

@Injectable()
export class ConductService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly publications:PublicationsService){}
  handlers():Record<string,Handler>{return Object.fromEntries(['listConductPeriods','createConductPeriod','getConductSummary','listConductRecords','createConductRecord','updateConductRecord','approveConductRecord','excludeConductRecord','reviewConductPeriod','lockConductPeriod','publishConductPeriod','lockAndPublishConduct',...conductWorkspaceOperations,'getPublicationCenterWorkspace'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  private async record(tx:Transaction,c:RequestContext,lock=false){const row=await one<Row>(tx,`SELECT * FROM app.conduct_records WHERE school_id=$1 AND class_id=$2 AND id=$3${lock?' FOR UPDATE':''}`,[c.params.schoolId,c.params.classId,c.params.recordId]);if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');return row;}
  private async day(tx:Transaction,schoolId:string,timestamp:string){return (await one<{day:string}>(tx,"SELECT ($2::timestamptz AT TIME ZONE timezone)::date AS day FROM platform.schools WHERE id=$1",[schoolId,timestamp]))!.day;}
  private async scope(tx:Transaction,c:RequestContext,action:string,date?:string,subjectId?:string,authorId?:string){
    const schoolId=c.params.schoolId!,classId=c.params.classId!;
    const allowed=await this.policy.require(tx,c.principal!,action,{schoolId,classId,date,subjectId,allowSubject:!!subjectId});
    if(action.split('+').some(a=>['conduct.lock','conduct.publish'].includes(a))){
      const school=(await one<Row>(tx,'SELECT settings,version FROM platform.schools WHERE id=$1',[schoolId]))!,settings=publicationPolicy(schoolId,school);
      for(const a of action.split('+')){const leader=a==='conduct.lock'?settings.lockBy==='school_leader':a==='conduct.publish'&&settings.publishBy==='school_leader';
       if(leader&&!allowed.grants.some(g=>g.scope_type==='SCHOOL'&&grantAllows(g,a,{schoolId,classId,date},allowed.today)))throw new Problem(404,'RESOURCE_NOT_FOUND');}
    }
    const broad=action.split('+').every(a=>allowed.grants.some(g=>grantAllows(g,a,{schoolId,classId,date},allowed.today)));
    if(!broad&&authorId!==c.principal!.userId)throw new Problem(404,'RESOURCE_NOT_FOUND');return broad;
  }
  private async lesson(tx:Transaction,c:RequestContext,id:string){const lesson=await one<Row>(tx,`SELECT l.*,m.user_id,(l.starts_at AT TIME ZONE s.timezone)::date AS day FROM app.lesson_occurrences l
    JOIN app.memberships m ON m.school_id=l.school_id AND m.id=l.member_id JOIN platform.schools s ON s.id=l.school_id WHERE l.school_id=$1 AND l.class_id=$2 AND l.id=$3`,[c.params.schoolId,c.params.classId,id]);if(!lesson)throw new Problem(404,'RESOURCE_NOT_FOUND');return lesson;}
  private async createScope(tx:Transaction,c:RequestContext,body:Record<string,unknown>,action='conduct.record'){
    let lessonId=body.lessonId as string|undefined;
    if(body.sourceKind==='ATTENDANCE'&&body.sourceId){const source=await one<Row>(tx,`SELECT s.lesson_id FROM app.attendance_records a JOIN app.attendance_sessions s ON s.school_id=a.school_id AND s.id=a.session_id WHERE a.school_id=$1 AND a.class_id=$2 AND a.id=$3`,[c.params.schoolId,c.params.classId,body.sourceId]);if(!source)throw new Problem(404,'RESOURCE_NOT_FOUND');
      if(lessonId&&lessonId!==source.lesson_id)validation('lessonId','Nguồn điểm danh thuộc tiết khác');lessonId=source.lesson_id as string|undefined;}
    const lesson=lessonId?await this.lesson(tx,c,lessonId):undefined,date=await this.day(tx,c.params.schoolId!,String(body.occurredAt));
    const broad=await this.scope(tx,c,action,date,lesson?.subject_id as string|undefined,lesson?.user_id as string|undefined);
    if(lesson&&(lesson.status!=='SCHEDULED'||lesson.day!==date))validation('lessonId','Tiết học không khớp ngày ghi nhận');
    if(lesson&&!await one(tx,`SELECT id FROM app.teaching_assignments WHERE school_id=$1 AND class_id=$2 AND member_id=$3 AND subject_id=$4 AND kind='SUBJECT'
      AND revoked_at IS NULL AND starts_on<=$5 AND (ends_on IS NULL OR ends_on>$5)`,[c.params.schoolId,c.params.classId,lesson.member_id,lesson.subject_id,date]))validation('lessonId','Phân công của tiết học không còn hợp lệ');
    return {broad,lesson,date};
  }
  async createPeriod(tx:Transaction,c:RequestContext,weekId:string){
    const schoolId=c.params.schoolId!,classId=c.params.classId!,cls=await getResource(tx,resource('class'),schoolId,classId),year=await getResource(tx,resource('year'),schoolId,String(cls.year_id)),week=await getResource(tx,resource('week'),schoolId,weekId);
    if(week.year_id!==year.id)validation('weekId','Tuần thuộc năm khác');if(year.status==='ARCHIVED'||cls.status==='ARCHIVED')throw new Problem(409,'YEAR_ARCHIVED');
    await this.policy.require(tx,c.principal!,'conduct.record',{schoolId,classId,date:String(week.starts_on),allowSubject:true});
    const applied=await one<Row>(tx,`SELECT cr.rule_set_id FROM app.class_rule_periods cr JOIN app.rule_sets rs ON rs.school_id=cr.school_id AND rs.id=cr.rule_set_id
      WHERE cr.school_id=$1 AND cr.class_id=$2 AND cr.starts_on<=$3 AND (cr.ends_on IS NULL OR cr.ends_on>=$4) AND rs.status IN ('ISSUED','RETIRED')`,[schoolId,classId,week.starts_on,week.ends_on]);
    if(!applied)throw new Problem(422,'RULE_SET_NOT_APPLIED');
    const saved=await one<Row>(tx,`INSERT INTO app.conduct_periods(school_id,class_id,year_id,week_id,rule_set_id,input_deadline)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(school_id,class_id,week_id) DO NOTHING RETURNING *`,[schoolId,classId,year.id,weekId,applied.rule_set_id,week.input_deadline??null]);
    return saved??(await one<Row>(tx,'SELECT * FROM app.conduct_periods WHERE school_id=$1 AND class_id=$2 AND week_id=$3',[schoolId,classId,weekId]))!;
  }
  async prepareRecord(tx:Transaction,c:RequestContext,body:Record<string,unknown>,options:{locked?:boolean;supersedesId?:string;authority?:string}={}){
    const schoolId=c.params.schoolId!,classId=c.params.classId!,p=await conductPeriod(tx,schoolId,classId,String(body.periodId),true);
    if(!options.locked)periodWritable(p);
    const scoped=await this.createScope(tx,c,body,options.authority),rule=await one<Row>(tx,'SELECT * FROM app.conduct_rules WHERE school_id=$1 AND rule_set_id=$2 AND id=$3',[schoolId,p.rule_set_id,body.ruleId]);if(!rule)validation('ruleId','Không thuộc bản nội quy đã cố định cho kỳ');
    if(rule.value_mode==='MANUAL'&&!scoped.broad)throw new Problem(404,'RESOURCE_NOT_FOUND');
    if(scoped.date<String(p.starts_on)||scoped.date>=String(p.ends_on)||new Date(String(body.occurredAt)).getTime()>Date.now())validation('occurredAt','Ngoài tuần hoặc sự kiện chưa xảy ra');
    if(!options.locked){const deadline=await one<{expired:boolean}>(tx,`SELECT r.entry_deadline_days IS NOT NULL AND ((now() AT TIME ZONE s.timezone)::date-$3::date)>r.entry_deadline_days AS expired FROM app.rule_sets r JOIN platform.schools s ON s.id=r.school_id WHERE r.school_id=$1 AND r.id=$2`,[schoolId,p.rule_set_id,scoped.date]);if(deadline?.expired)throw new Problem(409,'ENTRY_DEADLINE_PASSED');}
    const enrollment=await getResource(tx,resource('enrollment'),schoolId,String(body.enrollmentId));
    if(enrollment.class_id!==classId||enrollment.year_id!==p.year_id||enrollment.status==='CANCELLED'||scoped.date<String(enrollment.starts_on)||(enrollment.ends_on&&scoped.date>=String(enrollment.ends_on)))validation('enrollmentId','Học sinh không thuộc lớp tại ngày sự kiện');
    let key=`manual:${body.clientEventId}`;const sourceId=body.sourceId as string|undefined;
    if(rule.attendance_status&&body.sourceKind!=='ATTENDANCE')validation('sourceKind','Quy tắc liên kết chuyên cần cần chọn sự kiện điểm danh');
    if(body.sourceKind==='ATTENDANCE'){
      if(!sourceId)validation('sourceId','Cần sự kiện điểm danh');
      const source=await one<Row>(tx,`SELECT a.*,s.session_date FROM app.attendance_records a JOIN app.attendance_sessions s ON s.school_id=a.school_id AND s.id=a.session_id WHERE a.school_id=$1 AND a.class_id=$2 AND a.id=$3`,[schoolId,classId,sourceId]);
      if(!source||source.enrollment_id!==body.enrollmentId||source.session_date!==scoped.date||!rule.attendance_status||source.status!==rule.attendance_status)validation('sourceId','Nguồn chuyên cần không khớp học sinh/ngày/quy tắc');key=`attendance:${sourceId}`;
    }else if(body.sourceKind==='ACTIVITY'){
      if(!sourceId)validation('sourceId','Cần kết quả hoạt động');
      const source=await one<Row>(tx,`SELECT p.id FROM app.activity_participants p JOIN app.activities a ON a.school_id=p.school_id AND a.id=p.activity_id
        WHERE p.school_id=$1 AND p.class_id=$2 AND p.enrollment_id=$3 AND p.id=$4 AND p.status='APPROVED' AND p.cancelled_at IS NULL AND a.status IN ('ASSIGNED','CLOSED') AND a.assigned_at<=$5 AND p.created_at<=$5`,[schoolId,classId,body.enrollmentId,sourceId,body.occurredAt]);if(!source)validation('sourceId','Chưa có kết quả hoạt động đã duyệt tại thời điểm ghi nhận');key=`activity:${sourceId}`;
    }else if(body.sourceKind==='POSITION'){
      if(!sourceId)validation('sourceId','Cần phân công chức vụ');
      const source=await one<Row>(tx,'SELECT id FROM app.position_assignments WHERE school_id=$1 AND class_id=$2 AND enrollment_id=$3 AND id=$4 AND cancelled_at IS NULL AND starts_on<=$5 AND (ends_on IS NULL OR ends_on>$5)',[schoolId,classId,body.enrollmentId,sourceId,scoped.date]);if(!source)validation('sourceId','Chức vụ không hiệu lực trong ngày');key=`position:${sourceId}:${p.id}`;
    }else if(sourceId)validation('sourceId','Sự kiện thủ công dùng clientEventId riêng');
    const duplicate=await one<Row>(tx,"SELECT id FROM app.conduct_records WHERE school_id=$1 AND enrollment_id=$2 AND (rule_id=$3 OR source_kind='ATTENDANCE') AND source_kind=$4 AND source_key=$5 AND status<>'EXCLUDED' AND ($6::uuid IS NULL OR id<>$6)",[schoolId,body.enrollmentId,rule.id,body.sourceKind,key,options.supersedesId??null]);if(duplicate)throw new Problem(409,'DUPLICATE_SOURCE');
    const delta=ruleDelta(rule,body.manualDelta as string|undefined);return {p,scoped,rule,key,sourceId,delta};
  }
  async insertRecord(tx:Transaction,c:RequestContext,body:Record<string,unknown>,options:{approved?:boolean;supersedesId?:string;authorId?:string}={}){
    const schoolId=c.params.schoolId!,classId=c.params.classId!,{p,scoped,rule,key,sourceId,delta}=await this.prepareRecord(tx,c,body,{locked:options.approved,supersedesId:options.supersedesId,authority:options.approved?'conduct.adjust.approve':undefined});
    const saved=await one<Row>(tx,`INSERT INTO app.conduct_records(school_id,class_id,period_id,rule_set_id,rule_id,enrollment_id,delta_snapshot,rule_label_snapshot,public_reason,internal_note,occurred_at,source_kind,source_key,recorded_by,source_id,subject_id,lesson_id,status,approved_by,approved_at,supersedes_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
    [schoolId,classId,p.id,p.rule_set_id,rule.id,body.enrollmentId,delta,rule.label,body.publicReason,body.internalNote??null,body.occurredAt,body.sourceKind,key,options.authorId??c.principal!.userId,sourceId??null,scoped.lesson?.subject_id??null,scoped.lesson?.id??null,options.approved?'APPROVED':'DRAFT',options.approved?c.principal!.userId:null,options.approved?new Date():null,options.supersedesId??null]);return saved!;
  }
  async validateCurrentSource(tx:Transaction,row:Row){
    const schoolId=String(row.school_id),classId=String(row.class_id),date=await this.day(tx,schoolId,iso(row.occurred_at as Date));
    let valid=true;
    if(row.lesson_id){const lesson=await one<Row>(tx,`SELECT l.*,(l.starts_at AT TIME ZONE s.timezone)::date AS day FROM app.lesson_occurrences l JOIN platform.schools s ON s.id=l.school_id WHERE l.school_id=$1 AND l.class_id=$2 AND l.id=$3`,[schoolId,classId,row.lesson_id]);valid=!!lesson&&lesson.status==='SCHEDULED'&&lesson.day===date&&lesson.subject_id===row.subject_id;}
    if(row.source_kind==='ATTENDANCE'){
      const source=await one<Row>(tx,`SELECT a.enrollment_id,a.status,s.session_date,s.lesson_id,r.attendance_status FROM app.attendance_records a
        JOIN app.attendance_sessions s ON s.school_id=a.school_id AND s.id=a.session_id JOIN app.conduct_rules r ON r.school_id=a.school_id AND r.id=$4
        WHERE a.school_id=$1 AND a.class_id=$2 AND a.id=$3`,[schoolId,classId,row.source_id,row.rule_id]);
      valid=valid&&!!source&&source.enrollment_id===row.enrollment_id&&source.session_date===date&&source.lesson_id===row.lesson_id&&source.status===source.attendance_status;
    }else if(row.source_kind==='ACTIVITY')valid=valid&&!!await one(tx,`SELECT p.id FROM app.activity_participants p JOIN app.activities a ON a.school_id=p.school_id AND a.id=p.activity_id
      WHERE p.school_id=$1 AND p.class_id=$2 AND p.enrollment_id=$3 AND p.id=$4 AND p.status='APPROVED' AND p.cancelled_at IS NULL AND a.status IN ('ASSIGNED','CLOSED') AND a.assigned_at<=$5 AND p.created_at<=$5`,[schoolId,classId,row.enrollment_id,row.source_id,row.occurred_at]);
    else if(row.source_kind==='POSITION')valid=valid&&!!await one(tx,'SELECT id FROM app.position_assignments WHERE school_id=$1 AND class_id=$2 AND enrollment_id=$3 AND id=$4 AND cancelled_at IS NULL AND starts_on<=$5 AND (ends_on IS NULL OR ends_on>$5)',[schoolId,classId,row.enrollment_id,row.source_id,date]);
    if(!valid)throw new Problem(409,'STALE_SOURCE');
  }
  async review(tx:Transaction,p:Row){const data=await conductSummary(tx,p);const blockers=data.records.filter(r=>r.status==='DRAFT').map(r=>({code:'UNREVIEWED_RECORD',message:'Ghi nhận chưa được rà soát',recordId:String(r.id)}));
    for(const record of data.records.filter(r=>r.status!=='EXCLUDED'))try{await this.validateCurrentSource(tx,record);}catch(error){if(!(error instanceof Problem)||error.code!=='STALE_SOURCE')throw error;blockers.push({code:'STALE_SOURCE',message:'Nguồn sự kiện đã thay đổi, cần loại ghi nhận hoặc điều chỉnh',recordId:String(record.id)});}
    if(!data.summary.students.length)blockers.push({code:'EMPTY_ROSTER',message:'Không có học sinh trong kỳ',recordId:''});
    return {period:dto(periodResource,p),canLock:p.status!=='LOCKED'&&blockers.length===0,blockers:blockers.map(b=>b.recordId?b:{code:b.code,message:b.message}),summary:data.summary};}
  async syncAttendance(tx:Transaction,c:RequestContext,session:Row,record:Row,create:boolean){
    const schoolId=String(session.school_id),classId=String(session.class_id),date=String(session.session_date);
    const existing=await one<Row>(tx,"SELECT * FROM app.conduct_records WHERE school_id=$1 AND class_id=$2 AND source_kind='ATTENDANCE' AND source_id=$3 AND status<>'EXCLUDED' FOR UPDATE",[schoolId,classId,record.id]);
    const week=await one<Row>(tx,'SELECT id FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 AND starts_on<=$3 AND ends_on>$3',[schoolId,session.year_id,date]);
    if(!week){if(existing||create&&['LATE','UNEXCUSED'].includes(String(record.status)))throw new Problem(409,'WEEK_UNAVAILABLE');return {created:0,excluded:0};}
    let p=await one<Row>(tx,'SELECT id FROM app.conduct_periods WHERE school_id=$1 AND class_id=$2 AND week_id=$3',[schoolId,classId,week.id]);
    const ruleSet=p?await conductPeriod(tx,schoolId,classId,String(p.id)):await one<Row>(tx,'SELECT rule_set_id FROM app.class_rule_periods WHERE school_id=$1 AND class_id=$2 AND starts_on<=$3 AND (ends_on IS NULL OR ends_on>$3)',[schoolId,classId,date]);
    const rule=ruleSet?await one<Row>(tx,'SELECT * FROM app.conduct_rules WHERE school_id=$1 AND rule_set_id=$2 AND attendance_status=$3',[schoolId,ruleSet.rule_set_id,record.status]):undefined;
    if(existing&&existing.rule_id===rule?.id)return {created:0,excluded:0};
    if(!existing&&(!create||!rule))return {created:0,excluded:0};
    const lesson=session.lesson_id?await this.lesson(tx,c,String(session.lesson_id)):undefined;
    const broad=await this.scope(tx,c,'conduct.record',date,lesson?.subject_id as string|undefined,lesson?.user_id as string|undefined);
    if(!p)p=await this.createPeriod(tx,c,String(week.id));
    const period=await conductPeriod(tx,schoolId,classId,String(p.id),true);periodWritable(period);
    let excluded=0;
    if(existing){
      if(!broad&&existing.recorded_by!==c.principal!.userId)throw new Problem(409,'REVIEW_REQUIRED');
      if(existing.status==='APPROVED')await this.policy.require(tx,c.principal!,'conduct.review',{schoolId,classId,date});
      await tx.query("UPDATE app.conduct_records SET status='EXCLUDED',exclusion_reason='Trạng thái điểm danh nguồn đã thay đổi' WHERE school_id=$1 AND id=$2",[schoolId,existing.id]);excluded++;
    }
    if(!create||!rule)return {created:0,excluded};
    const timestamp=lesson?.starts_at??(await one<{at:Date}>(tx,"SELECT least(($2::date+time '12:00') AT TIME ZONE timezone,now()) AS at FROM platform.schools WHERE id=$1",[schoolId,date]))!.at;
    const body={periodId:p.id,enrollmentId:record.enrollment_id,ruleId:rule.id,publicReason:`${rule.label} (từ điểm danh)`,occurredAt:iso(timestamp as Date),sourceKind:'ATTENDANCE',sourceId:record.id,clientEventId:record.id};
    const saved=await this.insertRecord(tx,c,body);await audit(tx,c,'conductRecord',String(saved.id),{sourceKind:'ATTENDANCE',sourceId:record.id});return {created:1,excluded};
  }
  async publish(tx:Transaction,c:RequestContext,p:Row,adjusted=false){
    const source:PublicationSource={kind:'CONDUCT',id:String(p.id),schoolId:String(p.school_id),classId:String(p.class_id),yearId:String(p.year_id),version:Number(p.data_version)};
    const ready=await one<Row>(tx,"SELECT * FROM app.publication_revisions WHERE school_id=$1 AND conduct_period_id=$2 AND source_version=$3 AND status='READY' ORDER BY revision DESC LIMIT 1 FOR UPDATE",[p.school_id,p.id,p.data_version]);
    const settings=publicationPolicy(String(p.school_id),(await one<Row>(tx,'SELECT settings,version FROM platform.schools WHERE id=$1',[p.school_id]))!);
    if(settings.requireLeaderApproval){
     const approved=adjusted?await one(tx,"SELECT id FROM app.adjustment_requests WHERE school_id=$1 AND id=$2 AND period_id=$3 AND status='APPROVED' AND app.school_conduct_approver(school_id,decided_by,'conduct.adjust.approve')",[p.school_id,c.params.adjustmentId,p.id]):ready?await one(tx,'SELECT id FROM app.conduct_publication_approvals WHERE school_id=$1 AND publication_id=$2 AND source_version=$3',[p.school_id,ready.id,p.data_version]):undefined;
     if(!approved)throw new Problem(409,'LEADER_APPROVAL_REQUIRED');
    }
    if(ready&&!adjusted)return this.publications.publishReady(tx,c,source,ready);
    const revision=(await one<{next:number}>(tx,'SELECT coalesce(max(revision),0)+1 AS next FROM app.publication_revisions WHERE school_id=$1 AND conduct_period_id=$2',[p.school_id,p.id]))!.next;
    const data=await publicConductItems(tx,p,revision,adjusted);return this.publications.create(tx,c,source,data.snapshot,data.items,true);
  }
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,classId=c.params.classId!,op=c.operation.id;
    if(op==='getPublicationCenterWorkspace')return this.db.transaction(tx=>schoolConductWorkspace(tx,this.policy,c,this),{schoolId});
    if(conductWorkspaceOperations.includes(op)){
      const authorize=(tx:Transaction)=>authorizeConductWorkspace(tx,this.policy,c),work=(tx:Transaction)=>conductWorkspace(tx,this.policy,c,this,this.publications);
      return c.operation.method==='GET'?this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId}):this.commands.execute(c,authorize,work);
    }
    const authorize=async(tx:Transaction)=>{
      if(['listConductPeriods','listConductRecords','createConductPeriod'].includes(op))return this.policy.require(tx,c.principal!,c.operation.permission,{schoolId,classId,allowSubject:true});
      if(op==='createConductRecord')return this.createScope(tx,c,c.body);
      if(c.params.recordId){const record=await this.record(tx,c);return this.scope(tx,c,c.operation.permission,await this.day(tx,schoolId,iso(record.occurred_at as Date)),record.subject_id as string|undefined,String(record.recorded_by));}
      const period=await conductPeriod(tx,schoolId,classId,c.params.periodId!);return this.scope(tx,c,c.operation.permission,String(period.starts_on));
    };
    const work=async(tx:Transaction):Promise<Result>=>{
      if(op==='listConductPeriods'||op==='listConductRecords'){
        const scope=await this.policy.require(tx,c.principal!,'conduct.read',{schoolId,classId,allowSubject:true}),broad=scope.grants.some(g=>grantAllows(g,'conduct.read',{schoolId,classId},scope.today));
        if(op==='listConductPeriods'){
          const weeks=(await tx.query<{id:string;starts_on:string}>('SELECT id,starts_on FROM app.school_weeks WHERE school_id=$1',[schoolId])).rows.filter(w=>scope.grants.some(g=>grantAllows(g,'conduct.read',{schoolId,classId,date:w.starts_on,allowSubject:true},scope.today))).map(w=>w.id);
          return listResource(tx,periodResource,schoolId,{...c.query,classId},{sql:'t.week_id=ANY($1::uuid[])',values:[weeks]},c.principal!.userId);
        }
        const bounds=scope.grants.filter(g=>g.subject_id&&grantAllows(g,'conduct.read',{schoolId,classId,subjectId:g.subject_id,allowSubject:true},scope.today))
          .map(g=>({subject_id:g.subject_id,from_day:g.role_code==='SUBJECT_TEACHER'?g.starts_on:null,until_day:g.role_code==='SUBJECT_TEACHER'?g.ends_on:null}));
        const result=await listResource(tx,recordResource,schoolId,{...c.query,classId},broad?undefined:{sql:`t.recorded_by=$1 AND EXISTS(
          SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS g(subject_id uuid,from_day date,until_day date) JOIN platform.schools s ON s.id=t.school_id
          WHERE g.subject_id=t.subject_id AND (g.from_day IS NULL OR g.from_day<=(t.occurred_at AT TIME ZONE s.timezone)::date)
          AND (g.until_day IS NULL OR g.until_day>(t.occurred_at AT TIME ZONE s.timezone)::date))`,values:[c.principal!.userId,JSON.stringify(bounds)]},c.principal!.userId);
        for(const row of result.data){for(const key of Object.keys(row))if(row[key]===null)delete row[key];if(!broad)delete row.internalNote;}return result;
      }
      if(op==='getConductSummary')return {data:(await conductSummary(tx,await conductPeriod(tx,schoolId,classId,c.params.periodId!))).summary};
      if(op==='reviewConductPeriod')return {data:await this.review(tx,await conductPeriod(tx,schoolId,classId,c.params.periodId!))};
      await tx.query('SELECT app.lock_school()');
      const cls=await getResource(tx,resource('class'),schoolId,classId),year=await getResource(tx,resource('year'),schoolId,String(cls.year_id));if(cls.status==='ARCHIVED'||year.status==='ARCHIVED')throw new Problem(409,'YEAR_ARCHIVED');
      if(op==='createConductPeriod'){const p=await this.createPeriod(tx,c,String(c.body.weekId));await audit(tx,c,'conductPeriod',String(p.id));return {data:dto(periodResource,p),status:201};}
      if(op==='createConductRecord'){const row=await this.insertRecord(tx,c,c.body),broad=await this.scope(tx,c,'conduct.record',await this.day(tx,schoolId,iso(row.occurred_at as Date)),row.subject_id as string|undefined,String(row.recorded_by));await audit(tx,c,'conductRecord',String(row.id),{sourceKind:row.source_kind});return {data:conductDto(row,!broad),status:201};}
      if(c.params.recordId){
        const old=await this.record(tx,c,true),p=await conductPeriod(tx,schoolId,classId,String(old.period_id),true);version(old,c.body.expectedVersion);
        if(op==='updateConductRecord')periodWritable(p);else if(p.status==='LOCKED')throw new Problem(409,'PERIOD_LOCKED');
        const broad=await this.scope(tx,c,c.operation.permission,await this.day(tx,schoolId,iso(old.occurred_at as Date)),old.subject_id as string|undefined,String(old.recorded_by));
        if(op==='updateConductRecord'){
          if(old.status!=='DRAFT')throw new Problem(409,'RECORD_REVIEWED');
          const rule=await one<Row>(tx,'SELECT * FROM app.conduct_rules WHERE school_id=$1 AND id=$2',[schoolId,old.rule_id]);
          if(Object.hasOwn(c.body,'manualDelta')&&rule!.value_mode==='MANUAL'&&!broad)throw new Problem(404,'RESOURCE_NOT_FOUND');
          if(c.body.publicReason!==undefined&&String(c.body.publicReason).trim().length<3)validation('publicReason','Ghi rõ sự kiện');
          await tx.query(`UPDATE app.conduct_records SET public_reason=CASE WHEN $3::boolean THEN $4 ELSE public_reason END,
            internal_note=CASE WHEN $5::boolean THEN $6 ELSE internal_note END,delta_snapshot=CASE WHEN $7::boolean THEN $8::numeric ELSE delta_snapshot END WHERE school_id=$1 AND id=$2`,
          [schoolId,old.id,Object.hasOwn(c.body,'publicReason'),c.body.publicReason??null,Object.hasOwn(c.body,'internalNote'),c.body.internalNote??null,Object.hasOwn(c.body,'manualDelta'),Object.hasOwn(c.body,'manualDelta')?ruleDelta(rule!,String(c.body.manualDelta)):null]);
        }else{
          await this.policy.require(tx,c.principal!,'conduct.review',{schoolId,classId,date:await this.day(tx,schoolId,iso(old.occurred_at as Date))});
          if(op==='approveConductRecord'){if(old.status!=='DRAFT')throw new Problem(409,'INVALID_STATE');await this.validateCurrentSource(tx,old);await tx.query("UPDATE app.conduct_records SET status='APPROVED',approved_by=$3,approved_at=now() WHERE school_id=$1 AND id=$2",[schoolId,old.id,c.principal!.userId]);}
          else{if(old.status==='EXCLUDED')throw new Problem(409,'INVALID_STATE');await tx.query("UPDATE app.conduct_records SET status='EXCLUDED',exclusion_reason=$3 WHERE school_id=$1 AND id=$2",[schoolId,old.id,reason(c.body.reason)]);}
        }
        const row=await this.record(tx,c);await audit(tx,c,'conductRecord',String(row.id),{status:row.status});return {data:conductDto(row,!broad)};
      }
      let p=await conductPeriod(tx,schoolId,classId,c.params.periodId!,true);await this.scope(tx,c,c.operation.permission,String(p.starts_on));
      if(op==='lockConductPeriod')version(p,c.body.expectedVersion);else if(p.data_version!==c.body.expectedSourceVersion)throw new Problem(409,'STALE_SOURCE',undefined,Number(p.data_version));
      if(op!=='publishConductPeriod'){
        if(p.status==='LOCKED')throw new Problem(409,'PERIOD_LOCKED');const review=await this.review(tx,p);if(!review.canLock)throw new Problem(422,'REVIEW_BLOCKED');
        await tx.query("UPDATE app.conduct_periods SET status='LOCKED',locked_at=now(),locked_by=$3 WHERE school_id=$1 AND id=$2",[schoolId,p.id,c.principal!.userId]);p=await conductPeriod(tx,schoolId,classId,String(p.id));
        if(op==='lockConductPeriod'){
          const revision=(await one<{next:number}>(tx,'SELECT coalesce(max(revision),0)+1 AS next FROM app.publication_revisions WHERE school_id=$1 AND conduct_period_id=$2',[schoolId,p.id]))!.next,data=await publicConductItems(tx,p,revision);
          await this.publications.create(tx,c,{kind:'CONDUCT',id:String(p.id),schoolId,classId,yearId:String(p.year_id),version:Number(p.data_version)},data.snapshot,data.items,false);await audit(tx,c,'conductPeriod',String(p.id),{status:'LOCKED'});return {data:dto(periodResource,p)};
        }
      }else if(p.status!=='LOCKED')throw new Problem(409,'PERIOD_NOT_LOCKED');
      return {data:await this.publish(tx,c,p)};
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId});
    return this.commands.execute(c,authorize,work);
  }
}
