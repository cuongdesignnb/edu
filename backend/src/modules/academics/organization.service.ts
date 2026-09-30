import { Injectable } from '@nestjs/common';
import { Database,one,type Row,type Transaction } from '../../database/database';
import { resource,dto,getResource,insertResource,updateResource,listResource } from '../../database/resources';
import { Permissions } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,validation } from '../../common/problem';
import { checkCapacity } from '../students/enrollment';
import { validateSchoolWebsite } from '../../common/school-website';
import { StaffService } from '../staff/staff.service';
import { createYearSetup,ensureYearRange,addDateDays } from './year-setup';
import { organizationRead } from './organization-read';
import type { RequestContext,Result,Handler } from '../../api.router';

const registry:Record<string,{kind:string;mode:'list'|'get'|'create'|'update'|'status';id?:string;status?:string}>={};
for(const [kind,singular,plural,id] of [
  ['year','Year','Years','yearId'],['term','Term','Terms','termId'],['week','Week','Weeks','weekId'],
  ['calendar','CalendarEvent','CalendarEvents','eventId'],['class','Class','Classs','classId'],
] as const){
  registry[`list${plural}`]={kind,mode:'list'};registry[`get${singular}`]={kind,mode:'get',id};
  registry[`create${singular}`]={kind,mode:'create'};registry[`update${singular}`]={kind,mode:'update',id};
}
Object.assign(registry,{
  activateYear:{kind:'year',mode:'status',id:'yearId',status:'ACTIVE'},archiveYear:{kind:'year',mode:'status',id:'yearId',status:'ARCHIVED'},
  activateClass:{kind:'class',mode:'status',id:'classId',status:'ACTIVE'},archiveClass:{kind:'class',mode:'status',id:'classId',status:'ARCHIVED'},
  publishCalendarEvent:{kind:'calendar',mode:'status',id:'eventId',status:'PUBLISHED'},
});
@Injectable()
export class OrganizationService {
  constructor(private readonly db:Database,private readonly permissions:Permissions,private readonly commands:Commands,private readonly staff:StaffService){}
  handlers():Record<string,Handler>{
    const result:Record<string,Handler>={};
    for(const id of Object.keys(registry))result[id]=c=>this.handle(c);
    for(const id of ['listDictionary','createDictionary','updateDictionary'])result[id]=c=>this.dictionary(c);
    result.getSchoolProfile=c=>this.profile(c);
    result.updateSchoolProfile=c=>this.profile(c);
    return result;
  }
  private async handle(c:RequestContext):Promise<Result>{
    const entry=registry[c.operation.id]!,r=resource(entry.kind),schoolId=c.params.schoolId!,id=entry.id?c.params[entry.id]:undefined;
    const picker=c.query.purpose;
    if(picker&&(entry.mode!=='list'||!['year','class'].includes(entry.kind)||!['class-picker','assignment-picker'].includes(picker)))validation('purpose','Mục đích danh sách không hợp lệ');
    const authorize=async(tx:Transaction)=>{
      if(picker)return entry.kind==='class'?this.permissions.collection(tx,c.principal!,picker==='class-picker'?'class.manage':'assignment.manage',schoolId):this.permissions.require(tx,c.principal!,picker==='class-picker'?'class.manage':'assignment.manage',{schoolId});
      if(entry.kind==='year'&&c.body.copyRules)await this.permissions.require(tx,c.principal!,'rules.read+rules.manage',{schoolId});
      if(entry.kind==='class'&&c.body.homeroomMemberId)await this.permissions.require(tx,c.principal!,'assignment.manage',{schoolId});
      if(entry.mode==='list'&&entry.kind==='class')return this.permissions.collection(tx,c.principal!,'class.read',schoolId,true);
      return this.permissions.require(tx,c.principal!,c.operation.permission,{
        schoolId,classId:entry.kind==='class'?id:undefined,
        allowSubject:entry.mode==='get',allowScopedContext:['year','term','week'].includes(entry.kind)&&c.operation.method==='GET',
      });
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{
      const allowed=await authorize(tx);
      const view=picker?{resource:r,bindings:[]}:organizationRead(entry.kind,schoolId,allowed.grants,allowed.today,entry.mode==='list');
      if(entry.mode==='get')return {data:dto(view.resource,await getResource(tx,view.resource,schoolId,id!,false,view.bindings))};
      const classes=entry.kind==='class'?allowed as unknown as {all:boolean;classIds:string[]}:undefined;
      const extra={sql:'',values:[] as unknown[]};
      if(classes&&!classes.all){extra.sql='t.id=ANY($1::uuid[])';extra.values.push(classes.classIds);}
      if(picker){
        if(c.query.homeroom||c.query.homeroomMemberId||c.query.homeroomUserId)validation('homeroom','Bộ chọn lớp không trả dữ liệu chủ nhiệm');
        extra.sql+=(extra.sql?' AND ':'')+"t.status<>'ARCHIVED'";
        if(entry.kind==='class')extra.sql+=" AND EXISTS(SELECT 1 FROM app.academic_years y WHERE y.school_id=t.school_id AND y.id=t.year_id AND y.status<>'ARCHIVED')";
      }
      if(entry.kind==='class'&&!picker&&c.query.homeroom==='none')extra.sql+=(extra.sql?' AND ':'')+'t.homeroom_member_id IS NULL';
      if(entry.kind==='week'&&c.query.onDate){
        const date=c.query.onDate,parsed=new Date(`${date}T00:00:00Z`);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)validation('onDate','Ngày chưa hợp lệ');
        extra.values.push(date);extra.sql+=(extra.sql?' AND ':'')+`t.starts_on<=$${extra.values.length}::date AND t.ends_on>$${extra.values.length}::date`;
      }
      return listResource(tx,view.resource,schoolId,c.query,extra,c.principal!.userId,view.bindings);
    },{schoolId});
    return this.commands.execute(c,authorize,async tx=>{
      await tx.query('SELECT app.lock_school()');
      let body=c.body;
      if(entry.kind==='week'&&body.inputDeadlineDay){
        if(body.inputDeadline)validation('inputDeadlineDay','Chỉ chọn một cách khai báo hạn chốt');
        const converted=await one<{deadline:Date}>(tx,"SELECT ($2::date::timestamp+interval '1 day'-interval '1 millisecond') AT TIME ZONE timezone AS deadline FROM platform.schools WHERE id=$1",[schoolId,body.inputDeadlineDay]);
        body={...body,inputDeadline:converted!.deadline.toISOString()};
      }
      await this.validate(tx,{...c,body},entry.kind,id);
      if(entry.mode==='status'&&entry.status==='ACTIVE'&&entry.kind==='class'){
        const assigned=(await tx.query(`SELECT a.id FROM app.teaching_assignments a JOIN platform.schools s ON s.id=a.school_id
          JOIN app.memberships m ON m.school_id=a.school_id AND m.id=a.member_id AND m.status='ACTIVE' AND m.ended_at IS NULL
          JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now())
          JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE' WHERE a.school_id=$1 AND a.class_id=$2
          AND a.kind='HOMEROOM' AND a.revoked_at IS NULL AND a.starts_on<=(now() AT TIME ZONE s.timezone)::date
          AND (a.ends_on IS NULL OR a.ends_on>(now() AT TIME ZONE s.timezone)::date)`,[schoolId,id])).rowCount;
        if(!assigned)throw new Problem(422,'HOMEROOM_REQUIRED');
      }
      const data=entry.mode==='create'?await insertResource(tx,r,schoolId,body,entry.kind==='calendar'&&body.status?{status:body.status}:{}):await updateResource(tx,r,schoolId,id!,body,
        entry.mode==='status'?{status:entry.status}:['calendar','class'].includes(entry.kind)&&body.status?{status:body.status}:{});
      if(entry.kind==='year'&&entry.mode==='create'){
        const setup=await createYearSetup(tx,c,String(data.id));if(setup)data.setup=setup;
      }
      if(entry.kind==='year'&&entry.mode==='status'&&entry.status==='ARCHIVED')await tx.query("UPDATE app.classes SET status='ARCHIVED' WHERE school_id=$1 AND year_id=$2 AND status<>'ARCHIVED'",[schoolId,id]);
      if(entry.kind==='class'&&c.body.homeroomMemberId)await this.homeroom(tx,c,String(data.id));
      await audit(tx,c,r.table,String(data.id),{version:data.version,status:data.status});
      return {data,status:entry.mode==='create'?201:200};
    });
  }
  private async validate(tx:Transaction,c:RequestContext,kind:string,id?:string){
    const schoolId=c.params.schoolId!,body=c.body,r=resource(kind);
    const current=id?await getResource(tx,r,schoolId,id,true):undefined;
    if(kind==='class'&&current?.status==='ARCHIVED'&&c.operation.id!=='archiveClass')throw new Problem(409,'CLASS_ARCHIVED');
    if(kind==='year'&&current?.status==='ARCHIVED'&&c.operation.id!=='archiveYear')throw new Problem(409,'YEAR_ARCHIVED');
    if(kind==='class'&&(body.homeroomStartsOn||body.homeroomReason)&&!body.homeroomMemberId)validation('homeroomMemberId','Chọn giáo viên để phân công');
    const starts=body.startsOn??current?.starts_on,ends=body.endsOn??current?.ends_on;
    if(starts&&ends&&String(starts)>=String(ends))validation('endsOn','Ngày kết thúc phải sau ngày bắt đầu');
    if(kind==='year'&&(!current||body.startsOn||body.endsOn))await ensureYearRange(tx,schoolId,String(starts),String(ends),id);
    const yearId=body.yearId??current?.year_id;
    if(yearId){
      const year=await getResource(tx,resource('year'),schoolId,String(yearId),true);
      if(year.status==='ARCHIVED'&&c.operation.method!=='GET')throw new Problem(409,'YEAR_ARCHIVED');
      if(starts&&(String(starts)<String(year.starts_on)||String(ends)>String(year.ends_on)))validation('startsOn','Mốc phải nằm trong năm học');
      if(kind==='week'){
        const term=await getResource(tx,resource('term'),schoolId,String(body.termId??current?.term_id));
        if(term.year_id!==yearId)validation('termId','Học kỳ thuộc năm khác');
      }
    }
    if(kind==='class'){
      if(body.gradeLevelId)await getResource(tx,resource('grade'),schoolId,String(body.gradeLevelId));
      if(body.roomId){const room=await getResource(tx,resource('room'),schoolId,String(body.roomId));if(room.status!=='ACTIVE')validation('roomId','Phòng đã ngừng sử dụng');}
      if(current&&body.capacity!==undefined){
        const year=await getResource(tx,resource('year'),schoolId,String(current.year_id));
        await checkCapacity(tx,schoolId,{...current,capacity:body.capacity},String(year.starts_on),String(year.ends_on),0);
      }
    }
    if(kind==='calendar'&&(body.classId??current?.class_id)){
      const cls=await getResource(tx,resource('class'),schoolId,String(body.classId??current?.class_id));
      if(cls.year_id!==yearId)validation('classId','Lớp thuộc năm khác');
    }
    if(kind==='year'&&current&&(body.startsOn||body.endsOn)){
      const outside=(await tx.query(`SELECT id FROM app.terms WHERE school_id=$1 AND year_id=$2 AND (starts_on<$3 OR ends_on>$4) LIMIT 1`,
        [schoolId,id,starts,ends])).rowCount;
      if(outside)validation('startsOn','Mốc mới loại học kỳ đã tạo');
    }
    if(kind==='term'&&current&&(body.startsOn||body.endsOn)){
      const outside=(await tx.query(`SELECT id FROM app.school_weeks WHERE school_id=$1 AND term_id=$2 AND (starts_on<$3 OR ends_on>$4) LIMIT 1`,
        [schoolId,id,starts,ends])).rowCount;
      if(outside)validation('startsOn','Mốc mới loại tuần đã tạo');
    }
    if(kind==='week'&&current&&(body.startsOn||body.endsOn||body.inputDeadline)){
      if((await tx.query(`SELECT id FROM app.conduct_periods WHERE school_id=$1 AND week_id=$2 AND status='LOCKED' LIMIT 1`,[schoolId,id])).rowCount)
        throw new Problem(409,'PERIOD_LOCKED');
    }
    if(kind==='week'&&body.inputDeadline){
      const deadline=await one<{day:string}>(tx,"SELECT ($2::timestamptz AT TIME ZONE timezone)::date AS day FROM platform.schools WHERE id=$1",[schoolId,body.inputDeadline]);
      if(deadline!.day<addDateDays(String(ends),-1))validation('inputDeadline','Hạn chốt không sớm hơn ngày cuối tuần');
    }
  }
  private async homeroom(tx:Transaction,c:RequestContext,classId:string){
    const schoolId=c.params.schoolId!,cls=await getResource(tx,resource('class'),schoolId,classId),year=await getResource(tx,resource('year'),schoolId,String(cls.year_id));
    const allowed=await this.permissions.require(tx,c.principal!,'assignment.manage',{schoolId,classId});
    const starts=String(c.body.homeroomStartsOn??(allowed.today<String(year.starts_on)?year.starts_on:allowed.today));
    const existing=await one<Row>(tx,`SELECT * FROM app.teaching_assignments WHERE school_id=$1 AND class_id=$2 AND kind='HOMEROOM' AND revoked_at IS NULL AND starts_on<=$3 AND (ends_on IS NULL OR ends_on>$3)`,[schoolId,classId,starts]);
    if(existing){
      if(existing.member_id!==c.body.homeroomMemberId||c.body.homeroomStartsOn||c.body.homeroomReason)throw new Problem(409,'HANDOVER_REQUIRED');
      return;
    }
    const assignment=await this.staff.createAssignment(tx,c,{classId,memberId:c.body.homeroomMemberId,kind:'HOMEROOM',startsOn:starts,endsOn:year.ends_on,reason:c.body.homeroomReason});
    await audit(tx,c,'assignment',String(assignment.id));
  }
  private async dictionary(c:RequestContext):Promise<Result>{
    const kind={grades:'grade',subjects:'subject',rooms:'room'}[c.params.dictionary! as 'grades'|'subjects'|'rooms'];
    if(!kind)throw new Problem(404,'RESOURCE_NOT_FOUND');
    const r=resource(kind),schoolId=c.params.schoolId!,id=c.params.itemId;
    const picker=c.query.purpose;
    if(picker&&(c.operation.method!=='GET'||!['class-picker','assignment-picker'].includes(picker)||(picker==='class-picker'&&kind==='subject')))validation('purpose','Mục đích danh sách không hợp lệ');
    const authorize=(tx:Transaction)=>this.permissions.require(tx,c.principal!,picker?picker==='class-picker'?'class.manage':'assignment.manage':c.operation.permission,{schoolId});
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);
      const use=kind==='grade'?`EXISTS(SELECT 1 FROM app.classes c WHERE c.school_id=d.school_id AND c.grade_level_id=d.id)`:
        kind==='subject'?`EXISTS(SELECT 1 FROM app.teaching_assignments a WHERE a.school_id=d.school_id AND a.subject_id=d.id) OR EXISTS(SELECT 1 FROM app.lesson_occurrences l WHERE l.school_id=d.school_id AND l.subject_id=d.id)`:
        `EXISTS(SELECT 1 FROM app.classes c WHERE c.school_id=d.school_id AND c.room_id=d.id) OR EXISTS(SELECT 1 FROM app.lesson_occurrences l WHERE l.school_id=d.school_id AND l.room_id=d.id)`;
      if(picker)return listResource(tx,r,schoolId,c.query,{sql:"t.status='ACTIVE'"+(kind==='subject'?" AND upper(t.code) NOT IN ('CHAOCO','SHL')":''),values:[]},c.principal!.userId);
      return listResource(tx,{...r,table:`(SELECT d.*,(${use}) AS in_use FROM ${r.table} d)`,fields:{...r.fields,inUse:'in_use'}},schoolId,c.query,undefined,c.principal!.userId);
    },{schoolId});
    return this.commands.execute(c,authorize,async tx=>{
      await tx.query('SELECT app.lock_school()');
      for(const field of ['capacity','sortOrder','gradeLevel','color'])if(Object.hasOwn(c.body,field)&&!r.writeFields.includes(field))validation(field,'Trường dữ liệu không thuộc danh mục này');
      const data=c.operation.method==='POST'?await insertResource(tx,r,schoolId,c.body):await updateResource(tx,r,schoolId,id!,c.body,
        c.body.status?{status:c.body.status}:{});
      await audit(tx,c,r.table,String(data.id),{version:data.version,status:data.status});
      return {data,status:c.operation.method==='POST'?201:200};
    });
  }
  private async profile(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!;
    const fields={id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',code:'code',slug:'slug',name:'name',status:'status',timezone:'timezone',
      publicContactEmail:'public_contact_email',publicContactPhone:'public_contact_phone',publicAddress:'public_address',shortName:'short_name',province:'province',level:'level',accentColor:'accent_color',motto:'motto',publicIntro:'public_intro',website:'public_website'};
    const r={table:'platform.schools',fields,writeFields:['name','publicContactEmail','publicContactPhone','publicAddress','shortName','province','level','accentColor','motto','publicIntro','website'],search:[],filters:{}};
    const authorize=(tx:Transaction)=>this.permissions.require(tx,c.principal!,c.operation.permission,{schoolId,allowScopedContext:c.operation.method==='GET'});
    const read=async(tx:Transaction)=>{
      const row=await one<Row>(tx,'SELECT * FROM platform.schools WHERE id=$1',[schoolId]);
      if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');return {...row,short_name:row.short_name??row.name,province:row.province??''};
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return {data:dto(r,await read(tx))};},{schoolId});
    return this.commands.execute(c,authorize,async tx=>{
      const row=await one<Row>(tx,'SELECT version FROM platform.schools WHERE id=$1 FOR UPDATE',[schoolId]);
      if(row?.version!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row?.version));
      validateSchoolWebsite(c.body.website);
      const values:unknown[]=[schoolId],set:string[]=[];
      for(const field of r.writeFields)if(Object.hasOwn(c.body,field)){values.push(c.body[field]);set.push(`${fields[field as keyof typeof fields]}=$${values.length}`);}
      if(set.length)await tx.query(`UPDATE platform.schools SET ${set.join(',')} WHERE id=$1`,values);
      await audit(tx,c,'school',schoolId);return {data:dto(r,await read(tx))};
    });
  }
}
