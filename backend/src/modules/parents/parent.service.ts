import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { Database,one,iso,type Transaction,type Row } from '../../database/database';
import { listResource,type Resource } from '../../database/resources';
import { runtimeConfig } from '../../common/config';
import { hashToken,randomToken,csrfFor,setCookie } from '../../common/security';
import { Problem,validation } from '../../common/problem';
import { validateSchema } from '../../common/contract';
import { IdentityService } from '../identity/identity.service';
import {attendanceMonthBounds,parentAttendanceMonth} from './attendance-month';
import {timetableWeekBounds,assertTimetableWeekSize} from './timetable-week';
import {parentDocument,parentDocuments,parentDocumentStream} from './documents';
import {parentSharedContent} from './shared-content';
import {parentConductDisplay} from './conduct-display';
import type { RequestContext,Handler,Result } from '../../api.router';

export interface ParentPrincipal {sessionId:string;schoolId:string;accessId:string;studentId:string;yearId:string;tokenHash:string;csrfHash:string;absoluteExpiresAt:string;link:Row}
const projection:Resource={table:`(SELECT p.school_id,p.student_id,p.year_id,p.section,p.publication_id,p.created_at,
  app.parent_publication_time(p.school_id,p.student_id,p.year_id,p.section,p.publication_id) AS published_at,
  CASE WHEN jsonb_typeof(p.payload->'items')='array' THEN md5(p.id::text||':'||j.ordinal::text)::uuid ELSE p.id END AS id,j.item AS payload
  FROM app.parent_publication_items p CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.payload->'items')='array' THEN p.payload->'items' ELSE jsonb_build_array(p.payload) END) WITH ORDINALITY j(item,ordinal))`,fields:{id:'id',createdAt:'created_at',publishedAt:'published_at',publicationId:'publication_id',payload:'payload'},writeFields:[],search:[],filters:{}};
const schemas:Record<string,string>={attendance:'ParentAttendance',conduct:'ParentConduct',timetable:'ParentLesson',duties:'ParentDuty',activities:'ParentActivity',announcements:'ParentAnnouncement'};
const documentResource:Resource={table:`(SELECT d.*,meta.info->>'contentType' AS content_type,(meta.info->>'byteSize')::bigint AS byte_size,(meta.info->>'downloadAllowed')::boolean AS effective_download_allowed FROM app.parent_document_items d
  CROSS JOIN LATERAL(SELECT app.parent_document_access(d.school_id,d.id) AS info) meta WHERE meta.info IS NOT NULL)`,fields:{id:'id',title:'title',fileId:'file_id',contentType:'content_type',byteSize:'byte_size',downloadAllowed:'effective_download_allowed',publishedAt:'published_at'},writeFields:[],search:['title'],filters:{}};
