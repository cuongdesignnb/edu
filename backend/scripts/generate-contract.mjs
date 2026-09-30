import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';

const root = path.resolve(import.meta.dirname, '../..');
const source = path.join(root, 'docs/backend-handoff');
const text = await fs.readFile(path.join(source, 'api/openapi.yaml'), 'utf8');
// The supplied, local design uses repeated YAML anchors in its 264 paths.
// This parser is build-only; it never parses a user upload.
const spec = YAML.parse(text, { maxAliasCount: 10000 });
let emptyRequiredFixed = 0;
function normalize(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node.required) && node.required.length === 0) {
    delete node.required;
    emptyRequiredFixed++;
  }
  for (const value of Object.values(node)) normalize(value);
}
normalize(spec);
// ADR-030: the existing year wizard is one atomic command, with real setup metadata.
spec.components.schemas.Year.properties.setup={type:'object',properties:{termCount:{type:'integer',minimum:1,maximum:4},weekCount:{type:'integer',minimum:1,maximum:110},holidayCount:{type:'integer',minimum:0,maximum:100},copiedRuleSetId:{type:'string',format:'uuid'}},required:['termCount','weekCount','holidayCount'],additionalProperties:false};
Object.assign(spec.components.schemas.Year.properties,{classCount:{type:'integer',minimum:0,nullable:true},studentCount:{type:'integer',minimum:0,nullable:true},terms:{type:'array',items:{$ref:'#/components/schemas/Term'}}});
spec.components.schemas.Term.properties.weekCount={type:'integer',minimum:0};
Object.assign(spec.components.schemas.Week.properties,{inputDeadlineDay:{type:'string',format:'date',nullable:true},locked:{type:'boolean',nullable:true}});
Object.assign(spec.components.schemas.Class.properties,{yearName:{type:'string'},gradeName:{type:'string'},roomCode:{type:'string',nullable:true},homeroomName:{type:'string',nullable:true},homeroomUserId:{type:'string',format:'uuid'},homeroomMemberId:{type:'string',format:'uuid'},subjectTeacherCount:{type:'integer',minimum:0},hasTimetable:{type:'boolean'},inactiveAssignmentCount:{type:'integer',minimum:0},referenceDate:{type:'string',format:'date'}});
const classList=Object.values(spec.paths).map(p=>p.get).find(op=>op?.operationId==='listClasss');
classList.parameters.push(...['homeroomMemberId','homeroomUserId'].map(name=>({name,in:'query',schema:{type:'string',format:'uuid'}})),{name:'homeroom',in:'query',schema:{type:'string',enum:['none']}});
for(const id of ['listMembers','listDictionary','listYears','listClasss']){
  const operation=Object.values(spec.paths).map(p=>p.get).find(op=>op?.operationId===id);
  operation.parameters.push({name:'purpose',in:'query',schema:{type:'string',enum:id==='listMembers'?['assignment-picker']:['class-picker','assignment-picker']}});
}
spec.components.schemas.Member.properties.homeroomOf={type:'array',items:{type:'string'}};
Object.values(spec.paths).map(p=>p.get).find(op=>op?.operationId==='listWeeks').parameters.push({name:'onDate',in:'query',schema:{type:'string',format:'date'}});
// ADR-021: preserve the existing school display/sharing settings form.
for(const name of ['Settings','SettingsPatch'])Object.assign(spec.components.schemas[name].properties,{
  reportHeader:{type:'string',minLength:1,maxLength:200},shareTeacherPhone:{type:'boolean'},shareTeacherEmail:{type:'boolean'},contactHours:{type:'string',maxLength:120}
});
// ADR-022: personal notifications carry only a currently authorized target.
Object.assign(spec.components.schemas.Notification.properties,{body:{type:'string',maxLength:2000},schoolName:{type:'string'},classId:{type:'string',format:'uuid'},accessible:{type:'boolean'}});
spec.paths['/me/notifications'].get.parameters.push({name:'schoolId',in:'query',schema:{type:'string',format:'uuid'}},{name:'kind',in:'query',schema:{type:'string',enum:['task','announcement','system','permission']}},{name:'unread',in:'query',schema:{type:'boolean'}});
// ADR-023: dashboard counts and teacher cards use the same current authorization.
Object.assign(spec.components.schemas.Dashboard.properties,{referenceDate:{type:'string',format:'date'},yearId:{type:'string',format:'uuid'}});
Object.assign(spec.components.schemas.Task.properties,{yearId:{type:'string',format:'uuid'},className:{type:'string'},detail:{type:'string'},status:{type:'string'},tone:{type:'string',enum:['danger','warning','info','neutral']},lessonId:{type:'string',format:'uuid'}});
spec.components.schemas.Task.properties.dueAt.nullable=true;
Object.assign(spec.components.schemas.Class.properties,{studentCount:{type:'integer',minimum:0,nullable:true},myAssignments:{type:'array',items:{type:'object',properties:{id:{type:'string',format:'uuid'},kind:{type:'string',enum:['HOMEROOM','SUBJECT']},subjectId:{type:'string',format:'uuid'},startsOn:{type:'string',format:'date'},endsOn:{type:'string',format:'date'}},required:['id','kind','startsOn'],additionalProperties:false}}});
Object.assign(spec.components.schemas.Lesson.properties,{yearId:{type:'string',format:'uuid'},className:{type:'string'},subjectName:{type:'string'},teacherName:{type:'string'},roomName:{type:'string',nullable:true}});
for(const id of ['getSchoolOverview','getTeacherOverview','getClassOverview','listMyClasses','listMyTasks','listMySchedule','listTeacherAnnouncements']){
  const op=Object.values(spec.paths).flatMap(p=>Object.values(p)).find(op=>op?.operationId===id);
  if(!op.parameters.some(p=>p.name==='yearId'))op.parameters.push({name:'yearId',in:'query',schema:{type:'string',format:'uuid'}});
  if(id==='listMyTasks')op.parameters.push({name:'kind',in:'query',schema:{type:'string',enum:['attendance','conduct','evidence','announcement','groups']}},{name:'classId',in:'query',schema:{type:'string',format:'uuid'}});
  if(id==='listMySchedule')for(const name of ['from','to'])if(!op.parameters.some(p=>p.name===name))op.parameters.push({name,in:'query',schema:{type:'string',format:'date'}});
}
// ADR-004: expose lifecycle metadata needed by the existing assignment UI.
// ADR-024: retain the platform school/profile forms and represent unconfigured contacts honestly.
const schoolProfile={shortName:{type:'string',minLength:1,maxLength:200},province:{type:'string',maxLength:120},level:{type:'string',enum:['THPT','THCS','Tiểu học',null],nullable:true},accentColor:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},motto:{type:'string',maxLength:300},publicIntro:{type:'string',maxLength:4000}};
for(const name of ['School','SchoolCreate','SchoolPatch'])Object.assign(spec.components.schemas[name].properties,structuredClone(schoolProfile));
Object.assign(spec.components.schemas.School.properties,{statusReason:{type:'string',nullable:true},activatedAt:{type:'string',format:'date-time',nullable:true},classCount:{type:'integer',minimum:0},staffCount:{type:'integer',minimum:0},adminNames:{type:'array',items:{type:'string'}},onboarding:{type:'object',properties:Object.fromEntries(['profileDone','adminAssigned','yearCreated','classesCreated','teachersInvited','studentsImported','homeroomAssigned','rulesPublished'].map(k=>[k,{type:'boolean'}])),additionalProperties:false}});
spec.components.schemas.Member.properties.loginEmail={type:'string',format:'email'};
spec.components.schemas.InviteRequest.properties.workDisplayName={type:'string',minLength:1,maxLength:200};
for(const name of ['PlatformSettings','PlatformSettingsPatch']){spec.components.schemas[name].properties.supportEmail.nullable=true;Object.assign(spec.components.schemas[name].properties,{publicSupportPhone:{type:'string',maxLength:120,nullable:true},footerNote:{type:'string',maxLength:1000}});}
for(const id of ['listPlatformSchools','listPlatformAudit','listOperations']){
  const op=Object.values(spec.paths).flatMap(p=>Object.values(p)).find(op=>op?.operationId===id);
  for(const name of id==='listPlatformSchools'?['status','province']:id==='listPlatformAudit'?['action','targetType','schoolId']:['kind','status'])op.parameters.push({name,in:'query',schema:{type:'string',...(name==='schoolId'?{format:'uuid'}:{})}});
}
spec.components.schemas.Assignment.properties.revokedAt = { type:'string',format:'date-time',nullable:true };
spec.components.schemas.AssignmentCreate.properties.reason={type:'string',minLength:5,maxLength:4000};
spec.components.schemas.InviteRequest.properties.reason={type:'string',minLength:5,maxLength:4000};
spec.components.schemas.GrantView.properties.revokedAt = { type:'string',format:'date-time',nullable:true };
// ADR-006: scoped creation of a new unassociated guardian contact.
spec.paths['/schools/{schoolId}/guardians'].post.parameters.push({name:'classId',in:'query',required:false,schema:{type:'string',format:'uuid'}});
spec.components.schemas.File.properties.scanStatus={type:'string',enum:['NOT_SCANNED','SCANNED','GENERATED']};
spec.components.schemas.File.properties.rejectionCode={type:'string',nullable:true};
spec.components.schemas.ImportJob.properties.yearId={type:'string',format:'uuid'};
spec.components.schemas.ImportJob.properties.classId={type:'string',format:'uuid'};
spec.components.schemas.ImportJob.properties.columns={type:'array',items:{type:'string'}};
spec.components.schemas.ImportRow.properties.decision={type:'string',enum:['ADD','UPDATE','SKIP']};
spec.components.schemas.ImportRow.properties.matchedId={type:'string',format:'uuid'};
spec.components.schemas.AttendanceSession.properties.dataVersion={type:'integer',minimum:1};
spec.components.schemas.AttendanceSession.properties.slot={type:'string',enum:['MORNING','AFTERNOON']};
spec.components.schemas.AttendanceCreate.properties.slot={type:'string',enum:['MORNING','AFTERNOON']};
spec.components.schemas.AttendanceBulk.properties.linkConduct={type:'boolean'};
spec.components.schemas.AttendanceSession.properties.conductSync={type:'object',properties:{created:{type:'integer',minimum:0},excluded:{type:'integer',minimum:0},blocked:{type:'array',items:{type:'object',properties:{enrollmentId:{type:'string',format:'uuid'},code:{type:'string'}},required:['enrollmentId','code'],additionalProperties:false}}},required:['created','excluded','blocked'],additionalProperties:false};
spec.paths['/schools/{schoolId}/classes/{classId}/attendance-summary'].get.parameters.push({name:'slot',in:'query',schema:{type:'string',enum:['MORNING','AFTERNOON']}});
spec.components.schemas.ConductRule.properties.attendanceStatus={type:'string',enum:['LATE','UNEXCUSED']};
spec.components.schemas.ConductRecordCreate.properties.lessonId={type:'string',format:'uuid'};
spec.components.schemas.ConductRecord.properties.lessonId={type:'string',format:'uuid'};
spec.components.schemas.ConductRecord.properties.subjectId={type:'string',format:'uuid'};
spec.components.schemas.ConductRecord.properties.sourceId={type:'string',format:'uuid'};
spec.components.schemas.ConductRecord.properties.exclusionReason={type:'string'};
spec.components.schemas.Adjustment.properties.preview={type:'object',properties:{before:{$ref:'#/components/schemas/ConductSummary'},after:{$ref:'#/components/schemas/ConductSummary'}},required:['before','after'],additionalProperties:false};
spec.components.schemas.Adjustment.properties.decisionReason={type:'string'};
spec.components.schemas.Adjustment.properties.resultPublicationId={type:'string',format:'uuid'};
spec.components.schemas.AdjustmentCreate.properties.proposedChanges.minItems=1;
spec.components.schemas.AdjustmentCreate.properties.proposedChanges.maxItems=100;
// ADR-016: preserve dated class organization and the existing unassign UI.
spec.components.schemas.GroupAssign.properties.groupId.nullable=true;
for(const name of ['GroupAssign','PositionAssign'])spec.components.schemas[name].properties.reason={type:'string',minLength:5,maxLength:2000};
spec.components.schemas.PositionCreate.properties.groupId={type:'string',format:'uuid'};
spec.components.schemas.Position.properties.groupId={type:'string',format:'uuid'};
spec.components.schemas.PositionAssignment.properties.cancelledAt={type:'string',format:'date-time',nullable:true};
spec.components.schemas.SeatingPlan.properties.endsOn={type:'string',format:'date',nullable:true};
spec.components.schemas.SeatingCreate.properties.expectedRevision={type:'integer',minimum:0};
for(const id of ['listGroups','listPositionAssignments']){
  const op=Object.values(spec.paths).flatMap(path=>Object.values(path)).find(op=>op?.operationId===id);
  op.parameters.push({name:'onDate',in:'query',schema:{type:'string',format:'date'}});
}
spec.paths['/schools/{schoolId}/classes/{classId}/position-assignments'].get.parameters.push(...['positionId','enrollmentId'].map(name=>({name,in:'query',schema:{type:'string',format:'uuid'}})));
for(const name of ['Timetable','DutySchedule']){spec.components.schemas[name].properties.dataVersion={type:'integer',minimum:1};spec.components.schemas[name].properties.publishedAt={type:'string',format:'date-time',nullable:true};}
for(const [name,item] of [['ParentLessonBatch','ParentLesson'],['ParentDutyBatch','ParentDuty']])spec.components.schemas[name]={type:'object',properties:{items:{type:'array',items:{$ref:`#/components/schemas/${item}`},maxItems:5000}},required:['items'],additionalProperties:false};
spec.components.schemas.PublicationDetail.properties.duty={$ref:'#/components/schemas/DutySchedule'};
spec.components.schemas.PublicationDetail.properties.lessons={type:'array',items:{$ref:'#/components/schemas/Lesson'},maxItems:10000};
spec.components.schemas.ParentLesson.properties.status={type:'string',enum:['SCHEDULED','CANCELLED']};
spec.components.schemas.Lesson.properties.periodNumber={type:'integer',minimum:1,nullable:true};
spec.components.schemas.Lesson.properties.changeReason={type:'string',maxLength:4000,nullable:true};
for(const name of ['DutyCreate','DutySchedulePatch','DutySchedule'])spec.components.schemas[name].properties.assignments.maxItems=5000;
spec.components.schemas.GroupDutyAssignment={type:'object',properties:{id:{type:'string',format:'uuid'},groupId:{type:'string',format:'uuid'},dutyDate:{type:'string',format:'date'},task:{type:'string',minLength:3,maxLength:4000},status:{type:'string',enum:['ASSIGNED','DONE','CANCELLED']}},required:['groupId','dutyDate','task'],additionalProperties:false};
for(const name of ['DutyCreate','DutySchedulePatch','DutySchedule'])spec.components.schemas[name].properties.groupAssignments={type:'array',maxItems:200,items:{$ref:'#/components/schemas/GroupDutyAssignment'}};
// ADR-019: preserve the existing activity edit/close/receive/share workflows.
spec.components.schemas.Activity.properties.dataVersion={type:'integer',minimum:1};
spec.components.schemas.Activity.properties.assignedAt={type:'string',format:'date-time',nullable:true};
for(const name of ['Activity','ActivityCreate','ActivityPatch'])spec.components.schemas[name].properties.illustration={type:'string',enum:['trophy','stem','clean','book','heart']};
spec.components.schemas.ActivityPatch.properties.enrollmentIds=structuredClone(spec.components.schemas.ActivityCreate.properties.enrollmentIds);
spec.components.schemas.ActivityPatch.properties.status={type:'string',enum:['ASSIGNED','CLOSED','ARCHIVED']};
spec.components.schemas.Participant.properties.cancelledAt={type:'string',format:'date-time',nullable:true};
spec.components.schemas.ParticipantStatusCommand.properties.status.enum.push('ASSIGNED','SUBMITTED');
spec.components.schemas.ReviewEvidence.properties.shareWithGuardian={type:'boolean'};
for(const id of ['listActivities','listParticipants','listEvidence']){
  const op=Object.values(spec.paths).flatMap(path=>Object.values(path)).find(op=>op?.operationId===id);
  op.parameters.push({name:'status',in:'query',schema:{type:'string'}});
  if(id==='listEvidence')op.parameters.push({name:'participantId',in:'query',schema:{type:'string',format:'uuid'}});
}
// ADR-020: announcement source revisions remain separate from published readers.
for(const name of ['Announcement','AnnouncementCreate','AnnouncementPatch']){
  spec.components.schemas[name].properties.summary={type:'string',maxLength:4000};
  spec.components.schemas[name].properties.audience={type:'string',enum:['FAMILIES','STAFF','ALL']};
  spec.components.schemas[name].properties.internalNote={type:'string',maxLength:4000};
}
spec.components.schemas.Announcement.properties.rootId={type:'string',format:'uuid'};
spec.components.schemas.Announcement.properties.dataVersion={type:'integer',minimum:1};
spec.components.schemas.Announcement.properties.discardedAt={type:'string',format:'date-time',nullable:true};
spec.components.schemas.Announcement.properties.scheduleState={type:'string',enum:['PENDING','LEASED','DONE','FAILED','CANCELLED']};
spec.components.schemas.Announcement.properties.scheduleErrorCode={type:'string'};
spec.components.schemas.AnnouncementPatch.properties.discard={type:'boolean'};
for(const id of ['listSchoolAnnouncements','listClassAnnouncements']){
  const op=Object.values(spec.paths).flatMap(path=>Object.values(path)).find(op=>op?.operationId===id);
  op.parameters.push({name:'status',in:'query',schema:{type:'string'}},{name:'yearId',in:'query',schema:{type:'string',format:'uuid'}});
}
spec.info.version = '1.0.0-implementation';
// ADR-025: the existing support queue/consent states are persisted, not simulated.
for(const name of ['SupportTicket','SupportTicketPatch'])spec.components.schemas[name].properties.status.enum.push('WAITING_SCHOOL');
for(const name of ['SupportTicket','TicketCreate'])spec.components.schemas[name].properties.priority.enum.push('LOW');
spec.components.schemas.SupportTicketPatch.properties.assigneeId.nullable=true;
Object.assign(spec.components.schemas.SupportTicket.properties,{schoolName:{type:'string'},requesterName:{type:'string'},assigneeName:{type:'string',nullable:true},operatorChoices:{type:'array',maxItems:100,items:{type:'object',properties:{id:{type:'string',format:'uuid'},name:{type:'string'}},required:['id','name'],additionalProperties:false}}});
spec.components.schemas.SupportMessage.properties.side={type:'string',enum:['SCHOOL','PLATFORM','UNKNOWN']};
Object.assign(spec.components.schemas.SupportAccess.properties,{requestedById:{type:'string',format:'uuid'},approvedById:{type:'string',format:'uuid'},operatorName:{type:'string'},approverName:{type:'string',nullable:true},requesterName:{type:'string',nullable:true},schoolName:{type:'string'},effective:{type:'boolean'},revokedAt:{type:'string',format:'date-time',nullable:true}});
spec.components.schemas.SupportAccessCreate.properties.allowedActions.minItems=1;spec.components.schemas.SupportAccessCreate.properties.allowedActions.maxItems=9;
spec.components.schemas.SupportAccessRevoke={...structuredClone(spec.components.schemas.ReasonCommand),properties:{...structuredClone(spec.components.schemas.ReasonCommand.properties),decision:{type:'string',enum:['REVOKE','REJECT']}}};
spec.paths['/schools/{schoolId}/support-access/{supportAccessId}/revoke'].post.requestBody.content['application/json'].schema={$ref:'#/components/schemas/SupportAccessRevoke'};
for(const id of ['listPlatformTickets','listSchoolTickets','listPlatformSupportAccess','listSchoolSupportAccess']){
  const op=Object.values(spec.paths).flatMap(p=>Object.values(p)).find(op=>op?.operationId===id),names=id.includes('SupportAccess')?['status','ticketId','operatorId','schoolId']:['status','priority','assigneeId','schoolId'];
  for(const name of names)if(!op.parameters.some(p=>p.name===name))op.parameters.push({name,in:'query',schema:{type:'string',...(name.endsWith('Id')?{format:'uuid'}:{})}});
}
// ADR-026: a selected support grant is explicit and applies only to metadata GETs.
const supportReadIds=['getSchoolProfile','getSchoolSettings','listClasss','getClass','listAssignments','listYears','getYear','listTerms','getTerm','listWeeks','getWeek','listDictionary','listMembers','getMember','listRoles','getRole','listImports','getImport'];
for(const id of supportReadIds){const op=Object.values(spec.paths).flatMap(p=>Object.values(p)).find(op=>op?.operationId===id);if(!op)throw new Error(`Support metadata operation missing: ${id}`);op.parameters.push({name:'X-Support-Access',in:'header',schema:{type:'string',format:'uuid'},description:'Explicit school-approved read-only support grant; current operator, scope and expiry are rechecked.'});}
await fs.mkdir(path.join(root, 'backend/api'), { recursive: true });
const operations = JSON.parse(await fs.readFile(path.join(source, 'api/operations.json'), 'utf8'));
// ADR-033: SC07 needs a bounded end-year roster without borrowing directory read rights.
const previewPath='/schools/{schoolId}/academic-years/{yearId}/rollover-preview';
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const uuid={type:'string',format:'uuid'},label={type:'string'},count={type:'integer',minimum:0},timestamp={type:'string',format:'date-time'};
spec.components.schemas.RolloverPreviewStudent=object({id:uuid,studentCode:label,fullName:label,status:structuredClone(spec.components.schemas.Student.properties.status)});
spec.components.schemas.RolloverPreviewSourceClass=object({id:uuid,name:label,gradeLevel:{type:'integer',minimum:1,maximum:12,nullable:true},students:{type:'array',maxItems:2000,items:{$ref:'#/components/schemas/RolloverPreviewStudent'}}});
spec.components.schemas.RolloverPreviewTargetClass=object({id:uuid,name:label,gradeLevelId:uuid,studentCount:count});
spec.components.schemas.RolloverPreviewTarget=object({year:{$ref:'#/components/schemas/Year'},classes:{type:'array',maxItems:200,items:{$ref:'#/components/schemas/RolloverPreviewTargetClass'}}});
spec.components.schemas.RolloverPreview=object({source:{$ref:'#/components/schemas/Year'},referenceDate:{type:'string',format:'date'},sourceClasses:{type:'array',maxItems:200,items:{$ref:'#/components/schemas/RolloverPreviewSourceClass'}},targets:{type:'array',maxItems:100,items:{$ref:'#/components/schemas/RolloverPreviewTarget'}},grades:{type:'array',maxItems:100,items:{$ref:'#/components/schemas/DictionaryItem'}}});
spec.components.schemas.RolloverPreviewResponse=object({data:{$ref:'#/components/schemas/RolloverPreview'},requestId:label});
// ADR-034: the SC01 projection preserves the existing layout with explicit unavailable fields.
spec.components.schemas.SchoolOverviewKpi=object(Object.fromEntries(['activeClasses','draftClasses','prevClasses','staffActive','students','prevStudents','linksActive','linksOpened'].map(k=>[k,{...count,nullable:true}])));
spec.components.schemas.SchoolOverviewStep=object({key:label,label,done:{type:'boolean',nullable:true},detail:label,href:label});
spec.components.schemas.SchoolOverviewClass=object({...structuredClone(spec.components.schemas.Class.properties),tasks:{type:'array',items:label},severity:{type:'string',enum:['blocked','attention']}},[...spec.components.schemas.Class.required,'tasks','severity']);
spec.components.schemas.SchoolOverviewTodayItem=object({key:label,label,detail:label,href:label,tone:{type:'string',enum:['danger','warning','info']}});
spec.components.schemas.SchoolOverviewAnnouncement=object({id:uuid,title:label,summary:label,status:{type:'string',enum:['PUBLISHED','SCHEDULED']},createdAt:{type:'string',format:'date-time'},publishedAt:{type:'string',format:'date-time',nullable:true},scheduledAt:{type:'string',format:'date-time',nullable:true}});
spec.components.schemas.SchoolOverviewDetails=object({year:{$ref:'#/components/schemas/Year',nullable:true},prevYear:{$ref:'#/components/schemas/Year',nullable:true},kpi:{$ref:'#/components/schemas/SchoolOverviewKpi'},setup:{type:'array',minItems:8,maxItems:8,items:{$ref:'#/components/schemas/SchoolOverviewStep'}},classesNeedingAction:{type:'array',nullable:true,maxItems:2000,items:{$ref:'#/components/schemas/SchoolOverviewClass'}},todayItems:{type:'array',nullable:true,maxItems:5,items:{$ref:'#/components/schemas/SchoolOverviewTodayItem'}},announcements:{type:'array',nullable:true,maxItems:4,items:{$ref:'#/components/schemas/SchoolOverviewAnnouncement'}}});
// OpenAPI 3.0 nullable with a reference requires an explicit null alternative for AJV.
spec.components.schemas.SchoolOverviewDetails.properties.classesNeedingAction.maxItems=6;
spec.components.schemas.SchoolOverviewDetails.properties.classesNeedingActionTotal={...count,nullable:true};
spec.components.schemas.SchoolOverviewDetails.required.push('classesNeedingActionTotal');
for(const name of ['year','prevYear'])spec.components.schemas.SchoolOverviewDetails.properties[name]={anyOf:[{$ref:'#/components/schemas/Year'},{type:'object',nullable:true,enum:[null]}]};
spec.components.schemas.Dashboard.properties.schoolOverview={$ref:'#/components/schemas/SchoolOverviewDetails'};
const previewOperation=structuredClone(spec.paths['/schools/{schoolId}/academic-years/{yearId}'].get);
previewOperation.parameters=previewOperation.parameters.filter(p=>p.in==='path');
Object.assign(previewOperation,{operationId:'getRolloverPreview',summary:'Danh sách cuối năm để chuẩn bị xếp lớp',description:'Minimal end-year roster under current school year.manage; no family/contact fields.', 'x-permission':'year.manage','x-frontend-screen-ids':['SC07']});
previewOperation.responses['200'].content['application/json'].schema={$ref:'#/components/schemas/RolloverPreviewResponse'};
spec.paths[previewPath]={get:previewOperation};
operations.push({id:'getRolloverPreview',method:'GET',path:'/api/v1'+previewPath,title:previewOperation.summary,tag:'School',permission:'year.manage',scope:'school',request:null,response:'RolloverPreview',list:false,auth:'staff',async_job:false,frontend_ids:['SC07'],description:previewOperation.description});
// ADR-036: native platform form metadata and an atomic optional first administrator.
spec.components.schemas.InviteRequest.properties.expiresInDays={type:'integer',minimum:1,maximum:14,default:2};
spec.components.schemas.PlatformAdminInviteRequest=structuredClone(spec.components.schemas.InviteRequest);
spec.components.schemas.PlatformAdminInviteRequest.required=spec.components.schemas.PlatformAdminInviteRequest.required.filter(name=>name!=='validFrom');
spec.components.schemas.SchoolCreate.properties.firstAdmin={$ref:'#/components/schemas/PlatformAdminInviteRequest'};
const adminInviteOperation=Object.values(spec.paths).flatMap(p=>Object.values(p)).find(op=>op?.operationId==='inviteSchoolAdmin');
adminInviteOperation.requestBody.content['application/json'].schema={$ref:'#/components/schemas/PlatformAdminInviteRequest'};
operations.find(op=>op.id==='inviteSchoolAdmin').request='PlatformAdminInviteRequest';
spec.components.schemas.PlatformSchoolOptions=object({provinces:{type:'array',maxItems:200,items:label}});
spec.components.schemas.PlatformSchoolIdentity=object({codeTaken:{type:'boolean'},slugTaken:{type:'boolean'}});
for(const name of ['PlatformSchoolOptions','PlatformSchoolIdentity'])spec.components.schemas[name+'Response']=object({data:{$ref:'#/components/schemas/'+name},requestId:label});
function extendOperation(templateId,id,path,permission,response,list,screenIds,parameters,request){
  const template=operations.find(op=>op.id===templateId),operation=structuredClone(spec.paths[template.path.replace(/^\/api\/v1/,'')][template.method.toLowerCase()]);
  Object.assign(operation,{operationId:id,summary:id,description:'Operational metadata under current native authority; no pupil or family data.','x-permission':permission,'x-frontend-screen-ids':screenIds});
  operation.parameters=parameters??[...Array.from(path.matchAll(/\{([^}]+)\}/g),match=>({name:match[1],in:'path',required:true,schema:uuid})),...operation.parameters.filter(p=>p.in!=='header'&&p.in!=='path')];
  for(const [status,result]of Object.entries(operation.responses))if(/^2\d\d$/.test(status)&&result.content?.['application/json'])result.content['application/json'].schema={$ref:'#/components/schemas/'+response+(list?'Page':'Response')};
  if(request)operation.requestBody.content['application/json'].schema={$ref:'#/components/schemas/'+request};
  spec.paths[path]??={};spec.paths[path][template.method.toLowerCase()]=operation;
  operations.push({...template,id,path:'/api/v1'+path,title:operation.summary,tag:path.startsWith('/platform/')?'Platform':template.tag,scope:path.includes('{schoolId}')?'school':'platform',permission,response,list,request:request??template.request,frontend_ids:screenIds,description:operation.description});
}
extendOperation('getPlatformSchool','getPlatformSchoolOptions','/platform/school-options','platform.schools.read','PlatformSchoolOptions',false,['PL02','PL03'],[]);
extendOperation('getPlatformSchool','checkPlatformSchoolIdentity','/platform/school-identity','platform.schools.manage','PlatformSchoolIdentity',false,['PL03'],['code','slug'].map(name=>({name,in:'query',schema:{type:'string',maxLength:name==='code'?16:40}})));
extendOperation('listInvitations','listSchoolAdminInvitations','/platform/schools/{schoolId}/admin-invitations','platform.admins.manage','Invitation',true,['PL04','PL05']);
extendOperation('revokeInvitation','revokePlatformAdminInvitation','/platform/schools/{schoolId}/admin-invitations/{invitationId}/revoke','platform.admins.manage','Invitation',false,['PL05']);
// ADR-037: purpose-bound support choices/counts, atomic ticket updates and own-grant return.
Object.assign(spec.components.schemas.SupportTicket.properties,{requesterId:uuid,schoolStatus:structuredClone(spec.components.schemas.School.properties.status),messageCount:count});
spec.components.schemas.SupportMessage.properties.authorId={...uuid,nullable:true};
spec.components.schemas.AuditEvent.properties.actorId={...uuid,nullable:true};
spec.components.schemas.SupportTicketPatch.properties.message={type:'string',minLength:3,maxLength:2000};
const supportViews=['requested','active','expired','revoked','declined','inactive'];
spec.components.schemas.SupportAccess.properties.viewStatus={type:'string',enum:supportViews};
for(const id of ['listPlatformSupportAccess','listSchoolSupportAccess']){
  const operation=Object.values(spec.paths).flatMap(p=>Object.values(p)).find(op=>op?.operationId===id);
  operation.parameters.push({name:'viewStatus',in:'query',schema:{type:'string',enum:supportViews}},{name:'effective',in:'query',schema:{type:'boolean'}});
}
spec.components.schemas.PlatformSupportOptions=object({operators:{type:'array',maxItems:100,items:object({id:uuid,name:label})},schools:{type:'array',maxItems:1000,items:object({id:uuid,name:label,status:structuredClone(spec.components.schemas.School.properties.status)})},tickets:{type:'array',maxItems:2000,items:object({id:uuid,schoolId:uuid,title:label})},queue:object(Object.fromEntries(['total','open','inProgress','waitingSchool','resolved','high'].map(name=>[name,count]))),grants:object(Object.fromEntries(['total',...supportViews].map(name=>[name,count])))});
spec.components.schemas.PlatformSupportAccessRequest=object({ticketId:uuid,classId:uuid,allowedActions:structuredClone(spec.components.schemas.SupportAccessCreate.properties.allowedActions),reason:structuredClone(spec.components.schemas.SupportAccessCreate.properties.reason),durationDays:{type:'integer',minimum:1,maximum:14}},['ticketId','allowedActions','reason','durationDays']);
spec.components.schemas.PlatformAuditOptions=object({actors:{type:'array',maxItems:1000,items:object({id:uuid,name:label})}});
for(const name of ['PlatformSupportOptions','PlatformAuditOptions'])spec.components.schemas[name+'Response']=object({data:{$ref:'#/components/schemas/'+name},requestId:label});
extendOperation('getPlatformSchool','getPlatformSupportOptions','/platform/support-options','platform.support','PlatformSupportOptions',false,['PL04','PL06','PL07','PL08'],[{name:'schoolId',in:'query',schema:uuid}]);
extendOperation('createSupportAccess','requestPlatformSupportAccess','/platform/schools/{schoolId}/support-access','platform.support','SupportAccess',false,['PL07','PL08'],undefined,'PlatformSupportAccessRequest');
extendOperation('revokeSupportAccess','relinquishPlatformSupportAccess','/platform/support-access/{supportAccessId}/relinquish','platform.support','SupportAccess',false,['PL08'],undefined,'ReasonCommand');
extendOperation('getPlatformSchool','getPlatformAuditOptions','/platform/audit-options','platform.audit','PlatformAuditOptions',false,['PL09'],[]);
const platformAudit=Object.values(spec.paths).flatMap(p=>Object.values(p)).find(op=>op?.operationId==='listPlatformAudit');
platformAudit.parameters.push({name:'actorId',in:'query',schema:uuid},...['from','to'].map(name=>({name,in:'query',schema:{type:'string',format:'date'}})));
// ADR-038: school support and audit projections keep independent consent/read authority.
spec.components.schemas.SchoolSupportSummary=object({queue:structuredClone(spec.components.schemas.PlatformSupportOptions.properties.queue),grants:{...structuredClone(spec.components.schemas.PlatformSupportOptions.properties.grants),nullable:true},canApprove:{type:'boolean'}});
spec.components.schemas.SchoolAuditOptions=object({actors:structuredClone(spec.components.schemas.PlatformAuditOptions.properties.actors),entityTypes:{type:'array',maxItems:1000,items:label}});
for(const name of ['SchoolSupportSummary','SchoolAuditOptions'])spec.components.schemas[name+'Response']=object({data:{$ref:'#/components/schemas/'+name},requestId:label});
extendOperation('getSchoolTicket','getSchoolSupportSummary','/schools/{schoolId}/support-summary','support.manage','SchoolSupportSummary',false,['O33','O34']);
extendOperation('listSchoolAudit','getSchoolAuditOptions','/schools/{schoolId}/audit-options','audit.read','SchoolAuditOptions',false,['O35'],[{name:'schoolId',in:'path',required:true,schema:uuid}]);
const schoolAudit=Object.values(spec.paths).flatMap(p=>Object.values(p)).find(op=>op?.operationId==='listSchoolAudit');
schoolAudit.parameters.push({name:'actorId',in:'query',schema:uuid},{name:'targetType',in:'query',schema:{type:'string',maxLength:100}},...['from','to'].map(name=>({name,in:'query',schema:{type:'string',format:'date'}})));
// ADR-039: observed service probes, worker-cycle evidence and actual backup runs.
spec.components.schemas.OperationRun.properties.createdAt={type:'string',format:'date-time'};
spec.components.schemas.PlatformOperationService=object({key:{type:'string',enum:['api','database','parent','storage','worker','mail']},state:{type:'string',enum:['operational','degraded','unknown','local']},note:label,observedAt:{type:'string',format:'date-time',nullable:true}});
spec.components.schemas.PlatformOperationsOverview=object({checkedAt:{type:'string',format:'date-time'},services:{type:'array',minItems:6,maxItems:6,items:{$ref:'#/components/schemas/PlatformOperationService'}},backups:{type:'array',maxItems:10,items:{$ref:'#/components/schemas/OperationRun'}},backupTotal:count,storageFreeBytes:{...count,nullable:true},mail:object({failed:count,pending:count}),store:object({schema:label,migratedAt:{type:'string',format:'date-time',nullable:true},migrations:count,schools:count,users:count,auditEvents:count}),checklist:object(Object.fromEntries(['noAdmin','drafts','expiringAdminInvitations','pendingAdminInvitations','highTickets','unassignedTickets','activeGrants','requestedGrants'].map(name=>[name,count])))});
spec.components.schemas.PlatformOperationsOverviewResponse=object({data:{$ref:'#/components/schemas/PlatformOperationsOverview'},requestId:label});
extendOperation('getPlatformSchool','getPlatformOperationsOverview','/platform/operations-overview','platform.operations','PlatformOperationsOverview',false,['PL10'],[]);
// ADR-041: preserve atomic school-role replacement and complete membership ending.
Object.assign(spec.components.schemas.Member.properties,{joinedAt:{...timestamp,nullable:true},endedAt:{...timestamp,nullable:true},statusReason:{type:'string',maxLength:2000,nullable:true},schoolRoleGrants:{type:'array',items:{$ref:'#/components/schemas/GrantView'}}});
spec.components.schemas.MemberRolesReplace=object({expectedVersion:{type:'integer',minimum:1},roleIds:{type:'array',maxItems:50,uniqueItems:true,items:uuid},validUntil:{...timestamp,nullable:true},reason:{type:'string',minLength:3,maxLength:2000}},['expectedVersion','roleIds','reason']);
spec.components.schemas.MemberSchoolRoles=object({id:uuid,version:{type:'integer',minimum:1},status:structuredClone(spec.components.schemas.Member.properties.status),schoolRoleGrants:{type:'array',items:{$ref:'#/components/schemas/GrantView'}}});
spec.components.schemas.MemberSchoolRolesResponse=object({data:{$ref:'#/components/schemas/MemberSchoolRoles'},requestId:label});
extendOperation('suspendMember','replaceMemberSchoolRoles','/schools/{schoolId}/members/{memberId}/school-roles','role.manage','MemberSchoolRoles',false,['SC11'],undefined,'MemberRolesReplace');
extendOperation('suspendMember','endMember','/schools/{schoolId}/members/{memberId}/end','member.manage','Member',false,['SC11']);
// ADR-042: the existing school invite form supports multiple or no school roles.
spec.components.schemas.SchoolStaffInvite=object({email:{type:'string',format:'email'},workDisplayName:{type:'string',minLength:3,maxLength:200},proposedDuty:{type:'string',maxLength:300},roleIds:{type:'array',maxItems:50,uniqueItems:true,items:uuid},expiresInDays:{type:'integer',minimum:1,maximum:30},validUntil:{...timestamp,nullable:true}},['email','workDisplayName','roleIds','expiresInDays']);
Object.assign(spec.components.schemas.Invitation.properties,{proposedDuty:{type:'string',maxLength:300},roleIds:{type:'array',items:uuid}});
extendOperation('inviteStaff','inviteSchoolStaff','/schools/{schoolId}/staff-invitations','member.manage','Invitation',false,['SC10'],undefined,'SchoolStaffInvite');
// ADR-043: SC10 reads one SQL-filtered directory, with authority-separated invitation metadata.
spec.components.schemas.StaffDirectoryRow=object({id:uuid,version:{type:'integer',minimum:1},createdAt:timestamp,updatedAt:timestamp,kind:{type:'string',enum:['MEMBER','INVITATION']},memberId:{...uuid,nullable:true},userId:{...uuid,nullable:true},status:{type:'string',enum:[...spec.components.schemas.Member.properties.status.enum,null],nullable:true},accessActive:{type:'boolean'},fullName:label,email:{type:'string',format:'email',nullable:true},department:{type:'string',nullable:true},staffCode:{type:'string',nullable:true},expiresAt:{...timestamp,nullable:true},roleLabels:{type:'array',items:label},dutyLabels:{type:'array',items:label}});
spec.components.schemas.StaffDirectoryRowPage=object({data:{type:'array',items:{$ref:'#/components/schemas/StaffDirectoryRow'}},page:{$ref:'#/components/schemas/PageInfo'},requestId:label});
spec.components.schemas.StaffDirectorySummary=object({kpi:object({total:count,active:count,suspended:count,pendingInvites:{...count,nullable:true}}),departments:{type:'array',maxItems:1000,items:label},roleLabels:{type:'array',maxItems:1003,items:label},canInvite:{type:'boolean'},canSuspend:{type:'boolean'},canAssign:{type:'boolean'},canExport:{type:'boolean'},canViewInvitations:{type:'boolean'}});
spec.components.schemas.StaffDirectorySummaryResponse=object({data:{$ref:'#/components/schemas/StaffDirectorySummary'},requestId:label});
extendOperation('listMembers','listStaffDirectory','/schools/{schoolId}/staff-directory','member.read','StaffDirectoryRow',true,['SC10']);
const staffList=spec.paths['/schools/{schoolId}/staff-directory'].get;
staffList.parameters=staffList.parameters.filter(p=>!['purpose','status'].includes(p.name));
staffList.parameters.push({name:'status',in:'query',schema:{type:'string',enum:['ACTIVE','SUSPENDED','ENDED','INVITED','PENDING_INVITATION']}},{name:'purpose',in:'query',schema:{type:'string',enum:['export']}},...['department','role'].map(name=>({name,in:'query',schema:{type:'string',maxLength:200}})));
extendOperation('getMember','getStaffDirectorySummary','/schools/{schoolId}/staff-directory-summary','member.read','StaffDirectorySummary',false,['SC10']);
// ADR-044: member details keep assignment, role management and audit authority independent.
spec.components.schemas.MemberRoleChoice=object({id:uuid,version:{type:'integer',minimum:1},label,code:label,systemRole:{type:'boolean'},canDelegate:{type:'boolean'},delegationUntil:{...timestamp,nullable:true}});
spec.components.schemas.MemberAssignmentDetails=object({id:uuid,version:{type:'integer',minimum:1},classId:uuid,className:label,yearName:label,memberId:uuid,roleGrantId:uuid,
  kind:{type:'string',enum:['HOMEROOM','SUBJECT']},subjectId:{...uuid,nullable:true},subjectName:{type:'string',nullable:true},startsOn:{type:'string',format:'date'},endsOn:{type:'string',format:'date',nullable:true},revokedAt:{...timestamp,nullable:true},
  grantValidFrom:timestamp,grantValidUntil:{...timestamp,nullable:true},grantRevokedAt:{...timestamp,nullable:true},roleLabel:label,roleStatus:{type:'string',enum:['ACTIVE','ARCHIVED']},createdAt:timestamp,createdBy:{...uuid,nullable:true},createdByName:{type:'string',nullable:true},live:{type:'boolean'}});
