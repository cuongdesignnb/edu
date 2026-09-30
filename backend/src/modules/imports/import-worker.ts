import { Database,one,type Transaction,type Row } from '../../database/database';
import { canonical } from '../../common/commands';
import { Permissions,coversDelegatedExpiry } from '../../common/permissions';
import { Problem,mapError } from '../../common/problem';
import { hashToken } from '../../common/security';
import { ImportsService,emptySummary } from './imports.service';
import { placeEnrollment,checkCapacity } from '../students/enrollment';
import { InvitationsService,type Proposal,type WorkProfile } from '../identity/invitations.service';
import { readImportContext,type ImportContext } from './import-context';

type Context=ImportContext;
type Values=Record<string,string>;
interface Plan {values:Values;decision:'ADD'|'UPDATE'|'SKIP';id?:string;version?:number;classId?:string;gradeId?:string;
  enrollmentId?:string;subjectId?:string;memberId?:string;roomId?:string;proposal?:Proposal;businessKey:string}
interface Ref {table:string;id:string;version:number}
interface Mapping {mapping:{sourceColumn:string;targetField:string}[];mode:string;preview?:Context}
interface Job extends Row {id:string;school_id:string;kind:string;year_id:string;class_id:string|null;requested_by:string;status:string;column_mapping:Mapping}
type Guard=(tx:Transaction)=>Promise<void>;
function invalid(field:string,message:string):never{throw new Problem(422,'IMPORT_ROW_INVALID',[{path:field,code:'INVALID',message}]);}
function required(v:Values,key:string,max=200){if(!v[key]||v[key]!.length>max)invalid(key,'Thiếu hoặc quá dài');return v[key]!;}
function code(v:Values,key:string){const value=required(v,key,64);if(!/^[\p{L}\p{N}_.-]+$/u.test(value))invalid(key,'Mã chứa ký tự không hợp lệ');return value;}
function date(value:string,field:string){let normalized=value;const parts=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if(parts)normalized=`${parts[3]}-${parts[2]}-${parts[1]}`;
  const parsed=new Date(normalized+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(normalized)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==normalized)invalid(field,'Ngày không hợp lệ');return normalized;}