@Injectable()
export class ParentService {
  constructor(private readonly db:Database,private readonly identity:IdentityService){}
  handlers():Record<string,Handler>{return Object.fromEntries(['exchangeParentLink','getParentContext','endParentSession','getParentOverview','getParentAttendance','getParentAttendanceMonth','listParentConduct','getParentConduct','getParentTimetable','getParentTimetableWeek','getParentDuties','getParentDutySchedule','listParentActivities','getParentActivity','listParentAnnouncements','getParentAnnouncement','getParentTeachers','getParentTeacherDirectory','listParentDocuments','downloadParentDocument','getParentDocumentDirectory','getParentDocument','viewParentDocument','getParentPublishedActivityDirectory','getParentPublishedActivity','getParentPublishedAnnouncementDirectory','getParentPublishedAnnouncement','getParentPublishedConductDirectory','getParentPublishedConduct'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  async school(slug:string){const school=(await this.db.app.query<Row>('SELECT id,name,slug,status,timezone,public_contact_phone FROM platform.schools WHERE slug=$1',[slug])).rows[0];if(!school||school.status!=='ACTIVE')throw new Problem(401,'PARENT_ACCESS_INVALID');return school;}
  async link(tx:Transaction,schoolId:string,id:string){
    const link=await one<Row>(tx,`SELECT l.*,s.full_name,y.name AS year_label,y.status AS year_status,sc.name AS school_name,sc.slug,sc.public_contact_phone,sc.public_contact_email,sc.public_address,sc.short_name AS school_short_name,sc.motto,sc.timezone,g.relationship_label,y.starts_on AS year_starts_on,y.ends_on AS year_ends_on,to_char((now() AT TIME ZONE sc.timezone)::date,'YYYY-MM-DD') AS today,
      coalesce((SELECT c.name FROM app.enrollments e JOIN app.classes c ON c.school_id=e.school_id AND c.id=e.class_id WHERE e.school_id=l.school_id AND e.student_id=l.student_id AND e.year_id=l.year_id AND e.status<>'CANCELLED' AND e.starts_on<=(now() AT TIME ZONE sc.timezone)::date ORDER BY e.starts_on DESC,e.id LIMIT 1),'Chưa xếp lớp') AS class_label
      FROM app.parent_access_links l JOIN app.guardian_relationships g ON g.school_id=l.school_id AND g.id=l.relationship_id AND g.student_id=l.student_id
      JOIN app.students s ON s.school_id=l.school_id AND s.id=l.student_id JOIN app.academic_years y ON y.school_id=l.school_id AND y.id=l.year_id JOIN platform.schools sc ON sc.id=l.school_id
      WHERE l.school_id=$1 AND l.id=$2 AND l.revoked_at IS NULL AND l.expires_at>now() AND g.status='VERIFIED' AND g.can_receive_info AND g.revoked_at IS NULL AND sc.status='ACTIVE'`,[schoolId,id]);
    if(!link)throw new Problem(401,'PARENT_ACCESS_INVALID');return link;
  }
  private principal(session:Row,link:Row):ParentPrincipal{return {sessionId:String(session.id),schoolId:String(link.school_id),accessId:String(link.id),studentId:String(link.student_id),yearId:String(link.year_id),tokenHash:String(session.token_hash),csrfHash:String(session.csrf_hash),absoluteExpiresAt:String(iso(session.absolute_expires_at as Date)),link};}
  async authenticate(request:FastifyRequest,slug:string):Promise<ParentPrincipal>{
    const token=request.cookies[runtimeConfig().parentCookie];if(!token)throw new Problem(401,'PARENT_ACCESS_INVALID');
    const school=await this.school(slug);
    return this.db.transaction(async tx=>{
      const session=await one<Row>(tx,`SELECT * FROM identity.parent_sessions WHERE school_id=$1 AND token_hash=$2 AND revoked_at IS NULL AND idle_expires_at>now() AND absolute_expires_at>now() FOR UPDATE`,[school.id,hashToken(token)]);
      if(!session)throw new Problem(401,'PARENT_ACCESS_INVALID');
      if(request.headers['x-parent-view']!==session.id)throw new Problem(409,'PARENT_CONTEXT_CHANGED');
      const link=await this.link(tx,String(school.id),String(session.access_link_id));
      if(Date.now()-new Date(session.last_seen_at as Date).getTime()>=60000)await tx.query("UPDATE identity.parent_sessions SET last_seen_at=now(),idle_expires_at=least(absolute_expires_at,now()+interval '30 minutes') WHERE id=$1",[session.id]);
      return this.principal(session,link);
    },{schoolId:String(school.id)});
  }
  async context(p:ParentPrincipal){
    const l=p.link,last=await this.db.transaction(tx=>one<Row>(tx,`SELECT max(app.parent_publication_time(school_id,student_id,year_id,section,publication_id)) AS published_at
      FROM app.parent_publication_items WHERE school_id=$1 AND student_id=$2 AND year_id=$3 AND section=ANY($4::text[])`,[p.schoolId,p.studentId,p.yearId,l.allowed_sections]),{schoolId:p.schoolId,parentSessionId:p.sessionId,parent:true});
    return {viewId:p.sessionId,school:{name:l.school_name,slug:l.slug,publicContactPhone:l.public_contact_phone,shortName:l.school_short_name||null,motto:l.motto||null,publicContactEmail:l.public_contact_email||null,publicAddress:l.public_address||null},
      student:{displayName:l.full_name,classLabel:l.class_label,schoolYearLabel:l.year_label},allowedSections:l.allowed_sections,allowDownload:l.allow_download,csrfToken:csrfFor(p.sessionId,p.tokenHash),expiresAt:p.absoluteExpiresAt,
      today:l.today,year:{label:l.year_label,startsOn:iso(l.year_starts_on as Date),endsOn:iso(l.year_ends_on as Date)},relationshipLabel:l.relationship_label,linkExpiresAt:iso(l.expires_at as Date),lastPublishedAt:last?.published_at?iso(last.published_at as Date):null};
  }
  private allow(p:ParentPrincipal,section:string){if(!(p.link.allowed_sections as string[]).includes(section))throw new Problem(403,'PARENT_SECTION_DENIED');}
  private async event(tx:Transaction,c:RequestContext,p:ParentPrincipal,kind:string,section?:string){
    const daily=new Date().toISOString().slice(0,10),ipHash=crypto.createHmac('sha256',runtimeConfig().key).update(`parent-ip:${daily}:${c.request.ip}`).digest('hex');
    const ua=String(c.request.headers['user-agent']??''),device=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Unknown browser';
    await tx.query('INSERT INTO app.parent_access_events(school_id,access_link_id,event_kind,request_id,ip_daily_hash,device_summary,section) VALUES($1,$2,$3,$4,$5,$6,$7)',[p.schoolId,p.accessId,kind,c.requestId,ipHash,device,section??null]);
  }
  private async exchange(c:RequestContext){
    await this.identity.rateLimit(`parent-exchange:ip:${c.request.ip}`,20,300);await this.identity.rateLimit(`parent-exchange:token:${hashToken(String(c.body.token))}`,20,300);
    const school=await this.school(c.params.schoolSlug!),token=randomToken(),tokenHash=hashToken(token),sessionId=crypto.randomUUID(),csrfToken=csrfFor(sessionId,tokenHash);
    const p=await this.db.transaction(async tx=>{
      await tx.query('SELECT app.lock_school()');
      const candidate=await one<Row>(tx,'SELECT id FROM app.parent_access_links WHERE school_id=$1 AND token_hash=$2',[school.id,hashToken(String(c.body.token))]);if(!candidate)throw new Problem(401,'PARENT_ACCESS_INVALID');
      const link=await this.link(tx,String(school.id),String(candidate.id));
      const old=c.request.cookies[runtimeConfig().parentCookie];if(old)await tx.query('UPDATE identity.parent_sessions SET revoked_at=now() WHERE token_hash=$1',[hashToken(old)]);
      const session=await one<Row>(tx,`INSERT INTO identity.parent_sessions(id,school_id,access_link_id,token_hash,csrf_hash,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,$4,$5,least($6,now()+interval '30 minutes'),least($6,now()+interval '8 hours')) RETURNING *`,[sessionId,school.id,link.id,tokenHash,hashToken(csrfToken),link.expires_at]);
      const principal=this.principal(session!,link);await this.event(tx,c,principal,'EXCHANGED');return principal;
    },{schoolId:String(school.id)});
    setCookie(c.reply,runtimeConfig().parentCookie,token,Math.min(28800,Math.floor((new Date(p.link.expires_at as Date).getTime()-Date.now())/1000)));return {data:await this.context(p)};
  }
  private async published(p:ParentPrincipal,section:string,query:Record<string,string>,detail?:{key:string;id:string},dailyOnly=false){
    this.allow(p,section);if(query.sort&&!['id','createdAt','publishedAt'].includes(query.sort))validation('sort','Chỉ sắp xếp theo thời gian công bố');
    const values:unknown[]=[p.studentId,p.yearId,section],where=['t.student_id=$1','t.year_id=$2','t.section=$3'];
    if(['attendance','timetable','duties'].includes(section))where.push("app.parent_dated_item_visible(t.school_id,t.student_id,t.year_id,t.section,t.publication_id,(t.payload->>'date')::date)");
    if(dailyOnly){if(section!=='attendance')throw new Problem(500,'PARENT_ATTENDANCE_SOURCE_INVALID');where.push('app.parent_attendance_is_daily(t.school_id,t.student_id,t.year_id,t.publication_id)');}
    if(detail){values.push(detail.id);where.push(`t.payload->>'${detail.key}'=$${values.length}`);}
    for(const bound of ['from','to'])if(query[bound]){if(!/^\d{4}-\d{2}-\d{2}$/.test(query[bound]!))validation(bound,'Ngày ISO bắt buộc');values.push(query[bound]);where.push(`t.payload->>'date'${bound==='from'?'>=':'<'}$${values.length}`);}
    const result=await this.db.transaction(async tx=>{
      const result=await listResource(tx,projection,p.schoolId,{...query,sort:query.sort??'publishedAt',dir:query.dir??'desc'},{sql:where.join(' AND '),values},p.sessionId);
      if(section==='activities'||section==='announcements')for(const row of result.data){
        const payload=row.payload as Record<string,unknown>,documents=Array.isArray(payload.documents)?payload.documents as {id:string}[]:[];
        const visible=(p.link.allowed_sections as string[]).includes('documents')&&documents.length?(await tx.query<Row>(`SELECT d.id,d.title,d.published_at,d.download_allowed,app.parent_document_metadata(d.school_id,d.id) AS metadata
          FROM app.parent_document_items d WHERE d.school_id=$1 AND d.id=ANY($2::uuid[]) AND app.parent_document_metadata(d.school_id,d.id) IS NOT NULL`,[p.schoolId,documents.map(d=>d.id)])).rows:[];
        row.payload={...payload,documents:visible.map(d=>({id:d.id,title:d.title,...d.metadata as Record<string,unknown>,downloadAllowed:!!(d.download_allowed&&p.link.allow_download),publishedAt:iso(d.published_at as Date)}))};
      }
      return result;
    },{schoolId:p.schoolId,parentSessionId:p.sessionId,parent:true});
    const data:Record<string,unknown>[]=[];
    for(const row of result.data){if(!row.publishedAt)continue;const item=row.payload as Record<string,unknown>,value={...item,...(Object.hasOwn(item,'publishedAt')?{publishedAt:row.publishedAt}:{})};validateSchema(schemas[section]!,value,true);data.push(value);}
    if(detail){if(!data.length)throw new Problem(404,'RESOURCE_NOT_FOUND');return {data:data[0]};}return {data,page:result.page};
  }
  private async timetableWeek(p:ParentPrincipal,week:unknown){
    this.allow(p,'timetable');const bounds=timetableWeekBounds(p.link,week);
    const row=await this.db.transaction(tx=>one<{week:unknown}>(tx,'SELECT app.parent_timetable_week($1,$2,$3,$4) AS week',[p.schoolId,p.studentId,p.yearId,bounds.week]),{schoolId:p.schoolId,parentSessionId:p.sessionId,parent:true,readOnly:true});
    if(!row?.week)throw new Problem(401,'PARENT_ACCESS_INVALID');assertTimetableWeekSize(row.week);validateSchema('ParentTimetableWeek',row.week,true);return {data:row.week};
  }
  private async dutySchedule(p:ParentPrincipal){
    this.allow(p,'duties');
    // One read snapshot contains the complete bounded schedule, including every batch.
    const rows=await this.db.transaction(async tx=>(await tx.query<Row>(`SELECT t.payload,t.published_at FROM ${projection.table} t
      WHERE t.school_id=$1 AND t.student_id=$2 AND t.year_id=$3 AND t.section='duties'
        AND app.parent_dated_item_visible(t.school_id,t.student_id,t.year_id,t.section,t.publication_id,(t.payload->>'date')::date)
      ORDER BY t.payload->>'date',t.published_at,t.id LIMIT 5001`,[p.schoolId,p.studentId,p.yearId])).rows,
      {schoolId:p.schoolId,parentSessionId:p.sessionId,parent:true,readOnly:true});
    if(rows.length>5000)throw new Problem(422,'PARENT_SCHEDULE_TOO_LARGE');
    const data={today:p.link.today,year:{startsOn:iso(p.link.year_starts_on as Date),endsOn:iso(p.link.year_ends_on as Date)},items:rows.map(row=>({...row.payload as Record<string,unknown>,publishedAt:iso(row.published_at as Date)}))};
    validateSchema('ParentDutySchedule',data,true);return {data};
  }
  private async attendanceMonth(p:ParentPrincipal,month:unknown){
    this.allow(p,'attendance');const bounds=attendanceMonthBounds(p.link,month),records:Parameters<typeof parentAttendanceMonth>[3]=[];let cursor:string|undefined;const visited=new Set<string>();
    do{const result=await this.published(p,'attendance',{from:bounds.from,to:bounds.to,limit:'100',...(cursor?{cursor}:{})},undefined,true);
      if(!Array.isArray(result.data))throw new Problem(500,'PARENT_ATTENDANCE_SOURCE_INVALID');
      for(const value of result.data){validateSchema('ParentAttendance',value,true);records.push(value as unknown as Parameters<typeof parentAttendanceMonth>[3][number]);}
      if(records.length>1000)throw new Problem(422,'PARENT_MONTH_TOO_LARGE');
      if(!result.page?.hasMore)break;cursor=result.page.nextCursor??undefined;if(!cursor||visited.has(cursor))throw new Problem(500,'PARENT_CURSOR_INVALID');visited.add(cursor);
    }while(cursor);
    const calendar=await this.db.transaction(tx=>one<{calendar:Parameters<typeof parentAttendanceMonth>[2]|null}>(tx,'SELECT app.parent_attendance_calendar($1,$2,$3,$4,$5) AS calendar',[p.schoolId,p.studentId,p.yearId,bounds.from,bounds.to]),{schoolId:p.schoolId,parentSessionId:p.sessionId,parent:true});
    if(!calendar?.calendar)throw new Problem(401,'PARENT_ACCESS_INVALID');return {data:parentAttendanceMonth(p.link,bounds.month,calendar.calendar,records)};
  }
  private async teacherDirectory(p:ParentPrincipal){
    this.allow(p,'teachers');
    const row=await this.db.transaction(tx=>one<{directory:{today:string;classLabel:string|null;contactHours:string|null;teachers:Array<{kind:string;displayName:string;subjectName:string|null;workEmail:string|null;workPhone:string|null;weekdays:number[]}>}|null}>(tx,'SELECT app.parent_teacher_directory($1,$2,$3) AS directory',[p.schoolId,p.studentId,p.yearId]),{schoolId:p.schoolId,parentSessionId:p.sessionId,parent:true});
    if(!row?.directory)throw new Problem(401,'PARENT_ACCESS_INVALID');
    if(Array.isArray(row.directory.teachers)&&row.directory.teachers.length>1000)throw new Problem(422,'PARENT_TEACHERS_TOO_LARGE');
    validateSchema('ParentTeacherDirectory',row.directory,true);return {data:row.directory};
  }
  private async teachers(p:ParentPrincipal){
    const {data}=await this.teacherDirectory(p);
    if(data.teachers.length>100)throw new Problem(422,'PARENT_TEACHERS_TOO_LARGE');
    return {data:data.teachers.map(row=>({displayName:row.displayName,assignmentLabel:row.kind==='HOMEROOM'?'Giáo viên chủ nhiệm':'Giáo viên bộ môn',...(row.subjectName?{subjectName:row.subjectName}:{}),...(row.workEmail?{workEmail:row.workEmail}:{}),...(row.workPhone?{workPhone:row.workPhone}:{})})),page:{limit:100,hasMore:false,nextCursor:null}};
  }
  private async documents(p:ParentPrincipal,query:Record<string,string>,id?:string):Promise<Result>{
    this.allow(p,'documents');
    if(query.sort&&!['id','publishedAt','title'].includes(query.sort))validation('sort','Sắp xếp tài liệu không hợp lệ');
    const result=await this.db.transaction(tx=>listResource(tx,documentResource,p.schoolId,{...query,sort:query.sort??'publishedAt',dir:query.dir??'desc'},{sql:`t.student_id=$1 AND t.year_id=$2${id?' AND t.id=$3':''}`,values:id?[p.studentId,p.yearId,id]:[p.studentId,p.yearId]},p.sessionId),{schoolId:p.schoolId,parentSessionId:p.sessionId,parent:true});
    if(id&&!result.data.length)throw new Problem(404,'RESOURCE_NOT_FOUND');
    const data=result.data.map(row=>({id:row.id,title:row.title,contentType:row.contentType,byteSize:Number(row.byteSize),downloadAllowed:!!row.downloadAllowed,publishedAt:row.publishedAt}));
    return {data,page:result.page};
  }
  private async documentDirectory(p:ParentPrincipal){this.allow(p,'documents');return {data:await this.db.transaction(tx=>parentDocuments(tx,p),{schoolId:p.schoolId,parentSessionId:p.sessionId,parent:true,readOnly:true})};}
  private async document(p:ParentPrincipal,id:string){this.allow(p,'documents');return {data:await this.db.transaction(tx=>parentDocument(tx,p,id),{schoolId:p.schoolId,parentSessionId:p.sessionId,parent:true,readOnly:true})};}
  private async sharedContent(p:ParentPrincipal,section:'activities'|'announcements',id?:string):Promise<Result>{
    this.allow(p,section);return this.db.transaction(async tx=>{const value=await parentSharedContent(tx,p,section,id);return {data:id?value:{items:value}};},{schoolId:p.schoolId,parentSessionId:p.sessionId,parent:true,readOnly:true});
  }
  private async conductDisplay(p:ParentPrincipal,id?:string):Promise<Result>{
    this.allow(p,'conduct');return this.db.transaction(async tx=>{const value=await parentConductDisplay(tx,p,id);return {data:id?value:{items:value}};},{schoolId:p.schoolId,parentSessionId:p.sessionId,parent:true,readOnly:true});
  }
  async overview(p:ParentPrincipal){
    const sections=p.link.allowed_sections as string[],read=async(section:string)=>sections.includes(section)?(await this.published(p,section,{limit:'10'})).data as Record<string,unknown>[]:[];
    const attendance=await read('attendance'),conduct=await read('conduct'),announcements=await read('announcements'),lessons=await read('timetable'),teachers=sections.includes('teachers')?(await this.teachers(p)).data:[];
    const today=(await this.db.app.query<{today:string}>("SELECT (now() AT TIME ZONE timezone)::date AS today FROM platform.schools WHERE id=$1",[p.schoolId])).rows[0]!.today;
    return {context:await this.context(p),attendance,...(conduct.length?{latestConduct:conduct[0]}:{}),teachers,todayLessons:lessons.filter(item=>item.date===today),announcements,asOf:new Date().toISOString()};
  }
  async preview(c:RequestContext,schoolId:string,accessId:string){
    const tokenHash=hashToken(randomToken()),p=await this.db.transaction(async tx=>{const link=await this.link(tx,schoolId,accessId),session=await one<Row>(tx,`INSERT INTO identity.parent_sessions(school_id,access_link_id,token_hash,csrf_hash,idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,$4,least($5,now()+interval '1 minute'),least($5,now()+interval '1 minute')) RETURNING *`,[schoolId,accessId,tokenHash,hashToken(csrfFor(accessId,tokenHash)),link.expires_at]);const principal=this.principal(session!,link);await this.event(tx,c,principal,'STAFF_PREVIEW',c.operation.id==='previewParentAttendanceMonth'?'attendance':c.operation.id==='previewParentTeacherDirectory'?'teachers':c.operation.id==='previewParentDutySchedule'?'duties':c.operation.id==='previewParentTimetableWeek'?'timetable':c.operation.id.startsWith('previewParentDocument')?'documents':c.operation.id.startsWith('previewParentPublishedActivity')?'activities':c.operation.id.startsWith('previewParentPublishedAnnouncement')?'announcements':c.operation.id.startsWith('previewParentPublishedConduct')?'conduct':undefined);return principal;},{schoolId});
    try{return c.operation.id.startsWith('previewParentPublishedConduct')?await this.conductDisplay(p,c.params.periodId):c.operation.id.startsWith('previewParentPublishedActivity')?await this.sharedContent(p,'activities',c.params.activityId):c.operation.id.startsWith('previewParentPublishedAnnouncement')?await this.sharedContent(p,'announcements',c.params.announcementId):c.operation.id==='previewParentAttendanceMonth'?await this.attendanceMonth(p,c.query.month):c.operation.id==='previewParentTeacherDirectory'?await this.teacherDirectory(p):c.operation.id==='previewParentDutySchedule'?await this.dutySchedule(p):c.operation.id==='previewParentTimetableWeek'?await this.timetableWeek(p,c.query.week):c.operation.id==='previewParentDocumentDirectory'?await this.documentDirectory(p):c.operation.id==='previewParentDocument'?await this.document(p,c.params.documentId!):c.operation.id==='previewParentDocumentView'||c.operation.id==='previewParentDocumentDownload'?await parentDocumentStream(this.db,p,c.params.documentId!,c.operation.id==='previewParentDocumentDownload'):{data:await this.overview(p)};}finally{await this.db.app.query('UPDATE identity.parent_sessions SET revoked_at=now() WHERE id=$1',[p.sessionId]);}
  }
  private async handle(c:RequestContext):Promise<Result>{
    c.reply.header('X-Robots-Tag','noindex, nofollow');if(c.operation.id==='exchangeParentLink')return this.exchange(c);
    const p=c.parent!;
    if(c.operation.id==='endParentSession'){await this.db.transaction(async tx=>{await tx.query('UPDATE identity.parent_sessions SET revoked_at=now() WHERE id=$1 AND school_id=$2',[p.sessionId,p.schoolId]);await this.event(tx,c,p,'ENDED');},{schoolId:p.schoolId});setCookie(c.reply,runtimeConfig().parentCookie,'',0);return {data:{id:p.sessionId,status:'ENDED'}};}
    if(c.operation.id==='getParentContext')return {data:await this.context(p)};
    const section=c.operation.permission.replace('parent.','');this.allow(p,section);let result:Result;
    if(c.operation.id.startsWith('getParentPublishedConduct'))result=await this.conductDisplay(p,c.params.periodId);
    else if(c.operation.id.startsWith('getParentPublishedActivity'))result=await this.sharedContent(p,'activities',c.params.activityId);
    else if(c.operation.id.startsWith('getParentPublishedAnnouncement'))result=await this.sharedContent(p,'announcements',c.params.announcementId);
    else if(c.operation.id==='getParentAttendanceMonth')result=await this.attendanceMonth(p,c.query.month);
    else if(c.operation.id==='getParentTeacherDirectory')result=await this.teacherDirectory(p);
    else if(c.operation.id==='getParentDutySchedule')result=await this.dutySchedule(p);
    else if(c.operation.id==='getParentTimetableWeek')result=await this.timetableWeek(p,c.query.week);
    else if(section==='overview')result={data:await this.overview(p)};
    else if(section==='teachers')result=await this.teachers(p);
    else if(c.operation.id==='getParentDocumentDirectory')result=await this.documentDirectory(p);
    else if(c.operation.id==='getParentDocument')result=await this.document(p,c.params.documentId!);
    else if(c.operation.id==='downloadParentDocument'||c.operation.id==='viewParentDocument'){
      return parentDocumentStream(this.db,p,c.params.documentId!,c.operation.id==='downloadParentDocument',tx=>this.event(tx,c,p,c.operation.id==='downloadParentDocument'?'DOWNLOADED':'READ','documents'));
    }
    else if(section==='documents')result=await this.documents(p,c.query);
    else result=await this.published(p,section,c.query,c.params.periodId?{key:'periodId',id:c.params.periodId}:c.params.activityId?{key:'id',id:c.params.activityId}:c.params.announcementId?{key:'id',id:c.params.announcementId}:undefined);
    await this.db.transaction(tx=>this.event(tx,c,p,result.binary?'DOWNLOADED':'READ',section),{schoolId:p.schoolId});return result;
  }
}