spec.components.schemas.MemberDetails=object({member:{$ref:'#/components/schemas/Member'},referenceDate:{type:'string',format:'date'},joinedOn:{type:'string',format:'date',nullable:true},accessActive:{type:'boolean'},otherSchools:count,
  assignments:{type:'array',maxItems:2000,nullable:true,items:{$ref:'#/components/schemas/MemberAssignmentDetails'}},roleChoices:{type:'array',maxItems:1000,nullable:true,items:{$ref:'#/components/schemas/MemberRoleChoice'}},
  canAssign:{type:'boolean'},canSuspend:{type:'boolean'},canRole:{type:'boolean'},canViewHistory:{type:'boolean'},isSelf:{type:'boolean'}});
spec.components.schemas.MemberDetailsResponse=object({data:{$ref:'#/components/schemas/MemberDetails'},requestId:label});
extendOperation('getMember','getMemberDetails','/schools/{schoolId}/members/{memberId}/details','member.read','MemberDetails',false,['SC11']);
extendOperation('listSchoolAudit','listMemberHistory','/schools/{schoolId}/members/{memberId}/history','member.read+audit.read','AuditEvent',true,['SC11']);
spec.paths['/schools/{schoolId}/members/{memberId}/history'].get.parameters=spec.paths['/schools/{schoolId}/members/{memberId}/history'].get.parameters.filter(p=>p.in==='path'||['limit','cursor','sort','dir'].includes(p.name));
// ADR-047: role readers keep exact native scopes and independently authorized panels.
spec.components.schemas.RolePatch.properties.reason={type:'string',minLength:3,maxLength:1000};
spec.components.schemas.RolePatch.required.push('reason');
Object.assign(spec.components.schemas.Role.properties,{status:{type:'string',enum:['ACTIVE','ARCHIVED']},scopes:{type:'array',items:{type:'string',enum:['SCHOOL','CLASS','SUBJECT']}},memberCount:{type:'integer',minimum:0},assignmentCount:{type:'integer',minimum:0}});
spec.components.schemas.RoleHolder=object({grantId:uuid,memberId:uuid,name:label,scopeType:{type:'string',enum:['SCHOOL','CLASS','SUBJECT']},classId:{...uuid,nullable:true},subjectId:{...uuid,nullable:true},validFrom:timestamp,validUntil:{...timestamp,nullable:true}});
spec.components.schemas.RoleDetails=object({role:{$ref:'#/components/schemas/Role'},canEdit:{type:'boolean'},ownRole:{type:'boolean'},systemRole:{type:'boolean'},canViewMembers:{type:'boolean'},canViewHistory:{type:'boolean'},
  actions:{type:'array',items:object({action:{type:'string'},canGrant:{type:'boolean'}})},members:{type:'array',nullable:true,maxItems:2000,items:{$ref:'#/components/schemas/RoleHolder'}},history:{type:'array',nullable:true,maxItems:2000,items:{$ref:'#/components/schemas/AuditEvent'}}});
