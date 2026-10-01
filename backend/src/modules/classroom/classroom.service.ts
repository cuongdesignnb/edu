import { Injectable } from '@nestjs/common';
import { Database,one,type Transaction,type Row } from '../../database/database';
import { resource,getResource,dto,insertResource,updateResource,listResource,type Resource } from '../../database/resources';
import { Permissions } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,validation,notFound } from '../../common/problem';
import type { Handler,RequestContext,Result } from '../../api.router';
import {teacherClassDirectory} from './teacher-class-directory';
import {classWorkspaceHeader} from './class-workspace-header';

const meta={id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at'};
const group:Resource={table:'app.class_groups',fields:{...meta,classId:'class_id',name:'name',sortOrder:'sort_order'},writeFields:['name','sortOrder'],search:['name'],filters:{}};
const position:Resource={table:'app.class_positions',fields:{...meta,classId:'class_id',code:'code',name:'name',singleHolder:'single_holder',groupId:'group_id'},writeFields:['code','name','singleHolder','groupId'],search:['name','code'],filters:{}};
const assignment:Resource={table:'app.position_assignments',fields:{...meta,positionId:'position_id',enrollmentId:'enrollment_id',startsOn:'starts_on',endsOn:'ends_on',cancelledAt:'cancelled_at'},writeFields:[],search:[],filters:{positionId:'position_id',enrollmentId:'enrollment_id'}};
const seating:Resource={table:'app.seating_plans',fields:{...meta,classId:'class_id',revision:'revision',effectiveOn:'effective_on',endsOn:'ends_on',status:'status',layout:'layout'},writeFields:[],search:[],filters:{status:'status'}};
type Seat={key:string;row:number;column:number;enrollmentId:string|null};

@Injectable()
export class ClassroomService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands){}
  handlers():Record<string,Handler>{
    return {...Object.fromEntries(['listGroups','createGroup','updateGroup','assignGroup','listPositions','createPosition','updatePosition',
      'listPositionAssignments','assignPosition','endPositionAssignment','listSeatingPlans','createSeatingPlan','getSeatingPlan','updateSeatingPlan','activateSeatingPlan'].map(id=>[id,(c:RequestContext)=>this.handle(c)])),listTeacherClassDirectory:(c:RequestContext)=>teacherClassDirectory(this.db,this.policy,c),getClassWorkspaceHeader:(c:RequestContext)=>classWorkspaceHeader(this.db,this.policy,c)};
  }
  private async context(tx:Transaction,c:RequestContext){
    const schoolId=c.params.schoolId!,classId=c.params.classId!,date=c.body.effectiveOn??c.body.startsOn??c.body.endsOn??c.query.onDate;
    const allowed=await this.policy.require(tx,c.principal!,c.operation.permission,{schoolId,classId,date:date as string|undefined});
    const cls=await getResource(tx,resource('class'),schoolId,classId,c.operation.method!=='GET');
    const year=await getResource(tx,resource('year'),schoolId,String(cls.year_id));
    if(c.operation.method!=='GET'&&(cls.status==='ARCHIVED'||year.status==='ARCHIVED'))throw new Problem(409,'YEAR_ARCHIVED');
    return {schoolId,classId,cls,year,...allowed};
  }
  private version(row:Row,expected:unknown){if(row.version!==expected)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row.version));}
  private async row(tx:Transaction,r:Resource,c:RequestContext,id:string,lock=false){
    const value=await getResource(tx,r,c.params.schoolId!,id,lock);if(value.class_id!==c.params.classId)notFound();return value;
  }
  private async enrollment(tx:Transaction,c:RequestContext,id:string,date:string,until?:string){
    const e=await getResource(tx,resource('enrollment'),c.params.schoolId!,id);
    if(e.class_id!==c.params.classId||e.status==='CANCELLED'||String(e.starts_on)>date||(e.ends_on&&String(e.ends_on)<=date)||(until&&e.ends_on&&until>String(e.ends_on)))validation('enrollmentId','Học sinh không thuộc lớp trong thời gian này');return e;
  }
  private dated(c:RequestContext,ctx:Awaited<ReturnType<ClassroomService['context']>>,date:string){
    if(date<String(ctx.year.starts_on)||date>=String(ctx.year.ends_on))validation('effectiveOn','Ngày ngoài năm học');
    if(date<ctx.today){
      if(!ctx.grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes(c.operation.permission)))throw new Problem(403,'BACKDATED_SCHOOL_AUTHORITY_REQUIRED');
      if(typeof c.body.reason!=='string'||c.body.reason.trim().length<5)validation('reason','Thay đổi lùi ngày cần lý do');
    }
  }
  private async handle(c:RequestContext):Promise<Result>{
    const authorize=(tx:Transaction)=>this.context(tx,c);
    const work=async(tx:Transaction)=>{
      const ctx=await authorize(tx),op=c.operation.id,predicate={sql:'t.class_id=$1',values:[ctx.classId]};
      if(op==='listGroups'){
        const day=c.query.onDate??ctx.today;this.dateRange(ctx,day);
        const page=await listResource(tx,group,ctx.schoolId,c.query,predicate,c.principal!.userId);
        for(const item of page.data)item.enrollmentIds=(await tx.query<{enrollment_id:string}>(`SELECT g.enrollment_id FROM app.group_memberships g JOIN app.enrollments e ON e.school_id=g.school_id AND e.id=g.enrollment_id
          WHERE g.school_id=$1 AND g.group_id=$2 AND g.cancelled_at IS NULL AND g.starts_on<=$3 AND g.ends_on>$3
          AND e.status<>'CANCELLED' AND e.starts_on<=$3 AND (e.ends_on IS NULL OR e.ends_on>$3) ORDER BY g.enrollment_id`,[ctx.schoolId,item.id,day])).rows.map(row=>row.enrollment_id);
        return page;
      }
      if(op==='listPositions')return listResource(tx,position,ctx.schoolId,c.query,predicate,c.principal!.userId);
      if(op==='createGroup'||op==='createPosition'){
        const r=op==='createGroup'?group:position;
        if(c.body.groupId)await this.row(tx,group,c,String(c.body.groupId));
        const data=await insertResource(tx,r,ctx.schoolId,c.body,{class_id:ctx.classId});await audit(tx,c,r.table,String(data.id));return {data,status:201};
      }
      if(op==='updateGroup'||op==='updatePosition'){
        const r=op==='updateGroup'?group:position,id=c.params.groupId??c.params.positionId!,row=await this.row(tx,r,c,id,true);
        if(op==='updatePosition'&&c.body.singleHolder!==undefined&&c.body.singleHolder!==row.single_holder&&(await tx.query('SELECT id FROM app.position_assignments WHERE school_id=$1 AND position_id=$2 AND cancelled_at IS NULL LIMIT 1',[ctx.schoolId,id])).rowCount)throw new Problem(409,'POSITION_IN_USE');
        const data=await updateResource(tx,{...r,writeFields:r.writeFields.filter(field=>!['code','groupId'].includes(field))},ctx.schoolId,id,c.body);await audit(tx,c,r.table,id);return {data};
      }
      if(op==='assignGroup'){
        const day=String(c.body.effectiveOn),target=c.body.groupId as string|null,ids=c.body.enrollmentIds as string[];
        this.version(ctx.cls,c.body.expectedClassVersion);this.dated(c,ctx,day);if(new Set(ids).size!==ids.length)validation('enrollmentIds','Học sinh bị lặp');
        if(target)await this.row(tx,group,c,target);
        for(const id of [...ids].sort()){
          const e=await this.enrollment(tx,c,id,day),existing=await one<Row>(tx,`SELECT * FROM app.group_memberships WHERE school_id=$1 AND enrollment_id=$2 AND cancelled_at IS NULL AND starts_on<=$3 AND ends_on>$3 FOR UPDATE`,[ctx.schoolId,id,day]);
          if(existing?.group_id===target)continue;
          const leaders=existing?(await tx.query<Row>(`SELECT a.* FROM app.position_assignments a JOIN app.class_positions p ON p.school_id=a.school_id AND p.id=a.position_id
            WHERE a.school_id=$1 AND a.enrollment_id=$2 AND a.cancelled_at IS NULL AND p.group_id=$3 AND a.ends_on>$4 AND a.starts_on<$5 FOR UPDATE OF a`,[ctx.schoolId,id,existing.group_id,day,existing.ends_on])).rows:[];
          for(const leader of leaders)await this.closePosition(tx,c,leader,day);
          if(existing)await this.closeGroup(tx,ctx.schoolId,existing,day);
          if(target){
            const future=await one<{starts_on:string}>(tx,'SELECT starts_on FROM app.group_memberships WHERE school_id=$1 AND enrollment_id=$2 AND cancelled_at IS NULL AND starts_on>$3 ORDER BY starts_on LIMIT 1',[ctx.schoolId,id,day]);
            const end=[String(e.ends_on??ctx.year.ends_on),future?.starts_on].filter((value):value is string=>!!value).sort()[0]!;
            await tx.query('INSERT INTO app.group_memberships(school_id,class_id,group_id,enrollment_id,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6)',[ctx.schoolId,ctx.classId,target,id,day,end]);
          }
        }
        const changed=await one<{version:number}>(tx,'UPDATE app.classes SET name=name WHERE school_id=$1 AND id=$2 RETURNING version',[ctx.schoolId,ctx.classId]);await audit(tx,c,'class',ctx.classId,{groupId:target,enrollmentIds:ids,effectiveOn:day});return {data:{id:ctx.classId,status:'APPLIED',version:changed!.version}};
      }
      if(op==='listPositionAssignments'){
        const day=c.query.onDate;let extra=predicate;
        if(day){this.dateRange(ctx,day);extra={sql:predicate.sql+' AND t.cancelled_at IS NULL AND t.starts_on<=$2 AND t.ends_on>$2',values:[ctx.classId,day]};}
        return listResource(tx,assignment,ctx.schoolId,c.query,extra,c.principal!.userId);
      }
      if(op==='assignPosition'){
        const day=String(c.body.startsOn),pos=await this.row(tx,position,c,String(c.body.positionId),true);this.dated(c,ctx,day);
        const e=await this.enrollment(tx,c,String(c.body.enrollmentId),day),end=String(c.body.endsOn??e.ends_on??ctx.year.ends_on);
        if(end<=day||end>String(ctx.year.ends_on)||(e.ends_on&&end>String(e.ends_on)))validation('endsOn','Khoảng chức vụ ngoài thời gian theo học');
        if(pos.group_id&&!(await tx.query('SELECT id FROM app.group_memberships WHERE school_id=$1 AND group_id=$2 AND enrollment_id=$3 AND cancelled_at IS NULL AND starts_on<=$4 AND ends_on>=$5',[ctx.schoolId,pos.group_id,e.id,day,end])).rowCount)validation('enrollmentId','Tổ trưởng phải thuộc đúng tổ trong thời gian này');
        const conflicts=await tx.query(`SELECT id FROM app.position_assignments WHERE school_id=$1 AND position_id=$2 AND cancelled_at IS NULL AND daterange(starts_on,ends_on,'[)')&&daterange($3::date,$4::date,'[)') AND ($5::boolean OR enrollment_id=$6)`,[ctx.schoolId,pos.id,day,end,pos.single_holder,e.id]);
        if(conflicts.rowCount)throw new Problem(409,'POSITION_HOLDER_CONFLICT');
        const row=await one<Row>(tx,'INSERT INTO app.position_assignments(school_id,class_id,position_id,enrollment_id,starts_on,ends_on) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[ctx.schoolId,ctx.classId,pos.id,e.id,day,end]);await audit(tx,c,'positionAssignment',String(row!.id));return {data:dto(assignment,row!),status:201};
      }
      if(op==='endPositionAssignment'){
        const row=await this.row(tx,{...assignment,fields:{...assignment.fields,classId:'class_id'}},c,c.params.assignmentId!,true);this.version(row,c.body.expectedVersion);this.dated(c,ctx,String(c.body.endsOn));
        if(row.cancelled_at||String(c.body.endsOn)<String(row.starts_on)||String(c.body.endsOn)>String(row.ends_on))validation('endsOn','Ngày kết thúc không hợp lệ');
        const data=dto(assignment,await this.closePosition(tx,c,row,String(c.body.endsOn)));await audit(tx,c,'positionAssignment',String(row.id));return {data};
      }
      if(op==='listSeatingPlans'){
        const page=await listResource(tx,seating,ctx.schoolId,c.query,predicate,c.principal!.userId);return {...page,data:page.data.map(item=>this.seatingDto(item))};
      }
      if(op==='getSeatingPlan')return {data:this.seatingDto(dto(seating,await this.row(tx,seating,c,c.params.planId!)))};
      if(op==='createSeatingPlan'||op==='updateSeatingPlan'){
        const day=String(c.body.effectiveOn);this.dateRange(ctx,day);if(day<ctx.today)validation('effectiveOn','Ngày áp dụng không trước hôm nay');
        const seats=c.body.seats as Seat[];await this.validateSeats(tx,c,seats,day);
        let plan:Row;
        if(op==='createSeatingPlan'){
          const latest=Number((await one<{n:number}>(tx,'SELECT coalesce(max(revision),0) AS n FROM app.seating_plans WHERE school_id=$1 AND class_id=$2',[ctx.schoolId,ctx.classId]))!.n);
          if(c.body.expectedRevision!==undefined&&c.body.expectedRevision!==latest)throw new Problem(409,'SEATING_REVISION_CONFLICT',undefined,latest||undefined);
          plan=(await one<Row>(tx,'INSERT INTO app.seating_plans(school_id,class_id,revision,effective_on,layout,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[ctx.schoolId,ctx.classId,latest+1,day,{seats},c.principal!.userId]))!;
        }else{
          plan=await this.row(tx,seating,c,c.params.planId!,true);this.version(plan,c.body.expectedVersion);if(plan.status!=='DRAFT')throw new Problem(409,'SEATING_IMMUTABLE');
          await tx.query('DELETE FROM app.seat_assignments WHERE school_id=$1 AND plan_id=$2',[ctx.schoolId,plan.id]);
          plan=(await one<Row>(tx,'UPDATE app.seating_plans SET effective_on=$3,layout=$4 WHERE school_id=$1 AND id=$2 RETURNING *',[ctx.schoolId,plan.id,day,{seats}]))!;
        }
        for(const seat of seats)await tx.query('INSERT INTO app.seat_assignments(school_id,class_id,plan_id,seat_key,enrollment_id) VALUES($1,$2,$3,$4,$5)',[ctx.schoolId,ctx.classId,plan.id,seat.key,seat.enrollmentId]);
        await audit(tx,c,'seatingPlan',String(plan.id));return {data:this.seatingDto(dto(seating,plan)),status:op==='createSeatingPlan'?201:200};
      }
      if(op==='activateSeatingPlan'){
        const plan=await this.row(tx,seating,c,c.params.planId!,true);this.version(plan,c.body.expectedVersion);if(plan.status!=='DRAFT')throw new Problem(409,'SEATING_IMMUTABLE');
        if(String(plan.effective_on)<ctx.today)validation('effectiveOn','Ngày áp dụng không trước hôm nay');await this.validateSeats(tx,c,(plan.layout as {seats:Seat[]}).seats,String(plan.effective_on));
        const later=await one<{effective_on:string}>(tx,"SELECT effective_on FROM app.seating_plans WHERE school_id=$1 AND class_id=$2 AND status='ACTIVE' AND effective_on>$3 ORDER BY effective_on LIMIT 1",[ctx.schoolId,ctx.classId,plan.effective_on]);
        await tx.query("UPDATE app.seating_plans SET status='ARCHIVED' WHERE school_id=$1 AND class_id=$2 AND status='ACTIVE' AND effective_on=$3",[ctx.schoolId,ctx.classId,plan.effective_on]);
        await tx.query("UPDATE app.seating_plans SET ends_on=$3 WHERE school_id=$1 AND class_id=$2 AND status='ACTIVE' AND effective_on<$3 AND (ends_on IS NULL OR ends_on>$3)",[ctx.schoolId,ctx.classId,plan.effective_on]);
        const row=await one<Row>(tx,"UPDATE app.seating_plans SET status='ACTIVE',ends_on=$3 WHERE school_id=$1 AND id=$2 RETURNING *",[ctx.schoolId,plan.id,later?.effective_on??ctx.year.ends_on]);await audit(tx,c,'seatingPlan',String(plan.id));return {data:this.seatingDto(dto(seating,row!))};
      }
      throw new Error('Classroom operation registry mismatch');
    };
    return c.operation.method==='GET'?this.db.transaction(work,{schoolId:c.params.schoolId}):this.commands.execute(c,authorize,work);
  }
  private dateRange(ctx:Awaited<ReturnType<ClassroomService['context']>>,day:string){if(day<String(ctx.year.starts_on)||day>=String(ctx.year.ends_on))validation('onDate','Ngày ngoài năm học');}
  private async closeGroup(tx:Transaction,schoolId:string,row:Row,day:string){
    await tx.query(`UPDATE app.group_memberships SET ${String(row.starts_on)>=day?'cancelled_at=now()':'ends_on=$3'} WHERE school_id=$1 AND id=$2`,String(row.starts_on)>=day?[schoolId,row.id]:[schoolId,row.id,day]);
  }
  private async closePosition(tx:Transaction,c:RequestContext,row:Row,day:string){
    const locked=(await tx.query(`SELECT r.id FROM app.conduct_records r JOIN app.conduct_periods p ON p.school_id=r.school_id AND p.id=r.period_id JOIN platform.schools s ON s.id=r.school_id
      WHERE r.school_id=$1 AND r.source_kind='POSITION' AND r.source_id=$2 AND r.status='APPROVED' AND p.status='LOCKED' AND (r.occurred_at AT TIME ZONE s.timezone)::date>=$3 LIMIT 1`,[c.params.schoolId,row.id,day])).rowCount;
    if(locked)throw new Problem(409,'LOCKED_CONDUCT_SOURCE');
    return (await one<Row>(tx,`UPDATE app.position_assignments SET ${String(row.starts_on)>=day?'cancelled_at=now()':'ends_on=$3'} WHERE school_id=$1 AND id=$2 RETURNING *`,String(row.starts_on)>=day?[c.params.schoolId,row.id]:[c.params.schoolId,row.id,day]))!;
  }
  private async validateSeats(tx:Transaction,c:RequestContext,seats:Seat[],day:string){
    const keys=new Set<string>(),coordinates=new Set<string>(),students=new Set<string>();
    for(const seat of seats){
      const coordinate=`${seat.row}:${seat.column}`;
      if(!seat.key.trim()||seat.key.length>100||keys.has(seat.key)||coordinates.has(coordinate)||seat.row>199||seat.column>199)validation('seats','Mã ghế hoặc tọa độ bị trùng/không hợp lệ');keys.add(seat.key);coordinates.add(coordinate);
      if(seat.enrollmentId){if(students.has(seat.enrollmentId))validation('seats','Một học sinh chỉ có một ghế');students.add(seat.enrollmentId);await this.enrollment(tx,c,seat.enrollmentId,day);}
    }
  }
  private seatingDto(value:Record<string,unknown>){const {layout,...base}=value;return {...base,seats:(layout as {seats?:Seat[]}).seats??[]};}
}
