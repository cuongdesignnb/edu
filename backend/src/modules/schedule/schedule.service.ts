import { Injectable } from '@nestjs/common';
import { Database,one,iso,type Row,type Transaction } from '../../database/database';
import { getResource,resource,dto,listResource,type Resource,type Predicate } from '../../database/resources';
import { Permissions,grantAllows } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,validation,notFound } from '../../common/problem';
import { PublicationsService,type ParentItem } from '../publications/publications.service';
import { timetableResource,dutyResource,lessonResource,lessonReadResource,timetableDto,dutyDto,range,validateEntries,occurrences,conflicts,type Entry,type DutyInput,type GroupDutyInput } from './schedule-data';
import type { Handler,RequestContext,Result } from '../../api.router';
import {classDutyWorkspace} from './class-duty-workspace';
import {classDutyCommand} from './class-duty-commands';
import {scheduleImportSettings} from './import-settings';
import {scheduleWorkspace} from './schedule-workspace';
import {scheduleLessonCheck,scheduleLessonCommand} from './lesson-change-commands';
import type {Principal} from '../identity/identity.service';

@Injectable()
export class ScheduleService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly publications:PublicationsService){}
  handlers():Record<string,Handler>{return {getScheduleImportSettings:c=>scheduleImportSettings(this.db,this.policy,this.commands,c),saveScheduleImportSettings:c=>scheduleImportSettings(this.db,this.policy,this.commands,c),...Object.fromEntries(['listSchoolLessons','listMySchedule','listClassTimetables','createTimetable','getTimetable','updateTimetable','validateTimetable','publishTimetable','discardTimetable','listDuties','createDuty','updateDuty','publishDuty'].map(id=>[id,(c:RequestContext)=>this.handle(c)])),getClassDutyWorkspace:c=>classDutyWorkspace(this.db,this.policy,c),saveClassDutyTask:c=>classDutyCommand(this.policy,this.commands,this.publications,c),removeClassDutyTask:c=>classDutyCommand(this.policy,this.commands,this.publications,c,true),getScheduleWorkspace:c=>scheduleWorkspace(this.db,this.policy,c),checkScheduleLessonChange:c=>scheduleLessonCheck(this.db,this.policy,c),...Object.fromEntries(['saveScheduleLessonChange','publishScheduleLessonChange','discardScheduleLessonChange'].map(id=>[id,(c:RequestContext)=>scheduleLessonCommand(this.policy,this.commands,this.publications,c)]))};}
  private async context(tx:Transaction,c:RequestContext){
    const schoolId=c.params.schoolId!,classId=c.params.classId!,allowed=await this.policy.require(tx,c.principal!,c.operation.permission,{schoolId,classId,allowSubject:c.operation.permission==='schedule.read',date:c.body.startsOn as string|undefined});
    const cls=await getResource(tx,resource('class'),schoolId,classId,c.operation.method!=='GET'),year=await getResource(tx,resource('year'),schoolId,String(cls.year_id));
    if(c.operation.method!=='GET'&&(cls.status==='ARCHIVED'||year.status==='ARCHIVED'))throw new Problem(409,'YEAR_ARCHIVED');
    return {schoolId,classId,cls,year,...allowed};
  }
  private version(row:Row,expected:unknown,source=false){const current=Number(source?row.data_version:row.version);if(current!==expected)throw new Problem(409,source?'STALE_SOURCE':'VERSION_CONFLICT',undefined,current);}
  private async row(tx:Transaction,r:Resource,c:RequestContext,id:string,lock=false){
    const row=await one<Row>(tx,`SELECT * FROM ${r.table} WHERE school_id=$1 AND class_id=$2 AND id=$3${lock?' FOR UPDATE':''}`,[c.params.schoolId,c.params.classId,id]);if(!row)notFound();return row;
  }
  async draftWithin(tx:Transaction,c:RequestContext,kind:'DUTY'|'TIMETABLE',week:Row,input:Row=c.body):Promise<Result>{
    let body:Row={...input,startsOn:week.starts_on,endsOn:week.ends_on};
    if(input.copyPrevious===true){
      const target=await one<Row>(tx,`SELECT * FROM app.${kind==='DUTY'?'duty_schedules':'timetable_versions'} WHERE school_id=$1 AND class_id=$2 AND starts_on<$3 AND status<>'ARCHIVED' ORDER BY starts_on DESC,id DESC LIMIT 1`,[c.params.schoolId,c.params.classId,week.starts_on]);
      if(!target)throw new Problem(409,'PREVIOUS_WEEK_UNAVAILABLE');
      if(kind==='TIMETABLE')body.entries=(await timetableDto(tx,target)).entries;
      else{
        const data=await dutyDto(tx,target),offset=Date.parse(String(week.starts_on))-Date.parse(String(target.starts_on));
        const grouped=new Set((await tx.query<Row>('SELECT id FROM app.duty_assignments WHERE school_id=$1 AND schedule_id=$2 AND group_plan_id IS NOT NULL',[c.params.schoolId,target.id])).rows.map(r=>r.id));
        const assignments:Row[]=(data.assignments as Row[]).filter(a=>!grouped.has(a.id)).map(a=>({...a,status:'ASSIGNED',dutyDate:new Date(Date.parse(String(a.dutyDate))+offset).toISOString().slice(0,10)}));
        const eligible=[];for(const a of assignments)if(await one(tx,"SELECT id FROM app.enrollments WHERE school_id=$1 AND class_id=$2 AND id=$3 AND status<>'CANCELLED' AND starts_on<=$4 AND (ends_on IS NULL OR ends_on>$4)",[c.params.schoolId,c.params.classId,a.enrollmentId,a.dutyDate]))eligible.push(a);
        const plans:Row[]=[];
        for(const old of data.groupAssignments as Row[]){const date=new Date(Date.parse(String(old.dutyDate))+offset).toISOString().slice(0,10);
         const members=(await tx.query<Row>(`SELECT gm.enrollment_id FROM app.group_memberships gm JOIN app.enrollments e ON e.school_id=gm.school_id AND e.id=gm.enrollment_id WHERE gm.school_id=$1 AND gm.class_id=$2 AND gm.group_id=$3 AND gm.cancelled_at IS NULL AND gm.starts_on<=$4 AND (gm.ends_on IS NULL OR gm.ends_on>$4) AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4) AND ($5::uuid[] IS NULL OR gm.enrollment_id=ANY($5::uuid[]))`,[c.params.schoolId,c.params.classId,old.groupId,date,old.enrollmentIds??null])).rows;
         if(members.length)plans.push({groupId:old.groupId,dutyDate:date,task:old.task,status:'ASSIGNED',...(old.enrollmentIds?{enrollmentIds:members.map(m=>m.enrollment_id)}:{})});
        }
        body.assignments=eligible;body.groupAssignments=plans;
      }
    }
    const operationId=kind==='DUTY'?'createDuty':'createTimetable';
    body=kind==='DUTY'?{startsOn:week.starts_on,endsOn:week.ends_on,assignments:body.assignments??[],groupAssignments:body.groupAssignments??[]}:{startsOn:week.starts_on,endsOn:week.ends_on,entries:body.entries??[]};
    return this.handle({...c,body,operation:{...c.operation,id:operationId,method:'POST',permission:kind==='DUTY'?'duty.manage':'schedule.manage'}},tx);
  }
  async officerDraft(tx:Transaction,c:RequestContext,p:Row,kind:'DUTY'|'TIMETABLE',week:Row){
    return this.draftWithin(tx,{...c,principal:{userId:String(p.created_by)} as Principal,params:{...c.params,schoolId:String(p.school_id),classId:String(p.class_id)}},kind,week);
  }
  async withdrawWeek(tx:Transaction,c:RequestContext,week:Row){
    const made=await this.draftWithin(tx,c,'TIMETABLE',week,{entries:[]}),row=made.data as Row;
    const params={...c.params,timetableId:String(row.id)},current=await one<Row>(tx,"SELECT id FROM app.publication_revisions WHERE school_id=$1 AND class_id=$2 AND kind='TIMETABLE' AND status='PUBLISHED'",[c.params.schoolId,c.params.classId]);
    await this.handle({...c,params,body:{expectedVersion:row.version},operation:{...c.operation,id:'validateTimetable',permission:'schedule.manage'}},tx);
    const refreshed=await one<Row>(tx,'SELECT data_version FROM app.timetable_versions WHERE school_id=$1 AND id=$2',[c.params.schoolId,row.id]);
    return this.handle({...c,params,body:{expectedSourceVersion:refreshed!.data_version,expectedPublicationId:current?.id??null},operation:{...c.operation,id:'publishTimetable',permission:'schedule.publish'}},tx);
  }
  private async handle(c:RequestContext,existingTx?:Transaction):Promise<Result>{
    if(['listSchoolLessons','listMySchedule'].includes(c.operation.id))return this.lessons(c);
    const authorize=(tx:Transaction)=>this.context(tx,c),work=async(tx:Transaction):Promise<Result>=>{
      const ctx=await authorize(tx),op=c.operation.id,isDuty=op.includes('Duty')||op==='listDuties',r=isDuty?dutyResource:timetableResource;
      const readableDraft=ctx.grants.some(g=>grantAllows(g,isDuty?'duty.manage':'schedule.manage',{schoolId:ctx.schoolId,classId:ctx.classId},ctx.today));
      if(op==='listClassTimetables'||op==='listDuties'){
        const page=await listResource(tx,r,ctx.schoolId,c.query,{sql:`t.class_id=$1${readableDraft?'':" AND t.status='PUBLISHED'"}`,values:[ctx.classId]},c.principal!.userId);
        const data=[];for(const item of page.data){const row=await this.row(tx,r,c,String(item.id));data.push(isDuty?await dutyDto(tx,row):await timetableDto(tx,row));}return {...page,data};
      }
      if(op==='getTimetable'){
        const row=await this.row(tx,r,c,c.params.timetableId!);if(row.status!=='PUBLISHED'&&!readableDraft)notFound();return {data:await timetableDto(tx,row)};
      }
      if(['createTimetable','updateTimetable','createDuty','updateDuty'].includes(op)){
        const create=op.startsWith('create'),existing=create?null:await this.row(tx,r,c,(c.params.timetableId??c.params.dutyId)!,true);
        if(existing){this.version(existing,c.body.expectedVersion);if(['PUBLISHED','ARCHIVED'].includes(String(existing.status)))throw new Problem(409,'SCHEDULE_IMMUTABLE');}
        const starts=String(c.body.startsOn??existing?.starts_on),ends=String(c.body.endsOn??existing?.ends_on);range(ctx.year,starts,ends);
        if(isDuty&&starts<ctx.today)validation('startsOn','Không sửa lịch trực nhật ngày đã qua');
        const data=isDuty?(c.body.assignments as DutyInput[]|undefined)??((await dutyDto(tx,existing!)).assignments as DutyInput[]):
          (c.body.entries as Entry[]|undefined)??((await timetableDto(tx,existing!)).entries as Entry[]);
        const groups=isDuty?(c.body.groupAssignments as GroupDutyInput[]|undefined)??(existing?(await dutyDto(tx,existing)).groupAssignments as GroupDutyInput[]:[]):[];
        if(isDuty)await this.validateDuties(tx,c,data as DutyInput[],starts,ends);else await validateEntries(tx,ctx.schoolId,data as Entry[]);
        for(const g of groups){if(g.dutyDate<starts||g.dutyDate>=ends||!g.task.trim())validation('groupAssignments','Ngày/nhiệm vụ ngoài lịch');const group=await one(tx,'SELECT id FROM app.class_groups WHERE school_id=$1 AND class_id=$2 AND id=$3',[ctx.schoolId,ctx.classId,g.groupId]);if(!group)validation('groupAssignments.groupId','Tổ không thuộc lớp');if(g.enrollmentIds){const eligible=(await tx.query('SELECT gm.enrollment_id FROM app.group_memberships gm JOIN app.enrollments e ON e.school_id=gm.school_id AND e.id=gm.enrollment_id WHERE gm.school_id=$1 AND gm.class_id=$2 AND gm.group_id=$3 AND gm.cancelled_at IS NULL AND gm.starts_on<=$4 AND gm.ends_on>$4 AND e.status<>\'CANCELLED\' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4) AND gm.enrollment_id=ANY($5::uuid[])',[ctx.schoolId,ctx.classId,g.groupId,g.dutyDate,g.enrollmentIds])).rows;if(eligible.length!==g.enrollmentIds.length)validation('groupAssignments.enrollmentIds','Có học sinh không thuộc tổ trong ngày trực');}}
        let row:Row;
        if(create){
          if(isDuty)row=(await one<Row>(tx,'INSERT INTO app.duty_schedules(school_id,class_id,year_id,starts_on,ends_on,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[ctx.schoolId,ctx.classId,ctx.year.id,starts,ends,c.principal!.userId]))!;
          else row=(await one<Row>(tx,`INSERT INTO app.timetable_versions(school_id,class_id,year_id,revision,starts_on,ends_on,created_by)
            SELECT $1,$2,$3,coalesce(max(revision),0)+1,$4,$5,$6 FROM app.timetable_versions WHERE school_id=$1 AND class_id=$2 RETURNING *`,[ctx.schoolId,ctx.classId,ctx.year.id,starts,ends,c.principal!.userId]))!;
        }else{
          row=(await one<Row>(tx,`UPDATE ${r.table} SET status='DRAFT',starts_on=$3,ends_on=$4,data_version=data_version+1 WHERE school_id=$1 AND id=$2 RETURNING *`,[ctx.schoolId,existing!.id,starts,ends]))!;
          await tx.query(`DELETE FROM app.${isDuty?'duty_assignments':'timetable_entries'} WHERE school_id=$1 AND ${isDuty?'schedule_id':'timetable_id'}=$2`,[ctx.schoolId,row.id]);
          if(isDuty)await tx.query('DELETE FROM app.duty_group_plans WHERE school_id=$1 AND schedule_id=$2',[ctx.schoolId,row.id]);
        }
        if(isDuty)for(const a of data as DutyInput[])await tx.query('INSERT INTO app.duty_assignments(school_id,class_id,schedule_id,enrollment_id,duty_date,task,status) VALUES($1,$2,$3,$4,$5,$6,$7)',[ctx.schoolId,ctx.classId,row.id,a.enrollmentId,a.dutyDate,a.task,a.status??'ASSIGNED']);
        else for(const e of data as Entry[])await tx.query(`INSERT INTO app.timetable_entries(school_id,class_id,timetable_id,weekday,period_number,subject_id,member_id,room_id,starts_at_local,ends_at_local)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[ctx.schoolId,ctx.classId,row.id,e.weekday,e.periodNumber,e.subjectId,e.memberId,e.roomId??null,e.startsAtLocal,e.endsAtLocal]);
        for(const g of groups)await tx.query('INSERT INTO app.duty_group_plans(school_id,class_id,schedule_id,group_id,duty_date,task,status,enrollment_targets) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[ctx.schoolId,ctx.classId,row.id,g.groupId,g.dutyDate,g.task,g.status??'ASSIGNED',g.enrollmentIds??null]);
        row=await this.row(tx,r,c,String(row.id));await audit(tx,c,isDuty?'duty':'timetable',String(row.id));return {data:isDuty?await dutyDto(tx,row):await timetableDto(tx,row),status:create?201:200};
      }
      const row=await this.row(tx,r,c,(c.params.timetableId??c.params.dutyId)!,true);
      if(op==='discardTimetable'){
        this.version(row,c.body.expectedVersion);if(!['DRAFT','READY'].includes(String(row.status)))throw new Problem(409,'SCHEDULE_IMMUTABLE');
        await tx.query("UPDATE app.timetable_versions SET status='ARCHIVED' WHERE school_id=$1 AND id=$2",[ctx.schoolId,row.id]);await audit(tx,c,'timetable',String(row.id),{discarded:true});return {data:{id:row.id,discarded:true}};
      }
      if(op==='validateTimetable'){
        this.version(row,c.body.expectedVersion);if(['PUBLISHED','ARCHIVED'].includes(String(row.status)))throw new Problem(409,'SCHEDULE_IMMUTABLE');
        const checked=await conflicts(tx,row,await occurrences(tx,row));
        await tx.query("UPDATE app.timetable_versions SET status=$3 WHERE school_id=$1 AND id=$2",[ctx.schoolId,row.id,checked.validation.valid?'READY':'DRAFT']);await audit(tx,c,'timetable',String(row.id),{valid:checked.validation.valid,conflicts:checked.validation.conflicts.length});return {data:checked.validation};
      }
      this.version(row,c.body.expectedSourceVersion,true);
      const kind=isDuty?'DUTY':'TIMETABLE',current=await one<Row>(tx,"SELECT * FROM app.publication_revisions WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND kind=$4 AND status='PUBLISHED' FOR UPDATE",[ctx.schoolId,ctx.classId,ctx.year.id,kind]);
      if(Object.hasOwn(c.body,'expectedPublicationId')&&(c.body.expectedPublicationId??null)!==(current?.id??null))throw new Problem(409,'PUBLICATION_CONFLICT');
      if(row.status==='PUBLISHED'&&current&&current[isDuty?'duty_schedule_id':'timetable_id']===row.id&&current.source_version===row.data_version)return {data:this.publicationView(current)};
      if(['PUBLISHED','ARCHIVED'].includes(String(row.status)))throw new Problem(409,'SCHEDULE_IMMUTABLE');
      if(isDuty){
        if(String(row.starts_on)<ctx.today)validation('startsOn','Không công bố lại lịch trực nhật ngày đã qua');
        await this.expandGroups(tx,c,row);
        const data=await dutyDto(tx,row);await this.validateDuties(tx,c,data.assignments as DutyInput[],String(row.starts_on),String(row.ends_on));
      }else{
        const checked=await conflicts(tx,row,await occurrences(tx,row));if(!checked.validation.valid)throw new Problem(422,'SCHEDULE_CONFLICTS');
        await tx.query(`UPDATE app.lesson_occurrences l SET status='CANCELLED',change_reason='Được thay bằng phiên bản lịch mới' FROM platform.schools s
          WHERE l.school_id=$1 AND l.class_id=$2 AND s.id=l.school_id AND l.status='SCHEDULED' AND l.starts_at>now()
          AND (l.starts_at AT TIME ZONE s.timezone)::date>=$3 AND (l.starts_at AT TIME ZONE s.timezone)::date<$4`,[ctx.schoolId,ctx.classId,row.starts_on,row.ends_on]);
        const materialized=checked.allowed.map(l=>({subjectId:l.subject_id,memberId:l.member_id,roomId:l.room_id,startsAt:iso(l.starts_at),endsAt:iso(l.ends_at),entryId:l.entry_id,periodNumber:l.period_number}));
        await tx.query(`INSERT INTO app.lesson_occurrences(school_id,class_id,timetable_id,subject_id,member_id,room_id,starts_at,ends_at,entry_id,period_number)
          SELECT $1,$2,$3,x."subjectId",x."memberId",x."roomId",x."startsAt",x."endsAt",x."entryId",x."periodNumber" FROM jsonb_to_recordset($4::jsonb) AS x("subjectId" uuid,"memberId" uuid,"roomId" uuid,"startsAt" timestamptz,"endsAt" timestamptz,"entryId" uuid,"periodNumber" int)`,[ctx.schoolId,ctx.classId,row.id,JSON.stringify(materialized)]);
      }
      await tx.query(`UPDATE ${r.table} SET status='PUBLISHED',published_at=now() WHERE school_id=$1 AND id=$2`,[ctx.schoolId,row.id]);
      const published=await this.row(tx,r,c,String(row.id)),items=isDuty?await this.dutyItems(tx,published):await this.lessonItems(tx,published);
      // Class-kind projections represent the current combined dated schedule.
      // Older revisions remain immutable but are replaced atomically for readers.
      await tx.query("UPDATE app.publication_revisions SET status='SUPERSEDED' WHERE school_id=$1 AND class_id=$2 AND year_id=$3 AND kind=$4 AND status='PUBLISHED'",[ctx.schoolId,ctx.classId,ctx.year.id,kind]);
      const snapshot=isDuty?{duty:await dutyDto(tx,published)}:{timetable:await timetableDto(tx,published),lessons:(await tx.query<Row>('SELECT * FROM app.lesson_occurrences WHERE school_id=$1 AND class_id=$2 ORDER BY starts_at,id LIMIT 10000',[ctx.schoolId,ctx.classId])).rows.map(l=>dto(lessonResource,l))};
      const result=await this.publications.create(tx,{...c,body:{...c.body,expectedPublicationId:null}},{kind,id:String(row.id),schoolId:ctx.schoolId,classId:ctx.classId,yearId:String(ctx.year.id),version:Number(published.data_version)},snapshot,items,true);
      await audit(tx,c,isDuty?'duty':'timetable',String(row.id),{status:'PUBLISHED',sourceVersion:row.data_version});return {data:result};
    };
    if(existingTx){await authorize(existingTx);return work(existingTx);}
    return c.operation.method==='GET'?this.db.transaction(work,{schoolId:c.params.schoolId}):this.commands.execute(c,authorize,work);
  }
  private publicationView(row:Row){
    return {id:row.id,version:row.version,createdAt:iso(row.created_at as Date),updatedAt:iso(row.updated_at as Date),kind:row.kind,classId:row.class_id,yearId:row.year_id,sourceId:row.kind==='DUTY'?row.duty_schedule_id:row.timetable_id,revision:row.revision,sourceVersion:row.source_version,status:row.status,publishedAt:iso(row.published_at as Date),contentHash:row.content_hash};
  }
  private async validateDuties(tx:Transaction,c:RequestContext,assignments:DutyInput[],starts:string,ends:string){
    const keys=new Set<string>();
    for(const a of assignments){
      const key=`${a.enrollmentId}:${a.dutyDate}:${a.task}`;if(!a.task.trim()||a.dutyDate<starts||a.dutyDate>=ends||keys.has(key))validation('assignments','Ngày/nhiệm vụ bị trùng hoặc ngoài lịch');keys.add(key);
      const e=await one<Row>(tx,"SELECT * FROM app.enrollments WHERE school_id=$1 AND class_id=$2 AND id=$3 AND status<>'CANCELLED' AND starts_on<=$4 AND (ends_on IS NULL OR ends_on>$4)",[c.params.schoolId,c.params.classId,a.enrollmentId,a.dutyDate]);if(!e)validation('assignments.enrollmentId','Học sinh không thuộc lớp trong ngày trực nhật');
    }
  }
  private async expandGroups(tx:Transaction,c:RequestContext,row:Row){
    const groups=(await tx.query<Row>('SELECT * FROM app.duty_group_plans WHERE school_id=$1 AND schedule_id=$2 ORDER BY duty_date,id',[row.school_id,row.id])).rows;
    let total=Number((await one<{n:number}>(tx,'SELECT count(*)::int AS n FROM app.duty_assignments WHERE school_id=$1 AND schedule_id=$2',[row.school_id,row.id]))!.n);
    for(const group of groups){
      const members=(await tx.query<{enrollment_id:string}>(`SELECT g.enrollment_id FROM app.group_memberships g JOIN app.enrollments e ON e.school_id=g.school_id AND e.id=g.enrollment_id
        WHERE g.school_id=$1 AND g.group_id=$2 AND g.class_id=$3 AND g.cancelled_at IS NULL AND g.starts_on<=$4 AND g.ends_on>$4
        AND e.status<>'CANCELLED' AND e.starts_on<=$4 AND (e.ends_on IS NULL OR e.ends_on>$4)
        AND ($5::uuid[] IS NULL OR g.enrollment_id=ANY($5::uuid[])) ORDER BY g.enrollment_id`,[row.school_id,group.group_id,row.class_id,group.duty_date,group.enrollment_targets??null])).rows;
      if(group.enrollment_targets&&members.length!==(group.enrollment_targets as string[]).length)validation('groupAssignments.enrollmentIds','Thành viên đã chọn không còn thuộc tổ trong ngày trực');
      if(!members.length&&group.status!=='CANCELLED')validation('groupAssignments','Tổ không có học sinh trong ngày trực nhật');
      for(const member of members){
        if(++total>5000)throw new Problem(422,'DUTY_ASSIGNMENT_LIMIT');
        if((await tx.query('SELECT id FROM app.duty_assignments WHERE school_id=$1 AND schedule_id=$2 AND enrollment_id=$3 AND duty_date=$4 AND task=$5',[row.school_id,row.id,member.enrollment_id,group.duty_date,group.task])).rowCount)validation('groupAssignments','Nhiệm vụ trùng với học sinh đã được chọn');
        await tx.query('INSERT INTO app.duty_assignments(school_id,class_id,schedule_id,enrollment_id,duty_date,task,status,group_plan_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[row.school_id,row.class_id,row.id,member.enrollment_id,group.duty_date,group.task,group.status,group.id]);
      }
    }
    if(groups.length)await audit(tx,c,'duty',String(row.id),{groupPlans:groups.length,assignments:total,expandedAtPublication:true});
  }
  private async lessonItems(tx:Transaction,row:Row):Promise<ParentItem[]>{
    const rows=(await tx.query<Row>(`SELECT e.student_id,l.id,(l.starts_at AT TIME ZONE sc.timezone)::date AS day,l.starts_at,l.ends_at,l.status,l.change_reason,s.name AS subject_name,m.work_display_name,r.name AS room_name
      FROM app.enrollments e JOIN platform.schools sc ON sc.id=e.school_id JOIN app.lesson_occurrences l ON l.school_id=e.school_id AND l.class_id=e.class_id
      JOIN app.subjects s ON s.school_id=l.school_id AND s.id=l.subject_id JOIN app.memberships m ON m.school_id=l.school_id AND m.id=l.member_id LEFT JOIN app.rooms r ON r.school_id=l.school_id AND r.id=l.room_id
      WHERE e.school_id=$1 AND e.class_id=$2 AND e.year_id=$3 AND e.status<>'CANCELLED'
      AND (l.starts_at AT TIME ZONE sc.timezone)::date>=e.starts_on AND (e.ends_on IS NULL OR (l.starts_at AT TIME ZONE sc.timezone)::date<e.ends_on)
      AND (l.status='SCHEDULED' OR NOT EXISTS(SELECT 1 FROM app.lesson_occurrences newer WHERE newer.school_id=l.school_id AND newer.class_id=l.class_id AND newer.status='SCHEDULED'
       AND (newer.starts_at AT TIME ZONE sc.timezone)::date=(l.starts_at AT TIME ZONE sc.timezone)::date AND (newer.period_number=l.period_number OR newer.starts_at=l.starts_at)))
      ORDER BY e.student_id,l.starts_at,l.id LIMIT 100001`,[row.school_id,row.class_id,row.year_id])).rows;
    return this.items(rows,'timetable','ParentLessonBatch',r=>({date:r.day,startsAt:iso(r.starts_at as Date),endsAt:iso(r.ends_at as Date),subjectName:r.subject_name,teacherName:r.work_display_name,status:r.status,...(r.room_name?{roomName:r.room_name}:{}),...(r.change_reason?{changeNote:r.change_reason}:{})}));
  }
  private async dutyItems(tx:Transaction,row:Row):Promise<ParentItem[]>{
    const rows=(await tx.query<Row>(`SELECT e.student_id,a.duty_date,a.task,a.status FROM app.duty_assignments a JOIN app.duty_schedules d ON d.school_id=a.school_id AND d.id=a.schedule_id
      JOIN app.enrollments e ON e.school_id=a.school_id AND e.id=a.enrollment_id
      WHERE a.school_id=$1 AND a.class_id=$2 AND d.year_id=$3 AND d.status='PUBLISHED' AND e.status<>'CANCELLED' AND e.starts_on<=a.duty_date AND (e.ends_on IS NULL OR e.ends_on>a.duty_date)
      AND NOT EXISTS(SELECT 1 FROM app.duty_schedules newer WHERE newer.school_id=d.school_id AND newer.class_id=d.class_id AND newer.status='PUBLISHED'
       AND (newer.published_at,newer.id)>(d.published_at,d.id) AND newer.starts_on<=a.duty_date AND newer.ends_on>a.duty_date)
      ORDER BY e.student_id,a.duty_date,a.id LIMIT 100001`,[row.school_id,row.class_id,row.year_id])).rows;
    return this.items(rows,'duties','ParentDutyBatch',r=>({date:r.duty_date,task:r.task,status:r.status,publishedAt:new Date().toISOString()}));
  }
  private items(rows:Row[],section:string,schema:string,project:(row:Row)=>Record<string,unknown>):ParentItem[]{
    if(rows.length>100000)throw new Problem(422,'PROJECTION_LIMIT');const grouped=new Map<string,Record<string,unknown>[]>();
    for(const row of rows){const id=String(row.student_id),items=grouped.get(id)??[];if(items.length>=5000)throw new Problem(422,'PROJECTION_LIMIT');items.push(project(row));grouped.set(id,items);}
    return [...grouped].map(([studentId,items])=>({studentId,section,schema,payload:{items}}));
  }
  private async lessons(c:RequestContext){
    const schoolId=c.params.schoolId!;return this.db.transaction(async tx=>{
      const own=c.operation.id==='listMySchedule',access=await this.policy.collection(tx,c.principal!,'schedule.read',schoolId,true),values:unknown[]=[],where:string[]=[];
      if(own){
        const self=await this.policy.collection(tx,c.principal!,'teacher.self',schoolId,true),member=(await one<{id:string}>(tx,"SELECT id FROM app.memberships WHERE school_id=$1 AND user_id=$2 AND status='ACTIVE' AND ended_at IS NULL",[schoolId,c.principal!.userId]))!;
        if(c.query.memberId&&c.query.memberId!==member.id)notFound();
        values.push(member.id);where.push(`t.member_id=$${values.length}`);
        if(!self.all){values.push(self.classIds);where.push(`t.class_id=ANY($${values.length}::uuid[])`);}
        values.push(access.today);const today=`$${values.length}::date`;
        where.push(`EXISTS(SELECT 1 FROM app.teaching_assignments a JOIN app.role_grants g ON g.school_id=a.school_id AND g.id=a.role_grant_id AND g.revoked_at IS NULL AND g.valid_from<=now() AND (g.valid_until IS NULL OR g.valid_until>now()) JOIN app.roles r ON r.school_id=g.school_id AND r.id=g.role_id AND r.status='ACTIVE'
          WHERE a.school_id=t.school_id AND a.class_id=t.class_id AND a.member_id=t.member_id AND a.revoked_at IS NULL AND a.starts_on<=${today} AND (a.ends_on IS NULL OR a.ends_on>${today}) AND (a.kind='HOMEROOM' OR a.subject_id=t.subject_id)
          AND a.starts_on<=(t.starts_at AT TIME ZONE (SELECT timezone FROM platform.schools WHERE id=t.school_id))::date AND (a.ends_on IS NULL OR a.ends_on>(t.starts_at AT TIME ZONE (SELECT timezone FROM platform.schools WHERE id=t.school_id))::date))`);
      }
      if(!access.all){
        const scopes=access.grants.filter(g=>g.class_id&&grantAllows(g,'schedule.read',{schoolId,classId:g.class_id,allowSubject:true},access.today));
        const parts=scopes.map(g=>{values.push(g.class_id);let part=`t.class_id=$${values.length}`;
          if(own&&g.scope_type==='SUBJECT'){values.push(g.subject_id);part+=` AND t.subject_id=$${values.length}`;}
          if(g.starts_on){values.push(g.starts_on);part+=` AND (t.starts_at AT TIME ZONE (SELECT timezone FROM platform.schools WHERE id=t.school_id))::date >=$${values.length}`;}
          if(g.ends_on){values.push(g.ends_on);part+=` AND (t.starts_at AT TIME ZONE (SELECT timezone FROM platform.schools WHERE id=t.school_id))::date <$${values.length}`;}return `(${part})`;});
        where.push('('+parts.join(' OR ')+')');
      }
      if(c.query.from){values.push(c.query.from);where.push(`t.starts_at >= ($${values.length}::date::timestamp AT TIME ZONE (SELECT timezone FROM platform.schools WHERE id=t.school_id))`);}
      if(c.query.to){values.push(c.query.to);where.push(`t.starts_at < ($${values.length}::date::timestamp AT TIME ZONE (SELECT timezone FROM platform.schools WHERE id=t.school_id))`);}
      if(c.query.from&&c.query.to&&c.query.from>=c.query.to)validation('to','Khoảng ngày không hợp lệ');
      const extra:Predicate={sql:where.join(' AND '),values};return listResource(tx,lessonReadResource,schoolId,c.query,extra,c.principal!.userId);
    },{schoolId,readOnly:true});
  }
}