spec.components.schemas.RoleDetailsResponse=object({data:{$ref:'#/components/schemas/RoleDetails'},requestId:{type:'string'}});
extendOperation('getRole','getRoleDetails','/schools/{schoolId}/roles/{roleId}/details','role.read','RoleDetails',false,['SC14']);
// ADR-046: an assignment preview uses the same dated proposal and delegation
// policy as saving, without borrowing role.manage or caching obsolete authority.
Object.assign(spec.components.schemas.AssignmentCreate.properties,{expectedMemberVersion:{type:'integer',minimum:1},expectedClassVersion:{type:'integer',minimum:1}});
spec.components.schemas.StaffAssignmentPreview=object({memberId:uuid,memberVersion:{type:'integer',minimum:1},classId:uuid,classVersion:{type:'integer',minimum:1},kind:{type:'string',enum:['HOMEROOM','SUBJECT']},subjectId:{...uuid,nullable:true},scopeName:label,
  referenceDate:{type:'string',format:'date'},startsOn:{type:'string',format:'date'},endsOn:{type:'string',format:'date'},grantStartsAt:timestamp,grantEndsAt:timestamp,
  ...Object.fromEntries(['added','kept','notIncluded','warnings'].map(name=>[name,{type:'array',items:label}]))});
spec.components.schemas.StaffAssignmentPreviewResponse=object({data:{$ref:'#/components/schemas/StaffAssignmentPreview'},requestId:label});
extendOperation('createAssignment','previewStaffAssignment','/schools/{schoolId}/assignments/preview','assignment.manage','StaffAssignmentPreview',false,['SC14'],undefined,'AssignmentCreate');
const assignmentPreviewOp=spec.paths['/schools/{schoolId}/assignments/preview'].post;
assignmentPreviewOp['x-read-only']=true;
assignmentPreviewOp.responses['200']=assignmentPreviewOp.responses['201'];delete assignmentPreviewOp.responses['201'];
spec.components.schemas.StaffAssignmentCell=object({assignmentId:uuid,version:{type:'integer',minimum:1},memberId:uuid,name:label,memberStatus:structuredClone(spec.components.schemas.Member.properties.status),identityActive:{type:'boolean'},roleActive:{type:'boolean'},kind:{type:'string',enum:['HOMEROOM','SUBJECT']},subjectId:{...uuid,nullable:true},startsOn:{type:'string',format:'date'},endsOn:{type:'string',format:'date',nullable:true},grantStartsAt:timestamp,grantEndsAt:{...timestamp,nullable:true},accessActive:{type:'boolean'}});
const nullableMatrixRef=name=>({anyOf:[{$ref:'#/components/schemas/'+name},{type:'object',nullable:true,enum:[null]}]});
spec.components.schemas.StaffMatrixSubject=object({id:uuid,version:{type:'integer',minimum:1},createdAt:timestamp,updatedAt:timestamp,code:label,name:label,status:{type:'string',enum:['ACTIVE','ARCHIVED']},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'}});
spec.components.schemas.StaffAssignmentMatrixRow=object({classId:uuid,version:{type:'integer',minimum:1},className:label,status:structuredClone(spec.components.schemas.Class.properties.status),homeroom:nullableMatrixRef('StaffAssignmentCell'),bySubject:{type:'object',additionalProperties:nullableMatrixRef('StaffAssignmentCell')},conflicts:{type:'array',items:label}});
spec.components.schemas.StaffAssignmentMatrix=object({year:nullableMatrixRef('Year'),referenceDate:{type:'string',format:'date'},subjects:{type:'array',maxItems:200,items:{$ref:'#/components/schemas/StaffMatrixSubject'}},rows:{type:'array',maxItems:2000,items:{$ref:'#/components/schemas/StaffAssignmentMatrixRow'}},canAssign:{type:'boolean'},canViewMembers:{type:'boolean'}});
spec.components.schemas.StaffAssignmentMatrixResponse=object({data:{$ref:'#/components/schemas/StaffAssignmentMatrix'},requestId:label});
extendOperation('getMember','getStaffAssignmentMatrix','/schools/{schoolId}/assignment-matrix','assignment.read','StaffAssignmentMatrix',false,['SC12'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'yearId',in:'query',schema:uuid}]);
// ADR-049: native handover previews bind reviewed sources and durable actor-owned receipts.
const versionPositive={type:'integer',minimum:1},reviewHash={type:'string',pattern:'^[0-9a-f]{64}$'};
spec.components.schemas.HandoverChecklist=object(Object.fromEntries(['pendingConduct','openWeeks','pendingAdjustments','pendingEvidence','draftAnnouncements','activeLinks'].map(k=>[k,{type:'integer',minimum:0}])));
spec.components.schemas.HandoverCurrent=object({assignmentId:uuid,version:versionPositive,membershipId:uuid,memberVersion:versionPositive,name:label,memberStatus:structuredClone(spec.components.schemas.Member.properties.status),startsOn:{type:'string',format:'date'},endsOn:{type:'string',format:'date',nullable:true},accessActive:{type:'boolean'}});
spec.components.schemas.HandoverPreview=object({className:label,classVersion:versionPositive,referenceDate:{type:'string',format:'date'},effectiveOn:{type:'string',format:'date'},canHandover:{type:'boolean'},current:nullableMatrixRef('HandoverCurrent'),openItems:{$ref:'#/components/schemas/HandoverChecklist'},previewHash:{...reviewHash,nullable:true},toMemberVersion:{...versionPositive,nullable:true}});
spec.components.schemas.HandoverPreviewResponse=object({data:{$ref:'#/components/schemas/HandoverPreview'},requestId:label});
Object.assign(spec.components.schemas.Handover.properties,{checklist:nullableMatrixRef('HandoverChecklist'),previewHash:{...reviewHash,nullable:true},appliedAssignmentId:{...uuid,nullable:true},appliedAt:{...timestamp,nullable:true},clientRequestId:{...uuid,nullable:true},appliedAssignment:nullableMatrixRef('Assignment')});
spec.components.schemas.Handover.required.push('checklist','previewHash','appliedAssignmentId','appliedAt','clientRequestId');
Object.assign(spec.components.schemas.HandoverCreate.properties,{expectedFromAssignmentVersion:versionPositive,expectedClassVersion:versionPositive,expectedToMemberVersion:versionPositive,previewHash:reviewHash,clientRequestId:uuid});
const handoverApproveSchema=spec.paths['/schools/{schoolId}/handovers/{handoverId}/approve'].post.requestBody.content['application/json'].schema.$ref.split('/').at(-1);
spec.components.schemas.HandoverApprove=structuredClone(spec.components.schemas[handoverApproveSchema]);
spec.components.schemas.HandoverApprove.properties.previewHash=reviewHash;
spec.components.schemas.HandoverReview=object({expectedVersion:versionPositive,previewHash:reviewHash,expectedFromAssignmentVersion:versionPositive,expectedClassVersion:versionPositive,expectedToMemberVersion:versionPositive});
extendOperation('getClass','getHandoverPreview','/schools/{schoolId}/classes/{classId}/handover-preview','assignment.manage','HandoverPreview',false,['SC15'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'classId',in:'path',required:true,schema:uuid},{name:'effectiveOn',in:'query',schema:{type:'string',format:'date'}},{name:'toMemberId',in:'query',schema:uuid}]);
extendOperation('getClass','getHandover','/schools/{schoolId}/handovers/{handoverId}','assignment.manage','Handover',false,['SC15'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'handoverId',in:'path',required:true,schema:uuid}]);
extendOperation('getClass','getHandoverByRequest','/schools/{schoolId}/handovers/requests/{requestId}','assignment.manage','Handover',false,['SC15'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'requestId',in:'path',required:true,schema:uuid}]);
extendOperation('approveHandover','reviewHandover','/schools/{schoolId}/handovers/{handoverId}/review','assignment.manage','Handover',false,['SC15'],undefined,'HandoverReview');
spec.paths['/schools/{schoolId}/handovers/{handoverId}/approve'].post.requestBody.content['application/json'].schema={$ref:'#/components/schemas/HandoverApprove'};
// ADR-050: keep the existing student form atomic and persist actual nullable gender.
const studentGender={type:'string',enum:['Nam','Nữ',null],nullable:true};
for(const name of ['Student','StudentCreate','StudentPatch'])spec.components.schemas[name].properties.gender=structuredClone(studentGender);
spec.components.schemas.Student.required.push('gender');
spec.components.schemas.StudentCreate.required=spec.components.schemas.StudentCreate.required.filter(name=>name!=='studentCode');
spec.components.schemas.StudentInitialGuardian=object({...structuredClone(spec.components.schemas.GuardianCreate.properties),relationshipLabel:{type:'string',minLength:1,maxLength:100}},['fullName','relationshipLabel']);
spec.components.schemas.StudentCreate.properties.initialGuardian={$ref:'#/components/schemas/StudentInitialGuardian'};
Object.assign(spec.components.schemas.Student.properties,{initialEnrollment:{$ref:'#/components/schemas/Enrollment'},initialGuardian:{$ref:'#/components/schemas/Guardian'},initialRelationship:{$ref:'#/components/schemas/Relationship'},internalNote:{type:'string',maxLength:4000,nullable:true}});
spec.components.schemas.StudentPatch.properties.internalNote={type:'string',maxLength:4000,nullable:true};
spec.components.schemas.StudentDetail.properties.internalNote.nullable=true;
const mapping = JSON.parse(await fs.readFile(path.join(source, 'api/frontend-api-map.json'), 'utf8'));
const permissions = JSON.parse(await fs.readFile(path.join(source, 'api/permissions.json'), 'utf8'));
const roles = JSON.parse(await fs.readFile(path.join(source, 'api/role-templates.json'), 'utf8'));
permissions.push('publication.read', 'publication.withdraw');
permissions.push('import.read');
for (const role of roles.roles) {
  if (['HOMEROOM', 'SUBJECT_TEACHER'].includes(role.code)) role.actions.push('class.read');
  if (role.actions.includes('conduct.read')) role.actions.push('publication.read');
  if (role.code === 'SCHOOL_ADMIN' || role.code === 'SCHOOL_LEADERSHIP') role.actions.push('publication.withdraw');
}
const schemas = {};
// Existing report viewer: individual report, grade/week filters and explicit data source.
const reportSources={type:'string',enum:['LIVE_INTERNAL','PUBLISHED_SNAPSHOT']};
for(const name of ['ExportJob','ExportCreate'])spec.components.schemas[name].properties.reportType.enum.push('student');
Object.assign(spec.components.schemas.ExportCreate.properties,{gradeId:{type:'string',format:'uuid'},weekId:{type:'string',format:'uuid'},dataSource:reportSources,scope:{type:'string',enum:['SCHOOL','CLASS']}});
Object.assign(spec.components.schemas.ExportJob.properties,{classId:{type:'string',format:'uuid'},requestedBy:{type:'string',format:'uuid'},asOf:{type:'string',format:'date-time'},contentHash:{type:'string',pattern:'^[a-f0-9]{64}$'},lastErrorCode:{type:'string',maxLength:80}});
Object.assign(spec.components.schemas.Report.properties,{title:{type:'string'},schoolName:{type:'string'},yearName:{type:'string'},scopeLabel:{type:'string'},from:{type:'string',format:'date'},to:{type:'string',format:'date'},columns:{type:'array',items:{type:'object',properties:{key:{type:'string'},label:{type:'string'}},required:['key','label'],additionalProperties:false}},publicationIds:{type:'array',items:{type:'string',format:'uuid'}},notes:{type:'array',items:{type:'string'}}});
for(const id of ['getSchoolReport','getClassReport']){
  const op=Object.values(spec.paths).flatMap(p=>Object.values(p)).find(op=>op?.operationId===id);
  op.parameters.find(p=>p.name==='reportType').schema.enum.push('student');
  op.parameters.push({name:'dataSource',in:'query',schema:reportSources},{name:'gradeId',in:'query',schema:{type:'string',format:'uuid'}},{name:'weekId',in:'query',schema:{type:'string',format:'uuid'}});
}
for(const id of ['getExport','downloadExport']){
  const op=Object.values(spec.paths).flatMap(p=>Object.values(p)).find(op=>op?.operationId===id);
  op.responses['410']={description:'Bản xuất đã hết thời hạn tải.',content:{'application/problem+json':{schema:{$ref:'#/components/schemas/Error'}}}};
}
await SwaggerParser.validate(structuredClone(spec));
await fs.writeFile(path.join(root,'backend/api/openapi.yaml'),YAML.stringify(spec,{aliasDuplicateObjects:false}));
for (const [name, schema] of Object.entries(spec.components.schemas)) schemas[name] = schema;
const resolvedOperations = operations.map(op => {
  const actual = spec.paths[op.path.replace(/^\/api\/v1/, '')]?.[op.method.toLowerCase()]
    ?? spec.paths[op.path]?.[op.method.toLowerCase()];
  if (!actual || actual.operationId !== op.id) throw new Error(`Registry mismatch ${op.id}`);
  const request=actual.requestBody?.content?.['application/json']?.schema?.$ref?.split('/').at(-1)??op.request;
  return { ...op, request,readOnly:op.method==='GET'||actual['x-read-only']===true,parameters: actual.parameters ?? [], requestBody: actual.requestBody,
    responses: actual.responses };
});
await fs.mkdir(path.join(root, 'backend/src/generated'), { recursive: true });
await fs.writeFile(path.join(root, 'backend/src/generated/contract.json'), JSON.stringify({
  sha256: crypto.createHash('sha256').update(text).digest('hex'),
  schemas, operations: resolvedOperations, permissions, roles: roles.roles,
}, null, 2) + '\n');
const progress = {
  baseline: '14dfad5', operations: operations.map(op => ({ operationId: op.id,
    screenIds: op.frontend_ids, milestone: op.tag === 'Health' ? 'B0' : null,
    status: 'NOT_STARTED', evidence: [] })),
  screens: mapping.map(screen => ({ screenId: screen.screen_id,
    scope: screen.scope, operationIds: screen.api_operation_ids,
    staticReason: screen.no_business_api_reason,
    status: screen.api_operation_ids.length ? 'NOT_STARTED' : 'STATIC_UNVERIFIED', evidence: [] })),
};
const progressPath = path.join(root, 'docs/backend-progress.json');
try {
  const existing=JSON.parse(await fs.readFile(progressPath,'utf8'));
  for(const operation of progress.operations)if(!existing.operations.some(o=>o.operationId===operation.operationId))existing.operations.push(operation);
  for(const screen of existing.screens)for(const operation of progress.operations)if(operation.screenIds.includes(screen.screenId)&&!screen.operationIds.includes(operation.operationId))screen.operationIds.push(operation.operationId);
  await fs.writeFile(progressPath,JSON.stringify(existing,null,2)+'\n');
} catch(error) {if(error.code!=='ENOENT')throw error;await fs.writeFile(progressPath, JSON.stringify(progress, null, 2) + '\n');}
const rows = operations.map(op => `| ${op.id} | ${op.frontend_ids.join(', ')} | NOT_STARTED | |`).join('\n');
try { await fs.access(path.join(root, 'docs/backend-progress.md')); }
catch { await fs.writeFile(path.join(root, 'docs/backend-progress.md'),
  '# Backend operation and screen progress\n\nBaseline `14dfad5`. Runtime evidence is tracked in `backend-progress.json`.\n\n'
  + '| operationId | screenId | Status | Evidence |\n|---|---|---|---|\n' + rows + '\n'); }
console.log(`Validated ${operations.length} operations, ${Object.keys(schemas).length} schemas, ${mapping.length} screen mappings.`);
console.log(`ADR-001: normalized ${emptyRequiredFixed} empty required arrays; source handoff preserved.`);
