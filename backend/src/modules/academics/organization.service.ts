import { Injectable } from '@nestjs/common';
import { Database,one,type Row,type Transaction } from '../../database/database';
import { resource,dto,getResource,insertResource,updateResource,listResource } from '../../database/resources';
import { Permissions } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,validation } from '../../common/problem';
import { checkCapacity } from '../students/enrollment';
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
  constructor(private readonly db:Database,private readonly permissions:Permissions,private readonly commands:Commands){}
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
    const authorize=async(tx:Transaction)=>{
      if(entry.mode==='list'&&entry.kind==='class')return this.permissions.collection(tx,c.principal!,'class.read',schoolId,true);
      return this.permissions.require(tx,c.principal!,c.operation.permission,{
        schoolId,classId:entry.kind==='class'?id:undefined,
        allowSubject:entry.mode==='get',allowScopedContext:['year','term','week'].includes(entry.kind)&&c.operation.method==='GET',
      });
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{
      const allowed=await authorize(tx);
      if(entry.mode==='get')return {data:dto(r,await getResource(tx,r,schoolId,id!))};
      const classes=entry.kind==='class'?allowed as unknown as {all:boolean;classIds:string[]}:undefined;
      return listResource(tx,r,schoolId,c.query,classes&&!classes.all?{sql:'t.id=ANY($1::uuid[])',values:[classes.classIds]}:undefined,c.principal!.userId);
    },{schoolId});
    return this.commands.execute(c,authorize,async tx=>{
      await tx.query('SELECT app.lock_school()');
      await this.validate(tx,c,entry.kind,id);
      if(entry.mode==='status'&&entry.status==='ACTIVE'&&entry.kind==='class'){
        const assigned=(await tx.query(`SELECT a.id FROM app.teaching_assignments a JOIN platform.schools s ON s.id=a.school_id WHERE a.school_id=$1 AND a.class_id=$2
          AND a.kind='HOMEROOM' AND a.revoked_at IS NULL AND a.starts_on<=(now() AT TIME ZONE s.timezone)::date
          AND (a.ends_on IS NULL OR a.ends_on>(now() AT TIME ZONE s.timezone)::date)`,[schoolId,id])).rowCount;
        if(!assigned)throw new Problem(422,'HOMEROOM_REQUIRED');
      }
      const data=entry.mode==='create'?await insertResource(tx,r,schoolId,c.body):await updateResource(tx,r,schoolId,id!,c.body,
        entry.mode==='status'?{status:entry.status}:{});
      await audit(tx,c,r.table,String(data.id),{version:data.version,status:data.status});
      return {data,status:entry.mode==='create'?201:200};
    });
  }
  private async validate(tx:Transaction,c:RequestContext,kind:string,id?:string){
    const schoolId=c.params.schoolId!,body=c.body,r=resource(kind);
    const current=id?await getResource(tx,r,schoolId,id,true):undefined;
    const starts=body.startsOn??current?.starts_on,ends=body.endsOn??current?.ends_on;
    if(starts&&ends&&String(starts)>=String(ends))validation('endsOn','Ngày kết thúc phải sau ngày bắt đầu');
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
  }
  private async dictionary(c:RequestContext):Promise<Result>{
    const kind={grades:'grade',subjects:'subject',rooms:'room'}[c.params.dictionary! as 'grades'|'subjects'|'rooms'];
    if(!kind)throw new Problem(404,'RESOURCE_NOT_FOUND');
    const r=resource(kind),schoolId=c.params.schoolId!,id=c.params.itemId;
    const authorize=(tx:Transaction)=>this.permissions.require(tx,c.principal!,c.operation.permission,{schoolId});
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return listResource(tx,r,schoolId,c.query,undefined,c.principal!.userId);},{schoolId});
    return this.commands.execute(c,authorize,async tx=>{
      await tx.query('SELECT app.lock_school()');
      for(const field of ['capacity','sortOrder'])if(Object.hasOwn(c.body,field)&&!r.writeFields.includes(field))validation(field,'Trường dữ liệu không thuộc danh mục này');
      const data=c.operation.method==='POST'?await insertResource(tx,r,schoolId,c.body):await updateResource(tx,r,schoolId,id!,c.body,
        c.body.status?{status:c.body.status}:{});
      await audit(tx,c,r.table,String(data.id),{version:data.version,status:data.status});
      return {data,status:c.operation.method==='POST'?201:200};
    });
  }
  private async profile(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!;
    const fields={id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',code:'code',slug:'slug',name:'name',status:'status',timezone:'timezone',
      publicContactEmail:'public_contact_email',publicContactPhone:'public_contact_phone',publicAddress:'public_address'};
    const r={table:'platform.schools',fields,writeFields:['name','publicContactEmail','publicContactPhone','publicAddress'],search:[],filters:{}};
    const authorize=(tx:Transaction)=>this.permissions.require(tx,c.principal!,c.operation.permission,{schoolId,allowScopedContext:c.operation.method==='GET'});
    const read=async(tx:Transaction)=>{
      const row=await one<Row>(tx,'SELECT id,version,created_at,updated_at,code,slug,name,status,timezone,public_contact_email,public_contact_phone,public_address FROM platform.schools WHERE id=$1',[schoolId]);
      if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');return row;
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return {data:dto(r,await read(tx))};},{schoolId});
    return this.commands.execute(c,authorize,async tx=>{
      const row=await one<Row>(tx,'SELECT version FROM platform.schools WHERE id=$1 FOR UPDATE',[schoolId]);
      if(row?.version!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row?.version));
      const values:unknown[]=[schoolId],set:string[]=[];
      for(const field of r.writeFields)if(Object.hasOwn(c.body,field)){values.push(c.body[field]);set.push(`${fields[field as keyof typeof fields]}=$${values.length}`);}
      if(set.length)await tx.query(`UPDATE platform.schools SET ${set.join(',')} WHERE id=$1`,values);
      await audit(tx,c,'school',schoolId);return {data:dto(r,await read(tx))};
    });
  }
}