// Snapshots are deliberately conservative: concurrent changes to a referenced
// tenant table require a fresh preview. Worker writes are tracked separately so
// a resumed chunk does not invalidate its own frozen source hash.
export class ImportWorker {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly imports:ImportsService,private readonly invitations:InvitationsService){}
  private async job(tx:Transaction,schoolId:string,id:string,lock=false){
    const row=await one<Job>(tx,`SELECT * FROM app.import_jobs WHERE school_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[schoolId,id]);
    if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');return row;
  }
  private async context(tx:Transaction,job:Job):Promise<Context>{
    return readImportContext(tx,job.school_id,job.kind);
  }
  async run(kind:string,schoolId:string,id:string,guard:Guard){
    try{if(kind==='PARSE_IMPORT')await this.imports.parseFile(schoolId,id,guard);
      else if(kind==='VALIDATE_IMPORT')await this.validate(schoolId,id,guard);
      else await this.commit(schoolId,id,guard);
    }catch(error){
      const problem=mapError(error);
      // Lease loss is owned by the replacement worker; never change its job.
      if(problem.code!=='JOB_LEASE_LOST')await this.db.transaction(async tx=>{
        await tx.query('SELECT app.lock_school()');await guard(tx);const job=await this.job(tx,schoolId,id,true);
        if(!['CANCELLED','COMPLETED'].includes(job.status))await tx.query("UPDATE app.import_jobs SET status='FAILED' WHERE school_id=$1 AND id=$2",[schoolId,id]);
        await tx.query(`INSERT INTO app.audit_events(school_id,actor_user_id,actor_kind,action,target_type,target_id,request_id,redacted_after)
          VALUES($1,$2,'SYSTEM','importFailed','import',$3,$4,$5)`,[schoolId,job.requested_by,id,`import:${id}`,{code:problem.code,summary:job.summary}]);
      },{schoolId});
      throw problem;
    }
  }
  async validate(schoolId:string,id:string,guard:Guard){
    await this.db.transaction(async tx=>{
      await tx.query('SELECT app.lock_school()');await guard(tx);const job=await this.job(tx,schoolId,id,true);
      if(job.status==='CANCELLED'||job.status==='READY')return;
      if(job.status!=='VALIDATING'&&job.status!=='FAILED')throw new Problem(422,'INVALID_STATE');
      await this.imports.authorize(tx,schoolId,job.requested_by,job.kind,job.class_id??undefined);
      const rows=(await tx.query<Row>('SELECT * FROM app.import_rows WHERE school_id=$1 AND import_id=$2 ORDER BY row_number',[schoolId,id])).rows;
      if(!rows.length||rows.some(row=>['APPLIED','SKIPPED'].includes(String(row.status))))throw new Problem(422,'IMPORT_ALREADY_PARTIAL');
      const file=await one<{sha256:string}>(tx,"SELECT sha256 FROM app.files WHERE school_id=$1 AND id=$2 AND status='READY'",[schoolId,job.file_id]);
      if(!file)throw new Problem(422,'FILE_UNAVAILABLE');
      const seen=new Set<string>(),plans:Plan[]=[],summary=emptySummary();
      for(const row of rows){
        const values:Values={};for(const entry of job.column_mapping.mapping)values[entry.targetField]=String((row.source_data as Values)[entry.sourceColumn]??'').trim();
        let plan:Plan|undefined;let errors:{field:string;code:string;message:string}[]=[];
        try{
          plan=await this.plan(tx,job,values,file.sha256,seen);
          if(job.kind==='STUDENTS'&&plan.decision==='ADD'){
            const cls=await one<Row>(tx,'SELECT * FROM app.classes WHERE school_id=$1 AND id=$2',[schoolId,plan.classId]);
            const year=await one<Row>(tx,'SELECT * FROM app.academic_years WHERE school_id=$1 AND id=$2',[schoolId,job.year_id]);
            // Validate the peak including every earlier proposed new enrollment.
            const additions=plans.filter(p=>p.classId===plan!.classId&&p.decision==='ADD').map(p=>p.values.startsOn!);
            const start=plan.values.startsOn!,until=String(year!.ends_on);
            for(const day of [...new Set([start,...additions])])if(day>=start&&day<until){
              const n=1+additions.filter(a=>a<=day).length;
              await checkCapacity(tx,schoolId,cls!,day,until,n);
            }
          }
          if(job.kind==='TIMETABLE')this.checkTimetableRows(plan,plans);
          plans.push(plan);summary[plan.decision==='ADD'?'added':plan.decision==='UPDATE'?'updated':'skipped']++;
        }catch(error){const problem=mapError(error);if(problem.status>=500)throw problem;
          errors=(problem.fieldErrors??[{path:'row',code:problem.code,message:problem.code}]).map(e=>({field:e.path,code:e.code,message:e.message}));summary.invalid++;}
        row.normalized_data=plan??{values};row.errors=errors;
        await tx.query(`UPDATE app.import_rows SET normalized_data=$3,errors=$4,status=$5,business_key=$6,result_id=NULL,result_metadata='{}'
          WHERE school_id=$1 AND id=$2`,[schoolId,row.id,row.normalized_data,JSON.stringify(errors),errors.length?'INVALID':'VALID',plan?.businessKey??null]);
      }
      const mapping={...job.column_mapping,preview:await this.context(tx,job)};job.column_mapping=mapping;
      const previewHash=await this.imports.sourceHash(tx,schoolId,job,rows);
      await tx.query("UPDATE app.import_jobs SET status='READY',column_mapping=$3,preview_hash=$4,summary=$5 WHERE school_id=$1 AND id=$2",[schoolId,id,mapping,previewHash,summary]);
    },{schoolId});
  }
  private async plan(tx:Transaction,job:Job,v:Values,fileHash:string,seen:Set<string>):Promise<Plan>{
    const year=await one<Row>(tx,"SELECT * FROM app.academic_years WHERE school_id=$1 AND id=$2 AND status<>'ARCHIVED'",[job.school_id,job.year_id]);
    if(!year)invalid('yearId','Năm học không khả dụng');
    for(const [key,value] of Object.entries(v))if(value.length>200)invalid(key,'Giá trị quá dài');
    const p:Plan={values:v,decision:'ADD',businessKey:hashToken(canonical({fileHash,kind:job.kind,year:job.year_id,classId:job.class_id,mapping:job.column_mapping.mapping,values:v}))};
    let key='';
    if(job.kind==='STUDENTS'){
      key=code(v,'studentCode');required(v,'fullName');
      if(Object.hasOwn(v,'gender')){const normalized=v.gender!.normalize('NFD').replace(/\p{M}/gu,'').trim().toLowerCase();if(!['nam','nu'].includes(normalized))invalid('gender','Giới tính phải là Nam hoặc Nữ');v.gender=normalized==='nam'?'Nam':'Nữ';}
      if(v.dateOfBirth){v.dateOfBirth=date(v.dateOfBirth,'dateOfBirth');if(v.dateOfBirth>String(year.ends_on)||v.dateOfBirth<'1900-01-01')invalid('dateOfBirth','Ngày sinh ngoài phạm vi');}
      const cls=await this.classFor(tx,job,v.classCode);p.classId=String(cls.id);
      await this.policy.require(tx,{userId:job.requested_by},'student.manage',{schoolId:job.school_id,classId:p.classId});
      if(v.guardianName||v.guardianPhone||v.guardianEmail){
        await this.policy.require(tx,{userId:job.requested_by},'guardian.manage',{schoolId:job.school_id,classId:p.classId});required(v,'guardianName');
        if(v.guardianEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.guardianEmail))invalid('guardianEmail','Email không hợp lệ');
        if(v.guardianPhone&&!/^[+\d ().-]{6,30}$/.test(v.guardianPhone))invalid('guardianPhone','Điện thoại không hợp lệ');
      }
      v.startsOn=v.startsOn?date(v.startsOn,'startsOn'):String(year.starts_on);
      if(v.startsOn<String(year.starts_on)||v.startsOn>=String(year.ends_on))invalid('startsOn','Ngoài năm học');
      const existing=await one<Row>(tx,'SELECT * FROM app.students WHERE school_id=$1 AND student_code=$2',[job.school_id,key]);
      if(existing){
        p.id=String(existing.id);p.version=Number(existing.version);p.decision=job.column_mapping.mode==='ADD_ONLY'?'SKIP':'UPDATE';
        const enrollment=await one<Row>(tx,"SELECT * FROM app.enrollments WHERE school_id=$1 AND student_id=$2 AND year_id=$3 AND status<>'CANCELLED' ORDER BY starts_on LIMIT 1",[job.school_id,existing.id,job.year_id]);
        if(existing.status!=='ACTIVE'||!enrollment||enrollment.class_id!==cls.id)invalid('studentCode','Mã hiện có không thuộc lớp/năm này; dùng quy trình chuyển lớp');
        p.enrollmentId=String(enrollment.id);
        if(p.decision==='UPDATE'&&(v.guardianName||v.guardianPhone||v.guardianEmail))invalid('guardianName','Cập nhật quan hệ giám hộ cần thao tác riêng và xác minh');
      }
    }else if(job.kind==='CLASSES'){
      key=code(v,'code');required(v,'name');code(v,'gradeCode');
      const grade=await one<Row>(tx,"SELECT id FROM app.grade_levels WHERE school_id=$1 AND code=$2 AND status='ACTIVE'",[job.school_id,v.gradeCode]);
      if(!grade)invalid('gradeCode','Không có khối đang hoạt động');p.gradeId=String(grade.id);
      v.capacity=v.capacity||'45';if(!/^\d+$/.test(v.capacity)||Number(v.capacity)<1||Number(v.capacity)>200)invalid('capacity','Sức chứa 1–200');
      const existing=await one<Row>(tx,'SELECT * FROM app.classes WHERE school_id=$1 AND year_id=$2 AND code=$3',[job.school_id,job.year_id,key]);
      if(existing){if(existing.status==='ARCHIVED')invalid('code','Lớp đã lưu trữ');p.id=String(existing.id);p.version=Number(existing.version);p.decision=job.column_mapping.mode==='ADD_ONLY'?'SKIP':'UPDATE';
        if(p.decision==='UPDATE')await checkCapacity(tx,job.school_id,{...existing,capacity:Number(v.capacity)},String(year.starts_on),String(year.ends_on),0);}
    }else if(job.kind==='STAFF'){
      key=code(v,'staffCode');v.email=required(v,'email',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))invalid('email','Email không hợp lệ');required(v,'workDisplayName');
      if(v.workPhone&&!/^[+\d ().-]{6,30}$/.test(v.workPhone))invalid('workPhone','Điện thoại không hợp lệ');
      if((await tx.query("SELECT id FROM app.staff_invitations WHERE school_id=$1 AND status='PENDING' AND expires_at>now() AND (email_normalized=$2 OR work_profile->>'staffCode'=$3)",[job.school_id,v.email,key])).rowCount)invalid('email','Đã có lời mời đang chờ');
      const existing=await one<Row>(tx,`SELECT m.*,u.email_normalized FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1 AND m.staff_code=$2`,[job.school_id,key]);
      if(existing){if(existing.email_normalized!==v.email||existing.status!=='ACTIVE')invalid('staffCode','Mã và danh tính email không khớp');p.id=String(existing.id);p.version=Number(existing.version);p.decision=job.column_mapping.mode==='ADD_ONLY'?'SKIP':'UPDATE';}
      else{
        if((await tx.query('SELECT m.id FROM app.memberships m JOIN identity.users u ON u.id=m.user_id WHERE m.school_id=$1 AND u.email_normalized=$2',[job.school_id,v.email])).rowCount)invalid('email','Nhân sự hiện có cần đối chiếu mã');
        p.proposal=await this.proposal(tx,job,v,year);
      }
    }else{
      const cls=await this.classFor(tx,job);p.classId=String(cls.id);
      const weekday=Number(v.weekday),slot=Number(v.slot);if(!Number.isInteger(weekday)||weekday<1||weekday>7||!Number.isInteger(slot)||slot<1||slot>20)invalid('slot','Ngày 1–7, tiết 1–20');key=`${weekday}:${slot}`;
      for(const name of ['startsAt','endsAt'])if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(v[name]??''))invalid(name,'Giờ cần HH:mm');
      if(v.startsAt!>=v.endsAt!)invalid('endsAt','Giờ kết thúc phải sau bắt đầu');
      const subject=await one<Row>(tx,"SELECT id FROM app.subjects WHERE school_id=$1 AND code=$2 AND status='ACTIVE'",[job.school_id,code(v,'subjectCode')]);
      const member=await one<Row>(tx,"SELECT id FROM app.memberships WHERE school_id=$1 AND staff_code=$2 AND status='ACTIVE'",[job.school_id,code(v,'staffCode')]);
      if(!subject||!member)invalid('staffCode','Môn/nhân sự không khả dụng');p.subjectId=String(subject.id);p.memberId=String(member.id);
      if(!(await tx.query(`SELECT id FROM app.teaching_assignments WHERE school_id=$1 AND class_id=$2 AND member_id=$3 AND subject_id=$4 AND kind='SUBJECT'
        AND revoked_at IS NULL AND starts_on<=$5 AND (ends_on IS NULL OR ends_on>=$6)`,[job.school_id,cls.id,member.id,subject.id,year.starts_on,year.ends_on])).rowCount)invalid('staffCode','Cần phân công môn bao phủ thời hạn lịch');
      if(v.roomCode){const room=await one<Row>(tx,"SELECT id FROM app.rooms WHERE school_id=$1 AND code=$2 AND status='ACTIVE'",[job.school_id,v.roomCode]);if(!room)invalid('roomCode','Không có phòng');p.roomId=String(room.id);}
      const clash=(await tx.query(`SELECT e.id FROM app.timetable_entries e JOIN app.timetable_versions t ON t.school_id=e.school_id AND t.id=e.timetable_id
        WHERE e.school_id=$1 AND t.status='PUBLISHED' AND t.class_id<>$2 AND daterange(t.starts_on,t.ends_on,'[)')&&daterange($3,$4,'[)')
        AND e.weekday=$5 AND e.starts_at_local<$7::time AND e.ends_at_local>$6::time AND (e.member_id=$8 OR ($9::uuid IS NOT NULL AND e.room_id=$9)) LIMIT 1`,
      [job.school_id,cls.id,year.starts_on,year.ends_on,weekday,v.startsAt,v.endsAt,p.memberId,p.roomId??null])).rowCount;
      if(clash)invalid('slot','Trùng giáo viên/phòng với lịch đã công bố');
    }
    if(seen.has(key))invalid('row','Mã hoặc tiết bị trùng trong file');seen.add(key);
    const applied=await one<Row>(tx,"SELECT result_id FROM app.import_rows WHERE school_id=$1 AND business_key=$2 AND status='APPLIED'",[job.school_id,p.businessKey]);
    if(applied){p.decision='SKIP';p.id??=String(applied.result_id);}return p;
  }
  private async classFor(tx:Transaction,job:Job,classCode?:string){
    const cls=await one<Row>(tx,`SELECT * FROM app.classes WHERE school_id=$1 AND year_id=$2 AND status<>'ARCHIVED' AND ${job.class_id?'id=$3':'code=$3'}`,[job.school_id,job.year_id,job.class_id??classCode??'']);
    if(!cls||(classCode&&cls.code!==classCode))invalid('classCode','Không có lớp phù hợp');return cls;
  }
  private async proposal(tx:Transaction,job:Job,v:Values,year:Row):Promise<Proposal>{
    const role=await one<Row>(tx,"SELECT * FROM app.roles WHERE school_id=$1 AND code=$2 AND status='ACTIVE'",[job.school_id,required(v,'roleCode',64)]);if(!role)invalid('roleCode','Vai trò không khả dụng');
    const scope=role.code==='HOMEROOM'?'CLASS':role.code==='SUBJECT_TEACHER'?'SUBJECT':'SCHOOL';
    if(scope==='SCHOOL'&&(v.classCode||v.subjectCode))invalid('roleCode','Vai trò này cần phạm vi trường');
    const cls=scope==='SCHOOL'?undefined:await this.classFor(tx,{...job,class_id:null},required(v,'classCode'));
    const subject=scope==='SUBJECT'?await one<Row>(tx,"SELECT id FROM app.subjects WHERE school_id=$1 AND code=$2 AND status='ACTIVE'",[job.school_id,required(v,'subjectCode')]):undefined;
    if(scope==='SUBJECT'&&!subject)invalid('subjectCode','Môn không khả dụng');
    const starts=v.startsOn?date(v.startsOn,'startsOn'):String(year.starts_on),ends=v.endsOn?date(v.endsOn,'endsOn'):String(year.ends_on);
    if(starts<String(year.starts_on)||ends>String(year.ends_on)||starts>=ends)invalid('startsOn','Ngoài năm học');
    const timestamps=await one<{starts:Date;ends:Date;today:string}>(tx,`SELECT $1::date::timestamp AT TIME ZONE timezone AS starts,
      $2::date::timestamp AT TIME ZONE timezone AS ends,(now() AT TIME ZONE timezone)::date AS today FROM platform.schools WHERE id=$3`,[starts,ends,job.school_id]);
    const grants=await this.policy.grants(tx,job.requested_by,job.school_id);
    const actions=(await tx.query<{action_code:string}>('SELECT action_code FROM app.role_permissions WHERE school_id=$1 AND role_id=$2 AND $3=ANY(allowed_scopes)',[job.school_id,role.id,scope])).rows;
    if(!actions.length||['member.manage',...actions.map(a=>a.action_code)].some(action=>!grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes(action)&&coversDelegatedExpiry(g,timestamps!.starts,timestamps!.ends))))invalid('roleCode','Vượt quyền hoặc thời hạn của người mời');
    if(scope!=='SCHOOL'){
      if(starts<timestamps!.today&&(!v.reason||v.reason.trim().length<5))invalid('reason','Phân công lùi ngày cần lý do');
      if((await tx.query(`SELECT id FROM app.teaching_assignments WHERE school_id=$1 AND revoked_at IS NULL AND kind=$2
        AND daterange(starts_on,ends_on,'[)')&&daterange($3,$4,'[)') AND ${scope==='CLASS'?'class_id=$5':'class_id=$5 AND subject_id=$6'}`,
      scope==='CLASS'?[job.school_id,'HOMEROOM',starts,ends,cls!.id]:[job.school_id,'SUBJECT',starts,ends,cls!.id,subject!.id])).rowCount)invalid('classCode','Phân công bị trùng');
    }
    return {roleId:String(role.id),scopeType:scope,...(cls?{classId:String(cls.id)}:{}),...(subject?{subjectId:String(subject.id)}:{}),validFrom:timestamps!.starts.toISOString(),validUntil:timestamps!.ends.toISOString(),...(v.reason?{reason:required(v,'reason',2000)}:{})};
  }
  private checkTimetableRows(plan:Plan,previous:Plan[]){
    if(previous.some(p=>p.values.weekday===plan.values.weekday&&p.values.startsAt!<plan.values.endsAt!&&p.values.endsAt!>plan.values.startsAt!))invalid('slot','Hai tiết trong lớp bị chồng giờ');
  }
  async commit(schoolId:string,id:string,guard:Guard){
    let finished=false;while(!finished){
      finished=await this.db.transaction(async tx=>{
        await tx.query('SELECT app.lock_school()');await guard(tx);const job=await this.job(tx,schoolId,id,true);
        if(job.status==='CANCELLED'||job.status==='COMPLETED')return true;
        if(!['APPLYING','FAILED'].includes(job.status))throw new Problem(422,'INVALID_STATE');
        await this.imports.authorize(tx,schoolId,job.requested_by,job.kind,job.class_id??undefined);
        const rows=(await tx.query<Row>('SELECT * FROM app.import_rows WHERE school_id=$1 AND import_id=$2 ORDER BY row_number FOR UPDATE',[schoolId,id])).rows;
        if(rows.some(row=>row.status==='INVALID')||!job.preview_hash||await this.imports.sourceHash(tx,schoolId,job,rows)!==job.preview_hash)throw new Problem(422,'STALE_PREVIEW');
        const expected=structuredClone(job.column_mapping.preview!);if(!expected)throw new Problem(422,'STALE_PREVIEW');
        for(const row of rows)for(const ref of ((row.result_metadata as {refs?:Ref[]}).refs??[]))expected[ref.table]![ref.id]=ref.version;
        if(canonical(expected)!==canonical(await this.context(tx,job)))throw new Problem(422,'STALE_PREVIEW');
        const pending=rows.filter(row=>row.status==='VALID');const chunk=pending.slice(0,rows.length<=500?500:100);
        let timetableId:string|undefined;
        if(job.kind==='TIMETABLE'&&chunk.some(row=>(row.normalized_data as Plan).decision!=='SKIP')){
          timetableId=(rows.find(row=>row.status==='APPLIED')?.result_metadata as {timetableId?:string}|undefined)?.timetableId;
          if(!timetableId){const year=await one<Row>(tx,'SELECT * FROM app.academic_years WHERE school_id=$1 AND id=$2',[schoolId,job.year_id]);
            timetableId=(await one<{id:string}>(tx,`INSERT INTO app.timetable_versions(school_id,class_id,year_id,revision,starts_on,ends_on,created_by)
              SELECT $1,$2,$3,coalesce(max(revision),0)+1,$4,$5,$6 FROM app.timetable_versions WHERE school_id=$1 AND class_id=$2 RETURNING id`,
            [schoolId,job.class_id,job.year_id,year!.starts_on,year!.ends_on,job.requested_by]))!.id;}
        }
        for(const row of chunk){
          await guard(tx);const plan=row.normalized_data as Plan;
          const result=plan.decision==='SKIP'?{id:plan.id,refs:[] as Ref[]}:await this.apply(tx,job,plan,timetableId);
          row.status=plan.decision==='SKIP'?'SKIPPED':'APPLIED';row.result_metadata={refs:result.refs,...(timetableId?{timetableId}:{})};
          await tx.query('UPDATE app.import_rows SET status=$3,result_id=$4,result_metadata=$5 WHERE school_id=$1 AND id=$2',[schoolId,row.id,row.status,result.id??null,row.result_metadata]);
        }
        const done=rows.every(row=>['APPLIED','SKIPPED'].includes(String(row.status))),summary=emptySummary();
        for(const row of rows){const plan=row.normalized_data as Plan;if(row.status==='APPLIED')summary[plan.decision==='ADD'?'added':'updated']++;
          if(row.status==='SKIPPED')summary.skipped++;if(row.status==='APPLIED'||row.status==='SKIPPED')summary.processed++;}
        await tx.query("UPDATE app.import_jobs SET status=$3,summary=$4,completed_at=CASE WHEN $3='COMPLETED' THEN now() ELSE NULL END WHERE school_id=$1 AND id=$2",[schoolId,id,done?'COMPLETED':'APPLYING',summary]);
        await tx.query(`INSERT INTO app.audit_events(school_id,actor_user_id,actor_kind,action,target_type,target_id,request_id,redacted_after)
          VALUES($1,$2,'SYSTEM','importChunkApplied','import',$3,$4,$5)`,[schoolId,job.requested_by,id,`import:${id}`,{summary,status:done?'COMPLETED':'APPLYING'}]);return done;
      },{schoolId});
    }
  }
  private async apply(tx:Transaction,job:Job,p:Plan,timetableId?:string):Promise<{id:string;refs:Ref[]}>{
    const refs:Ref[]=[],v=p.values;const track=(table:string,row:Row)=>{refs.push({table,id:String(row.id),version:Number(row.version)});return String(row.id);};let id='';
    if(job.kind==='STUDENTS'){
      await this.policy.require(tx,{userId:job.requested_by},'student.manage',{schoolId:job.school_id,classId:p.classId});
      const student=p.decision==='ADD'?await one<Row>(tx,`INSERT INTO app.students(school_id,student_code,full_name,date_of_birth,preferred_name,gender) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[job.school_id,v.studentCode,v.fullName,v.dateOfBirth||null,v.preferredName||null,v.gender??null]):
        await one<Row>(tx,`UPDATE app.students SET full_name=$4,date_of_birth=CASE WHEN $5::boolean THEN $6::date ELSE date_of_birth END,
          preferred_name=CASE WHEN $7::boolean THEN $8 ELSE preferred_name END,gender=CASE WHEN $9::boolean THEN $10 ELSE gender END WHERE school_id=$1 AND id=$2 AND version=$3 RETURNING *`,[job.school_id,p.id,p.version,v.fullName,Object.hasOwn(v,'dateOfBirth'),v.dateOfBirth||null,Object.hasOwn(v,'preferredName'),v.preferredName||null,Object.hasOwn(v,'gender'),v.gender??null]);
      if(!student)throw new Problem(422,'STALE_PREVIEW');id=track('students',student);
      if(p.decision==='ADD'){
        const enrollment=await placeEnrollment(tx,job.school_id,id,p.classId!,v.startsOn!);refs.push({table:'enrollments',id:String(enrollment.id),version:Number(enrollment.version)});
        if(v.guardianName){await this.policy.require(tx,{userId:job.requested_by},'guardian.manage',{schoolId:job.school_id,classId:p.classId});
          const guardian=await one<Row>(tx,'INSERT INTO app.guardians(school_id,full_name,phone,email) VALUES($1,$2,$3,$4) RETURNING *',[job.school_id,v.guardianName,v.guardianPhone||null,v.guardianEmail||null]);
          await tx.query(`INSERT INTO app.guardian_relationships(school_id,student_id,guardian_id,relationship_label,is_primary,can_receive_info,status)
            VALUES($1,$2,$3,$4,true,false,'UNVERIFIED')`,[job.school_id,id,guardian!.id,v.relationshipLabel||'Phụ huynh']);}
      }
    }else if(job.kind==='CLASSES'){
      const cls=p.decision==='ADD'?await one<Row>(tx,'INSERT INTO app.classes(school_id,year_id,grade_level_id,code,name,capacity) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[job.school_id,job.year_id,p.gradeId,v.code,v.name,v.capacity]):
        await one<Row>(tx,'UPDATE app.classes SET name=$4,grade_level_id=$5,capacity=$6 WHERE school_id=$1 AND id=$2 AND version=$3 RETURNING *',[job.school_id,p.id,p.version,v.name,p.gradeId,v.capacity]);
      if(!cls)throw new Problem(422,'STALE_PREVIEW');id=track('classes',cls);
    }else if(job.kind==='STAFF'){
      if(p.decision==='UPDATE'){
        const member=await one<Row>(tx,`UPDATE app.memberships SET work_display_name=$4,work_phone=CASE WHEN $5::boolean THEN $6 ELSE work_phone END,
          department=CASE WHEN $7::boolean THEN $8 ELSE department END WHERE school_id=$1 AND id=$2 AND version=$3 RETURNING *`,[job.school_id,p.id,p.version,v.workDisplayName,Object.hasOwn(v,'workPhone'),v.workPhone||null,Object.hasOwn(v,'department'),v.department||null]);
        if(!member)throw new Problem(422,'STALE_PREVIEW');id=track('memberships',member);
      }else{
        const year=await one<Row>(tx,'SELECT * FROM app.academic_years WHERE school_id=$1 AND id=$2',[job.school_id,job.year_id]);
        const proposal=await this.proposal(tx,job,v,year!);const profile:WorkProfile={staffCode:v.staffCode,workDisplayName:v.workDisplayName,...(v.workPhone?{workPhone:v.workPhone}:{}),...(v.department?{department:v.department}:{})};
        const invitation=await this.invitations.create(tx,job.school_id,job.requested_by,v.email!,proposal,profile);id=String(invitation.id);track('staff_invitations',{id,version:invitation.version});
      }
    }else{
      const entry=await one<Row>(tx,`INSERT INTO app.timetable_entries(school_id,class_id,timetable_id,subject_id,member_id,room_id,weekday,period_number,starts_at_local,ends_at_local)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[job.school_id,p.classId,timetableId,p.subjectId,p.memberId,p.roomId??null,v.weekday,v.slot,v.startsAt,v.endsAt]);
      id=track('timetable_entries',entry!);const timetable=await one<Row>(tx,'SELECT * FROM app.timetable_versions WHERE school_id=$1 AND id=$2',[job.school_id,timetableId]);track('timetable_versions',timetable!);
    }
    return {id,refs};
  }
}
