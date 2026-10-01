import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import {extendAnnouncementContract} from './announcement-contract.mjs';
import {extendPublicAnnouncementContract} from './public-announcement-contract.mjs';
import {extendConductRuleContract} from './conduct-rule-contract.mjs';

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
spec.components.schemas.GroupDutyAssignment={type:'object',properties:{id:{type:'string',format:'uuid'},groupId:{type:'string',format:'uuid'},dutyDate:{type:'string',format:'date'},task:{type:'string',minLength:3,maxLength:4000},status:{type:'string',enum:['ASSIGNED','DONE','CANCELLED']},enrollmentIds:{type:'array',minItems:1,maxItems:5000,uniqueItems:true,items:{type:'string',format:'uuid'}}},required:['groupId','dutyDate','task'],additionalProperties:false};
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
spec.components.schemas.StaffInvitationOptions=object({roles:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/MemberRoleChoice'}}});
spec.components.schemas.StaffInvitationOptionsResponse=object({data:{$ref:'#/components/schemas/StaffInvitationOptions'},requestId:label});
extendOperation('getMember','getStaffInvitationOptions','/schools/{schoolId}/staff-invitation-options','member.manage','StaffInvitationOptions',false,['SC10']);
spec.paths['/schools/{schoolId}/staff-invitation-options'].get.parameters=spec.paths['/schools/{schoolId}/staff-invitation-options'].get.parameters.filter(p=>p.name==='schoolId');
spec.components.schemas.MemberAssignmentDetails=object({id:uuid,version:{type:'integer',minimum:1},classId:uuid,className:label,yearName:label,memberId:uuid,roleGrantId:uuid,
  kind:{type:'string',enum:['HOMEROOM','SUBJECT']},subjectId:{...uuid,nullable:true},subjectName:{type:'string',nullable:true},startsOn:{type:'string',format:'date'},endsOn:{type:'string',format:'date',nullable:true},revokedAt:{...timestamp,nullable:true},
  grantValidFrom:timestamp,grantValidUntil:{...timestamp,nullable:true},grantRevokedAt:{...timestamp,nullable:true},roleLabel:label,roleStatus:{type:'string',enum:['ACTIVE','ARCHIVED']},createdAt:timestamp,createdBy:{...uuid,nullable:true},createdByName:{type:'string',nullable:true},live:{type:'boolean'}});
spec.components.schemas.MemberDetails=object({member:{$ref:'#/components/schemas/Member'},referenceDate:{type:'string',format:'date'},joinedOn:{type:'string',format:'date',nullable:true},accessActive:{type:'boolean'},otherSchools:count,
  assignments:{type:'array',maxItems:2000,nullable:true,items:{$ref:'#/components/schemas/MemberAssignmentDetails'}},roleChoices:{type:'array',maxItems:1000,nullable:true,items:{$ref:'#/components/schemas/MemberRoleChoice'}},
  canAssign:{type:'boolean'},canSuspend:{type:'boolean'},canRole:{type:'boolean'},canViewHistory:{type:'boolean'},isSelf:{type:'boolean'}});
spec.components.schemas.MemberDetailsResponse=object({data:{$ref:'#/components/schemas/MemberDetails'},requestId:label});
extendOperation('getMember','getMemberDetails','/schools/{schoolId}/members/{memberId}/details','member.read','MemberDetails',false,['SC11']);
extendOperation('listSchoolAudit','listMemberHistory','/schools/{schoolId}/members/{memberId}/history','member.read+audit.read','AuditEvent',true,['SC11']);
extendOperation('listSchoolAudit','listStaffActivity','/schools/{schoolId}/staff-activity','audit.read','AuditEvent',true,['SC10','SC15']);
spec.paths['/schools/{schoolId}/staff-activity'].get.parameters=spec.paths['/schools/{schoolId}/staff-activity'].get.parameters.filter(p=>p.in==='path'||['limit','cursor','sort','dir','action'].includes(p.name));
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
// ADR-051: SQL directory and explicit historical/current student projections.
const studentDate={type:'string',format:'date'},studentNullableDate={...studentDate,nullable:true},nullableLabel={type:'string',nullable:true};
// Native parent shell metadata: no child date of birth, personal contacts or bearer material.
Object.assign(spec.components.schemas.ParentContext.properties,{today:studentDate,year:object({label,startsOn:studentDate,endsOn:studentDate}),relationshipLabel:label,linkExpiresAt:timestamp,lastPublishedAt:{...timestamp,nullable:true}});
Object.assign(spec.components.schemas.ParentContext.properties.school.properties,{shortName:nullableLabel,motto:nullableLabel,publicContactEmail:nullableLabel,publicAddress:nullableLabel});
// Native PA03 uses actual published sessions and a scope-limited academic calendar.
spec.components.schemas.ParentAttendanceMonth=object({granularity:{type:'string',enum:['DAILY']},month:{type:'string',pattern:'^\\d{4}-(0[1-9]|1[0-2])$'},yearStart:{type:'string'},yearEnd:{type:'string'},today:studentDate,
 days:{type:'array',maxItems:31,items:object({date:studentDate,weekday:{type:'integer',minimum:1,maximum:7},holidayNames:{type:'array',items:label},sessions:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/ParentAttendance'}},status:{type:'string',enum:['unmarked','present','late','excused','unexcused','mixed','future','holiday','not_published']}})},
 totals:object(Object.fromEntries(['present','late','excused','unexcused','unmarked','published','marked'].map(name=>[name,{type:'integer',minimum:0}])))});
spec.components.schemas.ParentAttendanceMonthResponse=object({data:{$ref:'#/components/schemas/ParentAttendanceMonth'},requestId:label});
extendOperation('getParentContext','getParentAttendanceMonth','/parent/{schoolSlug}/attendance-month','parent.attendance','ParentAttendanceMonth',false,['PA03'],[{name:'schoolSlug',in:'path',required:true,schema:{type:'string',pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'}},{name:'month',in:'query',required:true,schema:{type:'string',pattern:'^\\d{4}-(0[1-9]|1[0-2])$'}}]);
const parentMonthOperation=operations.find(value=>value.id==='getParentAttendanceMonth');parentMonthOperation.scope='parent';parentMonthOperation.description='Actual published DAILY attendance sessions and holiday labels for only the current parent child/year/module; missing days never infer attendance.';
spec.paths['/parent/{schoolSlug}/attendance-month'].get.description=parentMonthOperation.description;
extendOperation('previewParent','previewParentAttendanceMonth','/schools/{schoolId}/parent-access/{accessId}/preview/attendance-month','parent_access.preview','ParentAttendanceMonth',false,['SC25','PA03'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'accessId',in:'path',required:true,schema:uuid},{name:'month',in:'query',required:true,schema:{type:'string',pattern:'^\\d{4}-(0[1-9]|1[0-2])$'}}]);
spec.paths['/schools/{schoolId}/parent-access/{accessId}/preview/attendance-month'].get.description='Internal staff preview of the same published child/year attendance month; requires independent current preview authority and never changes parent cookies.';


// PA13 minimal complete directory and independently authorized private binary reads.
spec.components.schemas.ParentDocumentEntry=object({...structuredClone(spec.components.schemas.ParentDocument.properties),id:{type:'string',format:'uuid'},viewAllowed:{type:'boolean'}});
spec.components.schemas.ParentDocumentReport=object({periodId:uuid,title:{type:'string',minLength:1,maxLength:300},publishedAt:timestamp,total:structuredClone(spec.components.schemas.ParentConduct.properties.finalPoints),grade:{type:'string',nullable:true},revision:{type:'integer',minimum:1}});
spec.components.schemas.ParentDocumentDirectory=object({files:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/ParentDocumentEntry'}},reports:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/ParentDocumentReport'}}});
for(const name of ['ParentDocumentEntry','ParentDocumentDirectory'])spec.components.schemas[name+'Response']=object({data:{$ref:'#/components/schemas/'+name},requestId:label});
for(const [id,suffix,response,binary] of [['getParentDocumentDirectory','document-directory','ParentDocumentDirectory',false],['getParentDocument','documents/{documentId}','ParentDocumentEntry',false],['viewParentDocument','documents/{documentId}/view','BinaryFile',true]]){
 const params=[{name:'schoolSlug',in:'path',required:true,schema:{type:'string',pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'}},...(suffix.includes('{documentId}')?[{name:'documentId',in:'path',required:true,schema:uuid}]:[])];
 extendOperation(binary?'downloadParentDocument':'getParentContext',id,'/parent/{schoolSlug}/'+suffix,'parent.documents',response,false,['PA13','PA09','PA11'],params);
 operations.find(value=>value.id===id).scope='parent';
 spec.paths['/parent/{schoolSlug}/'+suffix].get.description='Own-child/year current published document metadata or safe private view, independently of download permission. No storage URL or raw file ID.';
}
for(const [id,suffix,response,binary] of [['previewParentDocumentDirectory','document-directory','ParentDocumentDirectory',false],['previewParentDocument','documents/{documentId}','ParentDocumentEntry',false],['previewParentDocumentView','documents/{documentId}/view','BinaryFile',true],['previewParentDocumentDownload','documents/{documentId}/download','BinaryFile',true]]){
 const params=[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'accessId',in:'path',required:true,schema:uuid},...(suffix.includes('{documentId}')?[{name:'documentId',in:'path',required:true,schema:uuid}]:[])];
 extendOperation('previewParent',id,'/schools/{schoolId}/parent-access/{accessId}/preview/'+suffix,'parent_access.preview',response,false,['SC25','PA13'],params);
 if(binary)spec.paths['/schools/{schoolId}/parent-access/{accessId}/preview/'+suffix].get.responses['200']=structuredClone(spec.paths['/parent/{schoolSlug}/documents/{documentId}/download'].get.responses['200']);
 spec.paths['/schools/{schoolId}/parent-access/{accessId}/preview/'+suffix].get.description='Independent current staff preview authority, same published document and view/download rights without changing parent cookies.';
}

// Native PA08-PA11 use pinned publication metadata and independent document capabilities.
const parentDocumentEntries={type:'array',maxItems:1000,items:{$ref:'#/components/schemas/ParentDocumentEntry'}};
spec.components.schemas.ParentSharedActivity=object({...structuredClone(spec.components.schemas.ParentActivity.properties),id:{type:'string',format:'uuid'},description:{...structuredClone(spec.components.schemas.ParentActivity.properties.description),nullable:true},publicReviewNote:{...structuredClone(spec.components.schemas.ParentActivity.properties.publicReviewNote),nullable:true},documents:parentDocumentEntries,activityStatus:{type:'string',enum:['ASSIGNED','CLOSED',null],nullable:true},illustration:{type:'string',enum:['trophy','stem','clean','book','heart',null],nullable:true},updatedAt:{...timestamp,nullable:true},timezone:{type:'string',minLength:1,maxLength:100},dueOn:studentDate});
spec.components.schemas.ParentSharedAnnouncement=object({...structuredClone(spec.components.schemas.ParentAnnouncement.properties),id:{type:'string',format:'uuid'},documents:parentDocumentEntries,summary:{type:'string',maxLength:4000,nullable:true},scopeKinds:{type:'array',maxItems:5,uniqueItems:true,items:{type:'string',enum:['PUBLIC','SCHOOL','GRADE','CLASS','STUDENT']}}});
for(const [section,singular,response,screens]of [['activities','activity','ParentSharedActivity',['PA08','PA09']],['announcements','announcement','ParentSharedAnnouncement',['PA10','PA11']]]){
 const directory=response+'Directory';spec.components.schemas[directory]=object({items:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/'+response}}});
 for(const name of [response,directory])spec.components.schemas[name+'Response']=object({data:{$ref:'#/components/schemas/'+name},requestId:label});
 const upper=singular[0].toUpperCase()+singular.slice(1);
 for(const detail of [false,true]){
  const suffix=detail?section+'/{'+singular+'Id}/published':section+'/published',publicId=detail?'getParentPublished'+upper:'getParentPublished'+upper+'Directory',previewId=detail?'previewParentPublished'+upper:'previewParentPublished'+upper+'Directory';
  const params=[{name:'schoolSlug',in:'path',required:true,schema:{type:'string',pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'}},...(detail?[{name:singular+'Id',in:'path',required:true,schema:uuid}]:[])];
  extendOperation('getParentContext',publicId,'/parent/{schoolSlug}/'+suffix,'parent.'+section,detail?response:directory,false,screens,params);operations.find(value=>value.id===publicId).scope='parent';
  spec.paths['/parent/{schoolSlug}/'+suffix].get.description='Only own-child/year current published content and pinned display metadata; documents keep their independent current module and download rights.';
  extendOperation('previewParent',previewId,'/schools/{schoolId}/parent-access/{accessId}/preview/'+suffix,'parent_access.preview',detail?response:directory,false,['SC25',...screens],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'accessId',in:'path',required:true,schema:uuid},...(detail?[{name:singular+'Id',in:'path',required:true,schema:uuid}]:[])]);
  spec.paths['/schools/{schoolId}/parent-access/{accessId}/preview/'+suffix].get.description='Independent current staff preview authority; same published serializer, no cookie change, raw sources, roster or recipient IDs.';
 }
}

// PA04/PA05 minimal pinned conduct display and published own-child history.
const conductDecimal=structuredClone(spec.components.schemas.ParentConduct.properties.finalPoints),nullableConductDecimal={...conductDecimal,nullable:true};
spec.components.schemas.ConductPublicationDisplay=object({weekNumber:{type:'integer',minimum:1},startsOn:studentDate,endsOn:studentDate,classLabel:label,ruleSetName:label,ruleSetRevision:{type:'integer',minimum:1},minimumPoints:nullableConductDecimal,maximumPoints:nullableConductDecimal,timezone:label});
spec.components.schemas.PublicationDetail.properties.conductDisplay={$ref:'#/components/schemas/ConductPublicationDisplay'};
spec.components.schemas.ParentPublishedPointLine=object({...structuredClone(spec.components.schemas.PointLine.properties),date:studentDate});
spec.components.schemas.ParentConductRevision=object({revision:{type:'integer',minimum:1},publishedAt:timestamp,total:conductDecimal,classification:nullableLabel,current:{type:'boolean'}});
spec.components.schemas.ParentSharedConduct=object({...structuredClone(spec.components.schemas.ParentConduct.properties),periodId:{type:'string',format:'uuid'},lines:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/ParentPublishedPointLine'}},weekNumber:{type:'integer',minimum:1,nullable:true},startsOn:{...studentDate,nullable:true},endsOn:{...studentDate,nullable:true},classLabel:nullableLabel,ruleSetName:nullableLabel,ruleSetRevision:{type:'integer',minimum:1,nullable:true},minimumPoints:nullableConductDecimal,maximumPoints:nullableConductDecimal,timezone:label,history:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/ParentConductRevision'}}});
spec.components.schemas.ParentSharedConductDirectory=object({items:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/ParentSharedConduct'}}});
for(const name of ['ParentSharedConduct','ParentSharedConductDirectory'])spec.components.schemas[name+'Response']=object({data:{$ref:'#/components/schemas/'+name},requestId:label});
for(const detail of [false,true]){
 const suffix=detail?'conduct/{periodId}/published':'conduct/published',response=detail?'ParentSharedConduct':'ParentSharedConductDirectory',publicId=detail?'getParentPublishedConduct':'getParentPublishedConductDirectory',previewId=detail?'previewParentPublishedConduct':'previewParentPublishedConductDirectory';
 extendOperation('getParentContext',publicId,'/parent/{schoolSlug}/'+suffix,'parent.conduct',response,false,['PA04','PA05'],[{name:'schoolSlug',in:'path',required:true,schema:{type:'string',pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'}},...(detail?[{name:'periodId',in:'path',required:true,schema:uuid}]:[])]);operations.find(value=>value.id===publicId).scope='parent';
 extendOperation('previewParent',previewId,'/schools/{schoolId}/parent-access/{accessId}/preview/'+suffix,'parent_access.preview',response,false,['SC25','PA04','PA05'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'accessId',in:'path',required:true,schema:uuid},...(detail?[{name:'periodId',in:'path',required:true,schema:uuid}]:[])]);
}

// Native PA06 reads published lesson metadata and calendar within its independent section.
spec.components.schemas.ParentTimetableWeekLesson=object({date:studentDate,startsAt:timestamp,endsAt:timestamp,startsAtLocal:{type:'string',pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'},endsAtLocal:{type:'string',pattern:'^([01]\\d|2[0-3]):[0-5]\\d$'},periodNumber:{type:'integer',minimum:1,nullable:true},subjectName:label,teacherName:label,roomName:nullableLabel,status:{type:'string',enum:['SCHEDULED','CANCELLED']},changeNote:nullableLabel});
spec.components.schemas.ParentTimetableWeekDay=object({date:studentDate,holidayNames:{type:'array',items:label},lessons:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/ParentTimetableWeekLesson'}}});
spec.components.schemas.ParentTimetableWeek=object({weekStart:studentDate,today:studentDate,timezone:{type:'string',minLength:1,maxLength:100},year:object({startsOn:studentDate,endsOn:studentDate}),weekNumber:{type:'integer',minimum:1,nullable:true},days:{type:'array',minItems:1,maxItems:7,items:{$ref:'#/components/schemas/ParentTimetableWeekDay'}}});
spec.components.schemas.ParentTimetableWeekResponse=object({data:{$ref:'#/components/schemas/ParentTimetableWeek'},requestId:label});
extendOperation('getParentContext','getParentTimetableWeek','/parent/{schoolSlug}/timetable-week','parent.timetable','ParentTimetableWeek',false,['PA06'],[{name:'schoolSlug',in:'path',required:true,schema:{type:'string',pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'}},{name:'week',in:'query',required:true,schema:studentDate}]);
operations.find(value=>value.id==='getParentTimetableWeek').scope='parent';
spec.paths['/parent/{schoolSlug}/timetable-week'].get.description='Only own-child/year published lessons in a bounded academic week, with period metadata pinned by the publication, actual school timezone and published scoped holiday labels. No raw source IDs or inferred lessons.';
extendOperation('previewParent','previewParentTimetableWeek','/schools/{schoolId}/parent-access/{accessId}/preview/timetable-week','parent_access.preview','ParentTimetableWeek',false,['SC25','PA06'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'accessId',in:'path',required:true,schema:uuid},{name:'week',in:'query',required:true,schema:studentDate}]);
spec.paths['/schools/{schoolId}/parent-access/{accessId}/preview/timetable-week'].get.description='Independent current staff preview authority; same published child/year weekly timetable without changing parent cookies.';

// Native PA12 returns no internal staff identifiers or identity contacts.
spec.components.schemas.ParentTeacherDirectoryEntry=object({kind:{type:'string',enum:['HOMEROOM','SUBJECT']},displayName:label,subjectName:nullableLabel,workEmail:nullableLabel,workPhone:nullableLabel,weekdays:{type:'array',maxItems:7,uniqueItems:true,items:{type:'integer',minimum:1,maximum:7}}});
spec.components.schemas.ParentTeacherDirectory=object({today:studentDate,classLabel:nullableLabel,contactHours:nullableLabel,teachers:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/ParentTeacherDirectoryEntry'}}});
spec.components.schemas.ParentTeacherDirectoryResponse=object({data:{$ref:'#/components/schemas/ParentTeacherDirectory'},requestId:label});
extendOperation('getParentContext','getParentTeacherDirectory','/parent/{schoolSlug}/teacher-directory','parent.teachers','ParentTeacherDirectory',false,['PA12'],[{name:'schoolSlug',in:'path',required:true,schema:{type:'string',pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'}}]);
operations.find(value=>value.id==='getParentTeacherDirectory').scope='parent';
spec.paths['/parent/{schoolSlug}/teacher-directory'].get.description='Only current own-child/year class assignments, permitted work contacts and weekdays from the current published timetable; no identity contacts or raw staff identifiers.';
extendOperation('previewParent','previewParentTeacherDirectory','/schools/{schoolId}/parent-access/{accessId}/preview/teacher-directory','parent_access.preview','ParentTeacherDirectory',false,['SC25','PA12'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'accessId',in:'path',required:true,schema:uuid}]);
spec.paths['/schools/{schoolId}/parent-access/{accessId}/preview/teacher-directory'].get.description='Current independent staff preview authority; same permitted teacher serializer without changing parent cookies.';

// PA07 keeps concrete child targets and reads the complete dated publication schedule.
spec.components.schemas.ParentDutySchedule=object({today:studentDate,year:object({startsOn:studentDate,endsOn:studentDate}),items:{type:'array',maxItems:5000,items:{$ref:'#/components/schemas/ParentDuty'}}});
spec.components.schemas.ParentDutyScheduleResponse=object({data:{$ref:'#/components/schemas/ParentDutySchedule'},requestId:label});
spec.components.schemas.ParentDuty.properties.status={type:'string',enum:['ASSIGNED','DONE','CANCELLED']};
extendOperation('getParentContext','getParentDutySchedule','/parent/{schoolSlug}/duty-schedule','parent.duties','ParentDutySchedule',false,['PA07'],[{name:'schoolSlug',in:'path',required:true,schema:{type:'string',pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'}}]);
operations.find(value=>value.id==='getParentDutySchedule').scope='parent';
spec.paths['/parent/{schoolSlug}/duty-schedule'].get.description='Complete bounded own-child/year published duties, fixed at publication and restricted to the enrollment class on each date. No group roster or internal identifiers.';
extendOperation('previewParent','previewParentDutySchedule','/schools/{schoolId}/parent-access/{accessId}/preview/duty-schedule','parent_access.preview','ParentDutySchedule',false,['SC25','PA07'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'accessId',in:'path',required:true,schema:uuid}]);
spec.paths['/schools/{schoolId}/parent-access/{accessId}/preview/duty-schedule'].get.description='Independent current staff preview authority; same bounded child duty schedule without changing parent cookies.';




// SC25 context-only preview avoids fetching unused legacy overview panels.
extendOperation('previewParent','getParentAccessPreviewContext','/schools/{schoolId}/parent-access/{accessId}/preview/context','parent_access.preview','ParentContext',false,['SC25'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'accessId',in:'path',required:true,schema:uuid}]);
spec.paths['/schools/{schoolId}/parent-access/{accessId}/preview/context'].get.description='Independent current staff preview authority; only the own child/year safe context and current link capabilities, no overview panels, bearer token or parent cookie adoption.';
operations.find(operation=>operation.id==='getParentAccessPreviewContext').description=spec.paths['/schools/{schoolId}/parent-access/{accessId}/preview/context'].get.description;

// PA02 reads a bounded, independently section-gated published composite snapshot.
const overviewWeekTotals=object(Object.fromEntries(['present','late','excused','unexcused','unmarked','published','marked'].map(key=>[key,{type:'integer',minimum:0,maximum:1000}])));
spec.components.schemas.ParentOverviewAttendanceWeek=object({granularity:{type:'string',enum:['DAILY']},weekStart:studentDate,startsOn:studentDate,endsOn:studentDate,totals:overviewWeekTotals,records:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/ParentAttendance'}}});
const nullableOverview=name=>({...structuredClone(spec.components.schemas[name]),nullable:true});
const overviewDuties=nullableOverview('ParentDutySchedule');overviewDuties.properties.items.maxItems=2;
const overviewActivities=nullableOverview('ParentSharedActivityDirectory');overviewActivities.properties.items.maxItems=3;
const overviewAnnouncements=nullableOverview('ParentSharedAnnouncementDirectory');overviewAnnouncements.properties.items.maxItems=3;
spec.components.schemas.ParentPublishedOverview=object({today:studentDate,year:object({startsOn:studentDate,endsOn:studentDate}),asOf:timestamp,
 teachers:nullableOverview('ParentTeacherDirectory'),attendanceWeek:nullableOverview('ParentOverviewAttendanceWeek'),conduct:nullableOverview('ParentSharedConduct'),
 timetable:nullableOverview('ParentTimetableWeek'),duties:overviewDuties,activities:overviewActivities,announcements:overviewAnnouncements});
spec.components.schemas.ParentPublishedOverviewResponse=object({data:{$ref:'#/components/schemas/ParentPublishedOverview'},requestId:label});
extendOperation('getParentContext','getParentPublishedOverview','/parent/{schoolSlug}/overview/published','parent.overview','ParentPublishedOverview',false,['PA02'],[{name:'schoolSlug',in:'path',required:true,schema:{type:'string',pattern:'^[a-z0-9]+(?:-[a-z0-9]+)*$'}}]);
operations.find(value=>value.id==='getParentPublishedOverview').scope='parent';
extendOperation('previewParent','previewParentPublishedOverview','/schools/{schoolId}/parent-access/{accessId}/preview/overview/published','parent_access.preview','ParentPublishedOverview',false,['SC25','PA02'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'accessId',in:'path',required:true,schema:uuid}]);

spec.components.schemas.StudentYear=object({id:uuid,version:versionPositive,name:label,status:structuredClone(spec.components.schemas.Year.properties.status),startsOn:studentDate,endsOn:studentDate});
spec.components.schemas.StudentDirectoryClass=object({id:uuid,version:versionPositive,yearId:uuid,name:label,status:structuredClone(spec.components.schemas.Class.properties.status)});
spec.components.schemas.StudentDirectoryRow=object({id:uuid,version:versionPositive,createdAt:timestamp,updatedAt:timestamp,studentCode:label,fullName:label,dateOfBirth:studentNullableDate,gender:studentGender,status:structuredClone(spec.components.schemas.Student.properties.status),
 enrollmentId:uuid,enrollmentVersion:versionPositive,classId:uuid,className:label,yearId:uuid,yearName:label,enrollmentInEffect:{type:'boolean'},guardianCount:{...count,nullable:true},verifiedGuardians:{...count,nullable:true},activeLinks:{...count,nullable:true}});
spec.components.schemas.StudentDirectoryId=object({id:uuid});
for(const name of ['StudentDirectoryRow','StudentDirectoryId'])spec.components.schemas[name+'Page']=object({data:{type:'array',items:{$ref:'#/components/schemas/'+name}},page:{$ref:'#/components/schemas/PageInfo'},requestId:label});
spec.components.schemas.StudentDirectorySummary=object({year:nullableMatrixRef('StudentYear'),referenceDate:studentNullableDate,today:studentDate,years:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/StudentYear'}},classes:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/StudentDirectoryClass'}},
 kpi:object({students:count,studying:count,unverified:{...count,nullable:true},activeLinks:{...count,nullable:true}}),canSeeGuardians:{type:'boolean'},canSeeLinks:{type:'boolean'},canCreate:{type:'boolean'},canTransfer:{type:'boolean'},canExport:{type:'boolean'}});
spec.components.schemas.StudentDirectorySummaryResponse=object({data:{$ref:'#/components/schemas/StudentDirectorySummary'},requestId:label});
const studentListParams=[{name:'schoolId',in:'path',required:true,schema:uuid},...['yearId','classId'].map(name=>({name,in:'query',schema:uuid})),{name:'status',in:'query',schema:structuredClone(spec.components.schemas.Student.properties.status)},
 {name:'guardian',in:'query',schema:{type:'string',enum:['unverified']}},{name:'q',in:'query',schema:{type:'string',maxLength:200}},{name:'sort',in:'query',schema:{type:'string',enum:['fullName','studentCode','className']}},{name:'dir',in:'query',schema:{type:'string',enum:['asc','desc']}},
 {name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100}},{name:'cursor',in:'query',schema:{type:'string',maxLength:4000}}];
extendOperation('listStudents','listStudentDirectory','/schools/{schoolId}/student-directory','student.read','StudentDirectoryRow',true,['SC16'],studentListParams);
extendOperation('listStudents','listStudentDirectoryIds','/schools/{schoolId}/student-directory/ids','student.read','StudentDirectoryId',true,['SC16'],structuredClone(studentListParams));
extendOperation('getStudent','getStudentDirectorySummary','/schools/{schoolId}/student-directory-summary','student.read','StudentDirectorySummary',false,['SC16'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'yearId',in:'query',schema:uuid}]);
spec.components.schemas.StudentCreateClassChoice=object({id:uuid,version:{type:'integer',minimum:1},name:label,status:{type:'string',enum:['DRAFT','ACTIVE']},yearId:uuid,yearName:label,yearStartsOn:studentDate,yearEndsOn:studentDate,canAddGuardian:{type:'boolean'}});
spec.components.schemas.StudentCreateOptions=object({today:studentDate,classes:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/StudentCreateClassChoice'}}});
spec.components.schemas.StudentCreateOptionsResponse=object({data:{$ref:'#/components/schemas/StudentCreateOptions'},requestId:label});
extendOperation('getStudent','getStudentCreateOptions','/schools/{schoolId}/student-create-options','student.manage','StudentCreateOptions',false,['SC17'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'yearId',in:'query',schema:uuid}]);
// Native parent-link issuance: purpose readers and frozen, version-reviewed commands.
spec.components.schemas.Error.properties.resultId=uuid;
spec.components.schemas.ParentIssueYear=object({id:uuid,version:versionPositive,name:label,startsOn:studentDate,endsOn:studentDate,lastDay:studentDate,suggestedExpiryOn:studentDate});
spec.components.schemas.ParentIssueContext=object({schoolId:uuid,schoolVersion:versionPositive,schoolName:label,schoolSlug:label,timezone:label,today:studentDate,ttlDays:{type:'integer',minimum:1,maximum:90},
 defaultSections:structuredClone(spec.components.schemas.ParentAccess.properties.allowedSections),year:nullableMatrixRef('ParentIssueYear')});
spec.components.schemas.ParentIssueStudentChoice=object({id:uuid,version:versionPositive,fullName:label,studentCode:label,classId:uuid,className:label});
spec.components.schemas.ParentIssueRelationship=object({id:uuid,version:versionPositive,guardianId:uuid,guardianVersion:versionPositive,guardianName:label,relationshipLabel:label,status:{type:'string',enum:['UNVERIFIED','VERIFIED','REVOKED']},isPrimary:{type:'boolean'},canReceiveInfo:{type:'boolean'},canIssue:{type:'boolean'},activeLinkIds:{type:'array',items:uuid}});
spec.components.schemas.ParentIssueSource=object({context:{$ref:'#/components/schemas/ParentIssueContext'},student:object({id:uuid,version:versionPositive,fullName:label,studentCode:label,status:structuredClone(spec.components.schemas.Student.properties.status)}),
 enrollment:object({id:uuid,version:versionPositive,inEffect:{type:'boolean'}}),class:object({id:uuid,version:versionPositive,name:label}),relationships:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/ParentIssueRelationship'}}});
spec.components.schemas.ParentIssueReview=object({schoolVersion:versionPositive,yearVersion:versionPositive,studentVersion:versionPositive,enrollmentId:uuid,enrollmentVersion:versionPositive,classVersion:versionPositive,relationshipVersion:versionPositive,guardianVersion:versionPositive});
spec.components.schemas.ParentAccessReviewedCreate=object({studentId:uuid,yearId:uuid,relationshipId:uuid,reviewedSource:{$ref:'#/components/schemas/ParentIssueReview'},allowedSections:structuredClone(spec.components.schemas.ParentAccessCreate.properties.allowedSections),allowDownload:{type:'boolean'},expiresOn:studentDate,
 replace:object({accessId:uuid,expectedVersion:versionPositive}),reason:{type:'string',minLength:3,maxLength:2000}},['studentId','yearId','relationshipId','reviewedSource','allowedSections','allowDownload','expiresOn']);
for(const name of ['ParentIssueContext','ParentIssueSource'])spec.components.schemas[name+'Response']=object({data:{$ref:'#/components/schemas/'+name},requestId:label});
spec.components.schemas.ParentIssueStudentChoicePage=object({data:{type:'array',items:{$ref:'#/components/schemas/ParentIssueStudentChoice'}},page:{$ref:'#/components/schemas/PageInfo'},requestId:label});
const parentIssueParams=[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'yearId',in:'query',schema:uuid}];
extendOperation('getParentAccess','getParentAccessIssueContext','/schools/{schoolId}/parent-access/issue-context','parent_access.issue','ParentIssueContext',false,['SC18','SC22','SC23','SC24'],structuredClone(parentIssueParams));
extendOperation('listParentAccess','listParentAccessIssueStudents','/schools/{schoolId}/parent-access/issue-students','parent_access.issue','ParentIssueStudentChoice',true,['SC18','SC22','SC23','SC24'],[...structuredClone(parentIssueParams),
 {name:'q',in:'query',schema:{type:'string',maxLength:200}},{name:'sort',in:'query',schema:{type:'string',enum:['fullName','studentCode']}},{name:'dir',in:'query',schema:{type:'string',enum:['asc','desc']}},{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100}},{name:'cursor',in:'query',schema:{type:'string',maxLength:4000}}]);
extendOperation('getParentAccess','getStudentParentAccessIssueSource','/schools/{schoolId}/students/{studentId}/parent-access-issue-source','parent_access.issue','ParentIssueSource',false,['SC18','SC22','SC23','SC24'],[...structuredClone(parentIssueParams),{name:'studentId',in:'path',required:true,schema:uuid}]);
extendOperation('issueParentAccess','issueReviewedParentAccess','/schools/{schoolId}/parent-access/reviewed-issue','parent_access.issue','ParentAccessIssued',false,['SC18','SC22','SC23','SC24'],undefined,'ParentAccessReviewedCreate');
for(const id of ['getParentAccessIssueContext','listParentAccessIssueStudents','getStudentParentAccessIssueSource','issueReviewedParentAccess']){
 const generated=operations.find(op=>op.id===id),operation=spec.paths[generated.path.replace(/^\/api\/v1/,'')][generated.method.toLowerCase()];
 operation.description=generated.description='Parent-link issuance under current school/class/time authority. Readers contain minimal pupil and recipient metadata, no contact details or bearer token; commands verify the reviewed source and rotate atomically.';
}
spec.components.schemas.ParentAccess.properties.revokeReason=nullableLabel;
spec.components.schemas.ParentStaffAccessRow=object({id:uuid,version:versionPositive,createdAt:timestamp,updatedAt:timestamp,studentId:uuid,studentVersion:versionPositive,studentName:label,studentCode:label,studentStatus:structuredClone(spec.components.schemas.Student.properties.status),
 yearId:uuid,yearName:label,yearStatus:structuredClone(spec.components.schemas.Year.properties.status),classId:uuid,classVersion:versionPositive,className:label,enrollmentInEffect:{type:'boolean'},relationshipId:uuid,relationshipVersion:versionPositive,relationshipLabel:label,relationshipStatus:structuredClone(spec.components.schemas.Relationship.properties.status),canReceiveInfo:{type:'boolean'},relationshipRevokedAt:{...timestamp,nullable:true},
 guardianId:uuid,guardianVersion:versionPositive,guardianName:label,allowedSections:structuredClone(spec.components.schemas.ParentAccess.properties.allowedSections),allowDownload:{type:'boolean'},expiresAt:timestamp,revokedAt:{...timestamp,nullable:true},revokeReason:nullableLabel,issuedBy:uuid,issuedByName:nullableLabel,status:{type:'string',enum:['ACTIVE','EXPIRED','REVOKED']},opens:count,lastOpenedAt:{...timestamp,nullable:true},canIssue:{type:'boolean'},canRevoke:{type:'boolean'},canPreview:{type:'boolean'}});
spec.components.schemas.ParentStaffAccessRowPage=object({data:{type:'array',items:{$ref:'#/components/schemas/ParentStaffAccessRow'}},page:{$ref:'#/components/schemas/PageInfo'},requestId:label});
spec.components.schemas.ParentStaffAccessSummary=object({today:studentDate,kpi:object({total:count,active:count,expired:count,revoked:count}),canIssue:{type:'boolean'},classes:{type:'array',maxItems:1000,items:object({id:uuid,version:versionPositive,name:label,yearId:uuid,yearName:label})}});
spec.components.schemas.ParentStaffAccessDetails=object({access:{$ref:'#/components/schemas/ParentStaffAccessRow'},today:studentDate,canViewContact:{type:'boolean'},phoneMasked:nullableLabel,revokedByName:nullableLabel,replacedById:{...uuid,nullable:true},siblings:object({items:{type:'array',maxItems:20,items:object({id:uuid,status:{type:'string',enum:['ACTIVE','EXPIRED','REVOKED']},guardianName:label,relationshipLabel:label})},hasMore:{type:'boolean'},total:count})});
for(const name of ['ParentStaffAccessSummary','ParentStaffAccessDetails'])spec.components.schemas[name+'Response']=object({data:{$ref:'#/components/schemas/'+name},requestId:label});
extendOperation('listParentAccess','listParentAccessDirectory','/schools/{schoolId}/parent-access-directory','parent_access.manage','ParentStaffAccessRow',true,['SC23'],[{name:'schoolId',in:'path',required:true,schema:uuid},
 ...['studentId','yearId','classId'].map(name=>({name,in:'query',schema:uuid})),{name:'status',in:'query',schema:{type:'string',enum:['ACTIVE','EXPIRED','REVOKED']}},{name:'q',in:'query',schema:{type:'string',maxLength:200}},{name:'sort',in:'query',schema:{type:'string',enum:['createdAt','studentName','guardianName','opens']}},{name:'dir',in:'query',schema:{type:'string',enum:['asc','desc']}},{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100}},{name:'cursor',in:'query',schema:{type:'string',maxLength:4000}}]);
extendOperation('getParentAccess','getParentAccessDirectorySummary','/schools/{schoolId}/parent-access-directory-summary','parent_access.manage','ParentStaffAccessSummary',false,['SC23'],[{name:'schoolId',in:'path',required:true,schema:uuid}]);
extendOperation('getParentAccess','getParentAccessDetails','/schools/{schoolId}/parent-access/{accessId}/details','parent_access.manage','ParentStaffAccessDetails',false,['SC24'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'accessId',in:'path',required:true,schema:uuid}]);
for(const id of ['listParentAccessDirectory','getParentAccessDirectorySummary','getParentAccessDetails']){
 const generated=operations.find(op=>op.id===id),operation=spec.paths[generated.path.replace(/^\/api\/v1/,'')][generated.method.toLowerCase()];
 operation.description=generated.description='Scoped parent-link staff metadata and SQL counts/keysets, with independent issue/revoke/preview/contact capabilities. Stored token/hash/URL and pupil/family private fields are excluded.';
}
spec.components.schemas.ParentStaffAccessEvent=object({id:uuid,accessLinkId:uuid,eventKind:label,occurredAt:timestamp,deviceSummary:nullableLabel,section:nullableLabel});
spec.components.schemas.ParentStaffAccessEventPage=object({data:{type:'array',items:{$ref:'#/components/schemas/ParentStaffAccessEvent'}},page:{$ref:'#/components/schemas/PageInfo'},requestId:label});
extendOperation('listParentAccessEvents','listParentAccessHistory','/schools/{schoolId}/parent-access/{accessId}/history','parent_access.manage','ParentStaffAccessEvent',true,['SC24'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'accessId',in:'path',required:true,schema:uuid},
 {name:'sort',in:'query',schema:{type:'string',enum:['occurredAt','id']}},{name:'dir',in:'query',schema:{type:'string',enum:['asc','desc']}},{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100}},{name:'cursor',in:'query',schema:{type:'string',maxLength:4000}}]);
const studentHistoryProps={...structuredClone(spec.components.schemas.Enrollment.properties),className:label,yearName:label,yearStatus:structuredClone(spec.components.schemas.Year.properties.status),referenceDate:studentDate,homeroomName:nullableLabel};
spec.components.schemas.StudentHistory=object(studentHistoryProps);
spec.components.schemas.StudentSelectedEnrollment=object({...studentHistoryProps,inEffect:{type:'boolean'}});
spec.components.schemas.StudentProfileCore=object(Object.fromEntries(Object.entries(spec.components.schemas.Student.properties).filter(([name])=>!['initialEnrollment','initialGuardian','initialRelationship','internalNote'].includes(name)).map(([name,value])=>[name,structuredClone(value)])));
spec.components.schemas.StudentGroup=object({id:uuid,name:label,assignmentId:uuid,version:versionPositive,assignmentVersion:versionPositive});
spec.components.schemas.StudentPosition=object({id:uuid,name:label,code:label,assignmentId:uuid,version:versionPositive,assignmentVersion:versionPositive});
spec.components.schemas.StudentRelationship=object({...structuredClone(spec.components.schemas.Relationship.properties),revokedAt:{...timestamp,nullable:true},verifiedByName:nullableLabel,guardian:{$ref:'#/components/schemas/Guardian'}},[...spec.components.schemas.Relationship.required,'revokedAt','verifiedByName','guardian']);
spec.components.schemas.StudentAccessLink=object({id:uuid,version:versionPositive,createdAt:timestamp,updatedAt:timestamp,studentId:uuid,yearId:uuid,relationshipId:uuid,
 allowedSections:structuredClone(spec.components.schemas.ParentAccess.properties.allowedSections),allowDownload:{type:'boolean'},expiresAt:timestamp,revokedAt:{...timestamp,nullable:true},revokeReason:nullableLabel,issuedBy:uuid,issuedByName:nullableLabel,
 guardianName:label,relationshipLabel:label,yearName:label,status:{type:'string',enum:['ACTIVE','EXPIRED','REVOKED']},opens:count,lastOpenedAt:{...timestamp,nullable:true}});
spec.components.schemas.StudentAccessEvent=object({id:uuid,accessLinkId:uuid,eventKind:label,occurredAt:timestamp,deviceSummary:nullableLabel,section:nullableLabel,guardianName:label,relationshipLabel:label});
spec.components.schemas.StudentDetails=object({student:{$ref:'#/components/schemas/StudentProfileCore'},level:{type:'string',enum:['FULL','SUBJECT_MINIMAL']},today:studentDate,year:nullableMatrixRef('StudentYear'),referenceDate:studentNullableDate,selectedEnrollment:nullableMatrixRef('StudentSelectedEnrollment'),
 history:{type:'array',maxItems:2000,items:{$ref:'#/components/schemas/StudentHistory'}},group:nullableMatrixRef('StudentGroup'),positions:{type:'array',maxItems:1000,nullable:true,items:{$ref:'#/components/schemas/StudentPosition'}},
 relationships:{type:'array',maxItems:1000,nullable:true,items:{$ref:'#/components/schemas/StudentRelationship'}},links:{type:'array',maxItems:1000,nullable:true,items:{$ref:'#/components/schemas/StudentAccessLink'}},accessLog:{type:'array',maxItems:100,nullable:true,items:{$ref:'#/components/schemas/StudentAccessEvent'}},accessLogHasMore:{type:'boolean',nullable:true},internalNote:{type:'string',maxLength:4000,nullable:true},
 perms:object(Object.fromEntries(['edit','transfer','seeGuardians','editGuardians','verifyGuardians','manageLinks','issueLinks','revokeLinks','seeInternalNote','seeBirthDate'].map(name=>[name,{type:'boolean'}])))});
spec.components.schemas.StudentDetailsResponse=object({data:{$ref:'#/components/schemas/StudentDetails'},requestId:label});
extendOperation('getStudent','getStudentDetails','/schools/{schoolId}/students/{studentId}/details','student.read','StudentDetails',false,['SC18','SC19','CL02','CL03'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'studentId',in:'path',required:true,schema:uuid},...['yearId','classId'].map(name=>({name,in:'query',schema:uuid}))]);
for(const path of ['/schools/{schoolId}/student-directory','/schools/{schoolId}/student-directory/ids','/schools/{schoolId}/student-directory-summary','/schools/{schoolId}/students/{studentId}/details']){
 spec.paths[path].get.description='Purpose-bound student projection under current school/class/subject/time authority; family, internal notes and link metadata require independent grants. No reusable parent token.';
 const op=operations.find(o=>o.id===spec.paths[path].get.operationId);op.description=spec.paths[path].get.description;
}
// ADR-052: guardian reads never enumerate siblings beyond current family scope.
const nullableUuid={...uuid,nullable:true};
spec.components.schemas.GuardianDirectoryStudent=object({id:uuid,version:versionPositive,name:label,code:label,status:structuredClone(spec.components.schemas.Student.properties.status),relationshipId:uuid,relationshipVersion:versionPositive,relation:label,verification:structuredClone(spec.components.schemas.Relationship.properties.status),canReceiveInfo:{type:'boolean'},isPrimaryContact:{type:'boolean'},classId:nullableUuid,className:nullableLabel,yearId:nullableUuid});
spec.components.schemas.GuardianDirectoryRow=object({...structuredClone(spec.components.schemas.Guardian.properties),verified:count,unverified:count,revoked:count,activeLinks:{...count,nullable:true},relationshipCount:{type:'integer',minimum:0,maximum:1000},students:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/GuardianDirectoryStudent'}}});
spec.components.schemas.GuardianDirectoryRowPage=object({data:{type:'array',items:{$ref:'#/components/schemas/GuardianDirectoryRow'}},page:{$ref:'#/components/schemas/PageInfo'},requestId:label});
spec.components.schemas.GuardianDirectorySummary=object({guardians:count,verified:count,unverified:count,revoked:count,activeLinks:{...count,nullable:true},canSeeLinks:{type:'boolean'},canManage:{type:'boolean'},canVerify:{type:'boolean'}});
spec.components.schemas.GuardianDirectorySummaryResponse=object({data:{$ref:'#/components/schemas/GuardianDirectorySummary'},requestId:label});
spec.components.schemas.GuardianProfileStudent=object({id:uuid,version:versionPositive,name:label,code:label,status:structuredClone(spec.components.schemas.Student.properties.status),classId:nullableUuid,className:nullableLabel,yearId:nullableUuid,enrollmentId:nullableUuid,enrollmentVersion:{...versionPositive,nullable:true}});
spec.components.schemas.GuardianProfileRelationship=object({...structuredClone(spec.components.schemas.Relationship.properties),revokedAt:{...timestamp,nullable:true},verifiedByName:nullableLabel,verificationNote:nullableLabel,revokedReason:nullableLabel,student:{$ref:'#/components/schemas/GuardianProfileStudent'},
 canEdit:{type:'boolean'},canVerify:{type:'boolean'},canIssue:{type:'boolean'},canRevokeLinks:{type:'boolean'},canSeeLinks:{type:'boolean'},links:{type:'array',maxItems:1000,nullable:true,items:{$ref:'#/components/schemas/StudentAccessLink'}}});
spec.components.schemas.GuardianHistoryEvent=object({id:uuid,actorId:nullableUuid,actorName:nullableLabel,action:label,targetType:label,targetId:uuid,at:timestamp,reason:nullableLabel});
spec.components.schemas.GuardianDetails=object({guardian:{$ref:'#/components/schemas/Guardian'},today:studentDate,canEditContact:{type:'boolean'},canViewHistory:{type:'boolean'},historyHasMore:{type:'boolean',nullable:true},relationships:{type:'array',maxItems:1000,items:{$ref:'#/components/schemas/GuardianProfileRelationship'}},history:{type:'array',maxItems:100,nullable:true,items:{$ref:'#/components/schemas/GuardianHistoryEvent'}}});
spec.components.schemas.GuardianDetailsResponse=object({data:{$ref:'#/components/schemas/GuardianDetails'},requestId:label});
extendOperation('listGuardians','listGuardianDirectory','/schools/{schoolId}/guardian-directory','guardian.read','GuardianDirectoryRow',true,['SC21'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'verification',in:'query',schema:structuredClone(spec.components.schemas.Relationship.properties.status)},
 {name:'status',in:'query',schema:structuredClone(spec.components.schemas.Guardian.properties.status)},{name:'q',in:'query',schema:{type:'string',maxLength:200}},{name:'sort',in:'query',schema:{type:'string',enum:['fullName']}},{name:'dir',in:'query',schema:{type:'string',enum:['asc','desc']}},{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100}},{name:'cursor',in:'query',schema:{type:'string',maxLength:4000}}]);
extendOperation('getGuardian','getGuardianDirectorySummary','/schools/{schoolId}/guardian-directory-summary','guardian.read','GuardianDirectorySummary',false,['SC21'],[{name:'schoolId',in:'path',required:true,schema:uuid}]);
extendOperation('getGuardian','getGuardianDetails','/schools/{schoolId}/guardians/{guardianId}/details','guardian.read','GuardianDetails',false,['SC22'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'guardianId',in:'path',required:true,schema:uuid}]);
for(const path of ['/schools/{schoolId}/guardian-directory','/schools/{schoolId}/guardian-directory-summary','/schools/{schoolId}/guardians/{guardianId}/details']){
 spec.paths[path].get.description='Current authorized family contacts and pupil references, with independent link/audit panels; no parent accounts, unscoped siblings or reusable link secrets.';
 operations.find(o=>o.id===spec.paths[path].get.operationId).description=spec.paths[path].get.description;
}
// ADR-054: the existing guardian form is one scoped, versioned transaction.
spec.components.schemas.GuardianPrimaryRef=object({id:uuid,version:versionPositive});
const primaryRefs={type:'array',maxItems:1000,uniqueItems:true,items:{$ref:'#/components/schemas/GuardianPrimaryRef'}};
spec.components.schemas.GuardianFormContact=object({...structuredClone(spec.components.schemas.Guardian.properties),id:uuid});
spec.components.schemas.GuardianFormRelationship=object({...structuredClone(spec.components.schemas.Relationship.properties),id:uuid,studentId:uuid,guardianId:uuid});
spec.components.schemas.GuardianFormStudent=object({id:uuid,version:versionPositive,name:label,code:label});
spec.components.schemas.GuardianFormTarget=object({guardian:{$ref:'#/components/schemas/GuardianFormContact'},relationship:{$ref:'#/components/schemas/GuardianFormRelationship'},canEditContact:{type:'boolean'}});
spec.components.schemas.GuardianFormContext=object({student:{$ref:'#/components/schemas/GuardianFormStudent'},today:studentDate,primaryContacts:primaryRefs,target:nullableMatrixRef('GuardianFormTarget')});
spec.components.schemas.GuardianFormContextResponse=object({data:{$ref:'#/components/schemas/GuardianFormContext'},requestId:label});
spec.components.schemas.GuardianSaveRequest=object({expectedStudentVersion:versionPositive,expectedPrimaryContacts:primaryRefs,guardianId:uuid,relationshipId:uuid,expectedGuardianVersion:versionPositive,expectedRelationshipVersion:versionPositive,
 fullName:structuredClone(spec.components.schemas.GuardianCreate.properties.fullName),relationshipLabel:structuredClone(spec.components.schemas.RelationshipCreate.properties.relationshipLabel),phone:{type:'string',minLength:8,maxLength:32},email:structuredClone(spec.components.schemas.Guardian.properties.email),isPrimary:{type:'boolean'}},['expectedStudentVersion','expectedPrimaryContacts','fullName','relationshipLabel','email','isPrimary']);
spec.components.schemas.GuardianSaveResult=object({studentId:uuid,studentVersion:versionPositive,guardian:{$ref:'#/components/schemas/GuardianFormContact'},relationship:{$ref:'#/components/schemas/GuardianFormRelationship'}});
spec.components.schemas.GuardianSaveResultResponse=object({data:{$ref:'#/components/schemas/GuardianSaveResult'},requestId:label});
const guardianFormPath='/schools/{schoolId}/students/{studentId}/guardian-form',guardianSavePath='/schools/{schoolId}/students/{studentId}/guardians/save',guardianParams=['schoolId','studentId'].map(name=>({name,in:'path',required:true,schema:uuid}));
extendOperation('getGuardian','getStudentGuardianForm',guardianFormPath,'guardian.manage+guardian.read','GuardianFormContext',false,['SC20','SC22'],[...guardianParams,{name:'relationshipId',in:'query',schema:uuid}]);
extendOperation('createRelationship','saveStudentGuardian',guardianSavePath,'guardian.manage+guardian.read','GuardianSaveResult',false,['SC20','SC22'],guardianParams,'GuardianSaveRequest');
spec.paths[guardianSavePath].post.responses['200']=structuredClone(spec.paths[guardianSavePath].post.responses['201']);
for(const [path,method]of [[guardianFormPath,'get'],[guardianSavePath,'post']]){spec.paths[path][method].description='Current pupil-bound guardian form and atomic save, with displayed contact/relationship/student/primary versions, no phone merge, no automatic verification and no parent accounts.';operations.find(o=>o.id===spec.paths[path][method].operationId).description=spec.paths[path][method].description;}
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
// ADR-078: own class cards use current assignment/grant authority; ended
// assignments are self history and carry no current class panels or actions.
spec.components.schemas.TeacherClassCard=object({id:uuid,schoolId:uuid,yearId:uuid,name:label,yearLabel:label,status:structuredClone(spec.components.schemas.Class.properties.status),today:studentDate,referenceDate:studentDate,live:{type:'boolean'},motto:nullableLabel,studentCount:{...count,nullable:true},roomLabel:nullableLabel,homeroomName:nullableLabel,
 assignments:{type:'array',minItems:1,items:object({id:uuid,kind:{type:'string',enum:['HOMEROOM','SUBJECT']},subjectName:nullableLabel,startsOn:studentDate,endsOn:{...studentDate,nullable:true},live:{type:'boolean'},status:{type:'string',enum:['ACTIVE','ENDED','REVOKED','NOT_CURRENT']}})},actions:{type:'array',uniqueItems:true,items:label},
 nextLesson:{...object({date:studentDate,startsAtLocal:{type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'},endsAtLocal:{type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'},periodNumber:{type:'integer',minimum:1,nullable:true},subjectName:label}),nullable:true}});
spec.components.schemas.TeacherClassCardPage=object({data:{type:'array',maxItems:100,items:{$ref:'#/components/schemas/TeacherClassCard'}},page:{$ref:'#/components/schemas/PageInfo'},requestId:label});
extendOperation('listMyClasses','listTeacherClassDirectory','/schools/{schoolId}/me/class-directory','teacher.self','TeacherClassCard',true,['TE02'],[{name:'schoolId',in:'path',required:true,schema:uuid},{name:'includeEnded',in:'query',schema:{type:'boolean'}},{name:'sort',in:'query',schema:{type:'string',enum:['name','id']}},{name:'dir',in:'query',schema:{type:'string',enum:['asc','desc']}},{name:'limit',in:'query',schema:{type:'integer',minimum:1,maximum:100}},{name:'cursor',in:'query',schema:{type:'string',maxLength:4000}}]);
const teacherDirectoryOp=operations.find(op=>op.id==='listTeacherClassDirectory');
spec.paths['/schools/{schoolId}/me/class-directory'].get.description=teacherDirectoryOp.description='Own current class cards and optional ended self assignment history. Current class metadata, roster counts, capabilities and next own dated lesson require fresh independent authority; ended cards have no current panels. SQL keysets bind the actor and grants.';
// Exact class workspace context; every aggregate/contact panel has independent
// fresh native authority. Missing periods are explicit, never invented OPEN.
spec.components.schemas.ClassWorkspaceHeader=object({
 school:object({id:uuid,name:label,shortName:label,slug:label}),
 class:object({id:uuid,version:{type:'integer',minimum:1},yearId:uuid,gradeLevelId:uuid,name:label,capacity:count,status:{type:'string',enum:['DRAFT','ACTIVE','ARCHIVED']},roomId:{...uuid,nullable:true},motto:nullableLabel,createdAt:{type:'string',format:'date-time'}}),
 year:object({id:uuid,version:{type:'integer',minimum:1},code:label,name:label,startsOn:studentDate,endsOn:studentDate,status:{type:'string',enum:['DRAFT','ACTIVE','ARCHIVED']}}),grade:label,today:studentDate,referenceDate:studentDate,
 homeroom:{...object({name:label,contactVisible:{type:'boolean'},workEmail:nullableLabel,workPhone:nullableLabel}),nullable:true},
 studentCount:{...count,nullable:true},maleCount:{...count,nullable:true},femaleCount:{...count,nullable:true},myDuties:{type:'array',uniqueItems:true,items:label},viaSchoolRole:{type:'boolean'},workspaceKind:{type:'string',enum:['TEACHER','SCHOOL','CLASS']},actions:{type:'array',uniqueItems:true,items:label},
 tabs:{type:'array',maxItems:10,items:object({key:{type:'string',enum:['overview','students','attendance','conduct','timetable','groups','activities','announcements','files','reports']},label:label,path:{type:'string',enum:['','/students','/attendance','/conduct','/timetable','/groups','/seating','/duties','/activities','/announcements','/files','/reports']}})},
 summary:object({weekIndex:{type:'integer',minimum:1,nullable:true},weekStatus:{type:'string',enum:['OPEN','IN_REVIEW','LOCKED','PUBLISHED',null],nullable:true},pending:{...count,nullable:true},links:{...object({studentsWithLink:count,opened:count}),nullable:true},lastPublishedAt:{type:'string',format:'date-time',nullable:true}}),readOnly:{type:'boolean'},
});
spec.components.schemas.ClassWorkspaceHeaderResponse=object({data:{$ref:'#/components/schemas/ClassWorkspaceHeader'},requestId:label});
extendOperation('getClassOverview','getClassWorkspaceHeader','/schools/{schoolId}/academic-years/{yearId}/classes/{classId}/workspace-header','class.read','ClassWorkspaceHeader',false,['CL01'],['schoolId','yearId','classId'].map(name=>({name,in:'path',required:true,schema:uuid})));
// Bounded exact class content uses native source states and separate panel rights.
const classTaskKind={type:'string',enum:['attendance','attendance-finish','attendance-publish','lesson-attendance','conduct-review','conduct-lock','evidence','adjustment','adjustment-publish','groups']};
const overviewCounts=object({total:count,present:count,late:count,excused:count,unexcused:count,unmarked:count});
spec.components.schemas.ClassWorkspaceOverview=object({schoolId:uuid,yearId:uuid,classId:uuid,today:studentDate,referenceDate:studentDate,asOf:{type:'string',format:'date-time'},isCurrent:{type:'boolean'},readOnly:{type:'boolean'},
 permissions:object({attendance:{type:'boolean'},schedule:{type:'boolean'},groups:{type:'boolean'},activities:{type:'boolean'}}),canRecordMorning:{type:'boolean'},
 allowedTaskKinds:{type:'array',maxItems:10,uniqueItems:true,items:classTaskKind},tasks:{type:'array',maxItems:10,nullable:true,items:object({kind:classTaskKind,count:{type:'integer',minimum:1}})},
 attendance:{...object({calendarState:{type:'string',enum:['HOLIDAY','WITHIN_YEAR']},session:{...object({id:uuid,version:{type:'integer',minimum:1},sourceVersion:{type:'integer',minimum:1},status:{type:'string',enum:['OPEN','LOCKED','PUBLISHED']}}),nullable:true},counts:{...overviewCounts,nullable:true}}),nullable:true},
 lessons:{type:'array',maxItems:100,nullable:true,items:object({id:uuid,version:{type:'integer',minimum:1},periodNumber:{type:'integer',minimum:1,nullable:true},startsAtLocal:{type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'},endsAtLocal:{type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'},subjectName:label,teacherName:nullableLabel,roomName:nullableLabel,status:{type:'string',enum:['SCHEDULED','CANCELLED']},changeReason:nullableLabel})},
 groups:{...object({items:{type:'array',maxItems:100,items:object({id:uuid,name:label,size:count})},totalStudents:count,noGroup:count}),nullable:true},
 activities:{...object({items:{type:'array',maxItems:6,items:object({id:uuid,version:{type:'integer',minimum:1},title:label,dueAt:{type:'string',format:'date-time'},dueDate:studentDate,total:count,done:count})},total:count,hasMore:{type:'boolean'}}),nullable:true},
 navigation:{type:'array',uniqueItems:true,maxItems:6,items:{type:'string',enum:['reports','attendance/weekly','conduct','timetable','groups','activities']}},
});
spec.components.schemas.ClassWorkspaceOverviewResponse=object({data:{$ref:'#/components/schemas/ClassWorkspaceOverview'},requestId:label});
extendOperation('getClassOverview','getClassWorkspaceOverview','/schools/{schoolId}/academic-years/{yearId}/classes/{classId}/workspace-overview','class.read','ClassWorkspaceOverview',false,['CL01'],['schoolId','yearId','classId'].map(name=>({name,in:'path',required:true,schema:uuid})));
const organizationContext={schoolId:uuid,yearId:uuid,classId:uuid,today:studentDate,referenceDate:studentDate,classVersion:{type:'integer',minimum:1},readOnly:{type:'boolean'},canEdit:{type:'boolean'},groupsVisible:{type:'boolean'},students:{type:'array',maxItems:5000,items:object({id:uuid,enrollmentId:uuid,studentCode:label,fullName:label,groupId:{...uuid,nullable:true}})}};
spec.components.schemas.ClassGroupWorkspace=object({...organizationContext,groups:{type:'array',maxItems:100,items:object({id:uuid,version:{type:'integer',minimum:1},name:label,sortOrder:{type:'integer'}})},
 positionDefinitions:{type:'array',maxItems:500,items:object({id:uuid,version:{type:'integer',minimum:1},code:label,name:label,singleHolder:{type:'boolean'},groupId:{...uuid,nullable:true}})},
 holders:{type:'array',maxItems:5000,items:object({id:uuid,version:{type:'integer',minimum:1},positionId:uuid,enrollmentId:uuid,startsOn:studentDate,endsOn:studentDate})}});
spec.components.schemas.ClassSeatingWorkspace=object({...organizationContext,groupNames:{type:'array',maxItems:100,nullable:true,items:object({id:uuid,name:label})},latestRevision:{type:'integer',minimum:0},plan:{...object({id:uuid,version:{type:'integer',minimum:1},revision:{type:'integer',minimum:1},effectiveOn:studentDate,endsOn:{...studentDate,nullable:true},rows:{type:'integer',minimum:1,maximum:200,nullable:true},cols:{type:'integer',minimum:1,maximum:200,nullable:true},note:{type:'string',maxLength:120,nullable:true},seats:{type:'array',maxItems:500,items:object({key:label,row:{type:'integer',minimum:0,maximum:199},column:{type:'integer',minimum:0,maximum:199},enrollmentId:{...uuid,nullable:true}})}}),nullable:true},
 history:{type:'array',maxItems:500,items:object({id:uuid,version:{type:'integer',minimum:1},revision:{type:'integer',minimum:1},effectiveOn:studentDate,endsOn:{...studentDate,nullable:true},status:{type:'string',enum:['DRAFT','ACTIVE','ARCHIVED']},createdAt:{type:'string',format:'date-time'},createdByName:nullableLabel})}});
for(const [id,schema,path,screen] of [['getClassGroupWorkspace','ClassGroupWorkspace','group-workspace','CL13'],['getClassSeatingWorkspace','ClassSeatingWorkspace','seating-workspace','CL14']]){
 spec.components.schemas[schema+'Response']=object({data:{$ref:'#/components/schemas/'+schema},requestId:label});
 extendOperation('getClassOverview',id,'/schools/{schoolId}/academic-years/{yearId}/classes/{classId}/'+path,'class.read',schema,false,[screen],[...['schoolId','yearId','classId'].map(name=>({name,in:'path',required:true,schema:uuid})),{name:'onDate',in:'query',schema:studentDate}]);
}
spec.components.schemas.ClassSeatingRevisionSave=structuredClone(spec.components.schemas.SeatingCreate);
spec.components.schemas.ClassSeatingRevisionSave.required.push('expectedRevision');
spec.components.schemas.ClassSeatingRevisionSave.properties.note={type:'string',maxLength:120};
extendOperation('createSeatingPlan','saveClassSeatingRevision','/schools/{schoolId}/academic-years/{yearId}/classes/{classId}/seating-revisions','seating.manage','SeatingPlan',false,['CL14'],['schoolId','yearId','classId'].map(name=>({name,in:'path',required:true,schema:uuid})),'ClassSeatingRevisionSave');
// Native duty board keeps row intent, dated enrollment selections and atomic publication changes.
const dutySource=object({scheduleId:uuid,expectedVersion:{type:'integer',minimum:1},expectedDataVersion:{type:'integer',minimum:1},date:studentDate,task:{type:'string',minLength:1,maxLength:4000},assignmentIds:{type:'array',maxItems:5000,uniqueItems:true,items:uuid},groupPlanId:{...uuid,nullable:true}});
spec.components.schemas.ClassDutyTaskSource=dutySource;
spec.components.schemas.ClassDutyTask=object({id:uuid,scheduleId:uuid,version:{type:'integer',minimum:1},dataVersion:{type:'integer',minimum:1},date:studentDate,task:{type:'string',minLength:1,maxLength:4000},assignmentIds:{type:'array',maxItems:5000,uniqueItems:true,items:uuid},groupPlanId:{...uuid,nullable:true},groupId:{...uuid,nullable:true},groupName:nullableLabel,studentIds:{type:'array',maxItems:5000,uniqueItems:true,items:uuid},studentNames:{type:'array',maxItems:5000,items:label},unavailableTargets:{type:'integer',minimum:0},status:{type:'string',enum:['DRAFT','PUBLISHED','WITHDRAWN']},canEdit:{type:'boolean'}});
spec.components.schemas.ClassDutyWorkspace=object({schoolId:uuid,yearId:uuid,classId:uuid,today:studentDate,monday:studentDate,referenceDate:studentDate,startsOn:studentDate,endsOn:studentDate,readOnly:{type:'boolean'},canEdit:{type:'boolean'},canPublish:{type:'boolean'},canPreview:{type:'boolean'},previewStudents:{type:'array',maxItems:5000,items:object({id:uuid,fullName:label})},publicationId:{...uuid,nullable:true},tasks:{type:'array',maxItems:2000,items:{$ref:'#/components/schemas/ClassDutyTask'}},students:{type:'array',maxItems:5000,items:object({id:uuid,enrollmentId:uuid,fullName:label})},groups:{type:'array',maxItems:100,items:object({id:uuid,name:label,studentIds:{type:'array',maxItems:5000,uniqueItems:true,items:uuid}})},preview:{type:'array',maxItems:5000,nullable:true,items:object({studentId:uuid,date:studentDate,task:label,status:{type:'string',enum:['ASSIGNED','DONE','CANCELLED']},publishedAt:{type:'string',format:'date-time'}})}});
spec.components.schemas.ClassDutyWorkspaceResponse=object({data:{$ref:'#/components/schemas/ClassDutyWorkspace'},requestId:label});
spec.components.schemas.ClassDutyTaskSave=object({source:{...dutySource,nullable:true},date:studentDate,task:{type:'string',minLength:3,maxLength:4000},studentIds:{type:'array',minItems:1,maxItems:5000,uniqueItems:true,items:uuid},groupId:{...uuid,nullable:true},publish:{type:'boolean'},expectedPublicationId:{...uuid,nullable:true}});
spec.components.schemas.ClassDutyTaskRemove=object({source:dutySource,expectedPublicationId:{...uuid,nullable:true}});
spec.components.schemas.ClassDutyTaskReceipt=object({sourceId:{...uuid,nullable:true},status:{type:'string',enum:['DRAFT','PUBLISHED','REMOVED']}});
spec.components.schemas.ClassDutyTaskReceiptResponse=object({data:{$ref:'#/components/schemas/ClassDutyTaskReceipt'},requestId:label});
const dutyPaths=['schoolId','yearId','classId'].map(name=>({name,in:'path',required:true,schema:uuid}));
extendOperation('getClassOverview','getClassDutyWorkspace','/schools/{schoolId}/academic-years/{yearId}/classes/{classId}/duty-workspace','duty.read','ClassDutyWorkspace',false,['CL16'],[...dutyPaths,...['weekStart','onDate'].map(name=>({name,in:'query',schema:studentDate}))]);
extendOperation('createDuty','saveClassDutyTask','/schools/{schoolId}/academic-years/{yearId}/classes/{classId}/duty-tasks','duty.manage','ClassDutyTaskReceipt',false,['CL16'],dutyPaths,'ClassDutyTaskSave');
extendOperation('createDuty','removeClassDutyTask','/schools/{schoolId}/academic-years/{yearId}/classes/{classId}/duty-tasks/remove','duty.manage','ClassDutyTaskReceipt',false,['CL16'],dutyPaths,'ClassDutyTaskRemove');
// Exact dated class roster and transfer-request choices keep family/link rights separate.
const rosterGuardian={...object({name:label,relation:label,verification:{type:'string',enum:['UNVERIFIED','VERIFIED']}}),nullable:true};
spec.components.schemas.ClassRosterRow=object({id:uuid,studentCode:label,fullName:label,gender:{type:'string',enum:['Nam','Nữ']},enrollmentId:uuid,enrollmentVersion:{type:'integer',minimum:1},startsOn:studentDate,ordinal:{type:'integer',minimum:1},groupId:{...uuid,nullable:true},groupName:nullableLabel,positions:{type:'array',maxItems:500,items:label},transferredIn:{type:'boolean'},currentEnrollment:{type:'boolean'},guardian:rosterGuardian,linkStatus:{type:'string',enum:['none','issued','opened','revoked'],nullable:true}});
spec.components.schemas.ClassRosterWorkspace=object({schoolId:uuid,yearId:uuid,classId:uuid,today:studentDate,referenceDate:studentDate,classVersion:{type:'integer',minimum:1},readOnly:{type:'boolean'},seeGuardians:{type:'boolean'},seeLinks:{type:'boolean'},canAdd:{type:'boolean'},canTransfer:{type:'boolean'},canGroups:{type:'boolean'},canSeating:{type:'boolean'},groups:{type:'array',maxItems:100,items:object({id:uuid,name:label})},total:count,rows:{type:'array',maxItems:5000,items:{$ref:'#/components/schemas/ClassRosterRow'}},leftRecently:{type:'array',maxItems:2000,items:object({id:uuid,enrollmentId:uuid,fullName:label,studentCode:label,endsOn:studentDate,reason:nullableLabel})},linkSummary:{...object({total:count,withLink:count,opened:count}),nullable:true}});
spec.components.schemas.ClassRosterWorkspaceResponse=object({data:{$ref:'#/components/schemas/ClassRosterWorkspace'},requestId:label});
spec.components.schemas.ClassRosterRow.properties.gender.nullable=true;
spec.components.schemas.ClassRosterRow.properties.gender.enum.push(null);
spec.components.schemas.ClassRosterRow.properties.linkStatus.enum.push(null);
spec.components.schemas.ClassRosterWorkspace.properties.canReadGroups={type:'boolean'};
spec.components.schemas.ClassRosterWorkspace.required.push('canReadGroups');
spec.components.schemas.ClassTransferOptions=object({schoolId:uuid,yearId:uuid,classId:uuid,today:studentDate,referenceDate:studentDate,startsOn:studentDate,endsOn:studentDate,students:{type:'array',maxItems:5000,items:object({id:uuid,fullName:label,studentCode:label,enrollmentId:uuid,enrollmentVersion:{type:'integer',minimum:1},startsOn:studentDate,endsOn:{...studentDate,nullable:true}})},targets:{type:'array',maxItems:500,items:object({id:uuid,name:label,size:count,capacity:{type:'integer',minimum:1,nullable:true}})}});
spec.components.schemas.ClassTransferOptionsResponse=object({data:{$ref:'#/components/schemas/ClassTransferOptions'},requestId:label});
spec.components.schemas.TransferCreate.properties.expectedEnrollmentVersion={type:'integer',minimum:1};
extendOperation('getClassOverview','getClassRosterWorkspace','/schools/{schoolId}/academic-years/{yearId}/classes/{classId}/roster-workspace','student.read','ClassRosterWorkspace',false,['CL02'],[...dutyPaths,{name:'q',in:'query',schema:{type:'string',maxLength:200}},{name:'groupId',in:'query',schema:{type:'string',pattern:'^(none|[0-9a-fA-F-]{36})$'}},{name:'linkStatus',in:'query',schema:{type:'string',enum:['none','issued','opened','revoked']}},{name:'onDate',in:'query',schema:studentDate}]);
extendOperation('getClassOverview','getClassTransferOptions','/schools/{schoolId}/academic-years/{yearId}/classes/{classId}/transfer-options','student.transfer.request','ClassTransferOptions',false,['CL02','CL03'],[...dutyPaths,{name:'onDate',in:'query',schema:studentDate}]);
spec.components.schemas.ClassStudentAttendance=object({schoolId:uuid,yearId:uuid,classId:uuid,studentId:uuid,today:studentDate,referenceDate:studentDate,className:label,sessions:count,published:count,tally:object(Object.fromEntries(['PRESENT','LATE','EXCUSED','UNEXCUSED','UNMARKED'].map(key=>[key,count]))),notable:{type:'array',maxItems:8,items:object({date:studentDate,status:{type:'string',enum:['LATE','EXCUSED','UNEXCUSED','UNMARKED']},note:nullableLabel,published:{type:'boolean'}})}});
spec.components.schemas.ClassStudentAttendanceResponse=object({data:{$ref:'#/components/schemas/ClassStudentAttendance'},requestId:label});
spec.components.schemas.ClassStudentAttendance.properties.notable.items.properties.note={type:'string',maxLength:4000,nullable:true};
extendOperation('getClassOverview','getClassStudentAttendance','/schools/{schoolId}/academic-years/{yearId}/classes/{classId}/students/{studentId}/attendance','attendance.read','ClassStudentAttendance',false,['CL03'],[...dutyPaths,{name:'studentId',in:'path',required:true,schema:uuid}]);
const attStatus={type:'string',enum:['PRESENT','LATE','EXCUSED','UNEXCUSED','UNMARKED']},attState={type:'string',enum:['none','open','published','locked']},attNote={type:'string',maxLength:4000},attSlot={type:'string',pattern:'^(morning|afternoon|period-[1-9][0-9]*|lesson-[0-9a-fA-F-]{36})$'};
const attSource=object({classVersion:{type:'integer',minimum:1},rosterHash:{type:'string',pattern:'^[0-9a-f]{64}$'},sessionId:{...uuid,nullable:true},version:{type:'integer',minimum:1,nullable:true},dataVersion:{type:'integer',minimum:1,nullable:true},publicationId:{...uuid,nullable:true}});
const attLesson=object({id:uuid,period:{type:'integer',minimum:1,nullable:true},subject:label,start:{type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'},end:{type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'},status:{type:'string',enum:['SCHEDULED','CANCELLED','REPLACED']}});
const attLink=object({id:uuid,points:{type:'number'},status:{type:'string',enum:['DRAFT','APPROVED','EXCLUDED']}}),attWeek=object({id:uuid,index:{type:'integer',minimum:1}}),attScope={schoolId:uuid,yearId:uuid,classId:uuid};
spec.components.schemas.ClassAttendanceSource=attSource;
spec.components.schemas.ClassAttendanceSlots=object({...attScope,date:studentDate,slots:{type:'array',maxItems:102,items:object({slot:attSlot,label,canRecord:{type:'boolean'}})}});
spec.components.schemas.ClassAttendanceSheet=object({...attScope,date:studentDate,slot:attSlot,today:studentDate,className:label,source:attSource,session:{...object({id:uuid,version:{type:'integer',minimum:1},dataVersion:{type:'integer',minimum:1},updatedAt:{type:'string',format:'date-time'},publishedAt:{type:'string',format:'date-time',nullable:true},locked:{type:'boolean'}}),nullable:true},sessionStatus:attState,rows:{type:'array',maxItems:5000,items:object({studentId:uuid,enrollmentId:uuid,recordVersion:{type:'integer',minimum:1,nullable:true},code:label,fullName:label,groupName:nullableLabel,status:attStatus,note:attNote,edited:{type:'boolean'},linkedConduct:{...attLink,nullable:true}})},counts:object(Object.fromEntries(attStatus.enum.map(k=>[k,count]))),lessons:{type:'array',maxItems:100,items:attLesson},lesson:{...attLesson,nullable:true},canRecord:{type:'boolean'},canPublish:{type:'boolean'},canLink:{type:'boolean'},holiday:nullableLabel,isSunday:{type:'boolean'},updatedByName:nullableLabel,week:{...attWeek,nullable:true},periodLocked:{type:'boolean'},linkRules:{type:'array',maxItems:2,items:object({link:{type:'string',enum:['LATE','UNEXCUSED']},label,points:{type:'number'}})}});
spec.components.schemas.ClassAttendanceWeek=object({...attScope,monday:studentDate,today:studentDate,week:{...attWeek,nullable:true},
 days:{type:'array',minItems:6,maxItems:6,items:object({date:studentDate,sessionStatus:{type:'string',enum:[...attState.enum,'future','outside_year']},holiday:nullableLabel,periodSessions:count})},
 rows:{type:'array',maxItems:5000,items:object({studentId:uuid,code:label,fullName:label,cells:{type:'array',minItems:6,maxItems:6,items:object({status:{type:'string',enum:[...attStatus.enum,'not_enrolled','holiday','future']},note:attNote,edited:{type:'boolean'}})},tally:object(Object.fromEntries(attStatus.enum.map(k=>[k,count])))})}});
spec.components.schemas.ClassAttendanceHistory=object({...attScope,studentId:uuid,studentName:label,code:label,date:studentDate,slot:attSlot,status:attStatus,note:attNote,sessionStatus:attState,publishedAt:{type:'string',format:'date-time',nullable:true},linkedConduct:{type:'array',maxItems:1,items:object({...attLink.properties,reason:nullableLabel})},history:{type:'array',maxItems:2000,items:object({id:uuid,at:{type:'string',format:'date-time'},byName:nullableLabel,from:attStatus,to:attStatus,reason:nullableLabel})}});
spec.components.schemas.ClassAttendanceSave=object({date:studentDate,slot:attSlot,source:attSource,entries:{type:'array',maxItems:5000,items:object({studentId:uuid,recordVersion:{type:'integer',minimum:1,nullable:true},status:attStatus,note:attNote})},linkConduct:{type:'boolean'},reason:{type:'string',minLength:5,maxLength:2000}},['date','slot','source','entries','linkConduct']);
spec.components.schemas.ClassAttendancePublish=object({date:studentDate,slot:attSlot,source:attSource});
spec.components.schemas.ClassAttendanceReceipt=object({sessionId:uuid,changed:count,linkedCreated:count,linkedVoided:count,blockedLinks:{type:'array',maxItems:5000,items:object({studentId:{...uuid,nullable:true},code:label})},source:attSource});
for(const name of ['ClassAttendanceSlots','ClassAttendanceSheet','ClassAttendanceWeek','ClassAttendanceHistory','ClassAttendanceReceipt'])spec.components.schemas[name+'Response']=object({data:{$ref:'#/components/schemas/'+name},requestId:label});
const attPath='/schools/{schoolId}/academic-years/{yearId}/classes/{classId}/attendance-workspace';
for(const [id,suffix,response,screen,parameters] of [['getClassAttendanceSlots','/slots','ClassAttendanceSlots','CL04',[{name:'date',in:'query',required:true,schema:studentDate}]],['getClassAttendanceSheet','/sheet','ClassAttendanceSheet','CL04',[{name:'date',in:'query',required:true,schema:studentDate},{name:'slot',in:'query',required:true,schema:attSlot}]],['getClassAttendanceWeek','/week','ClassAttendanceWeek','CL05',[{name:'weekStart',in:'query',schema:studentDate}]],['getClassAttendanceHistory','/students/{studentId}/history','ClassAttendanceHistory','CL06',[{name:'studentId',in:'path',required:true,schema:uuid},{name:'date',in:'query',required:true,schema:studentDate},{name:'slot',in:'query',required:true,schema:attSlot}]]])extendOperation('getClassOverview',id,attPath+suffix,'attendance.read',response,false,[screen],[...dutyPaths,...parameters]);
// History is an attendance drawer (O15), not the CL06 conduct record screen.
spec.paths[attPath+'/students/{studentId}/history'].get['x-frontend-screen-ids']=['CL04','CL05'];operations.find(o=>o.id==='getClassAttendanceHistory').frontend_ids=['CL04','CL05'];
extendOperation('createDuty','saveClassAttendanceSheet',attPath+'/save','attendance.record','ClassAttendanceReceipt',false,['CL04'],dutyPaths,'ClassAttendanceSave');
extendOperation('createDuty','publishClassAttendanceSheet',attPath+'/publish','attendance.publish','ClassAttendanceReceipt',false,['CL04'],dutyPaths,'ClassAttendancePublish');
for(const items of Object.values(spec.paths))for(const operation of Object.values(items))if(operation?.operationId?.includes('ClassAttendance'))operation.description='Exact class/year/date attendance sources with independent lesson rights, displayed versions, atomic editing and immutable publication replacements; staff public notes only.';
extendAnnouncementContract(spec,extendOperation,{object,uuid,label,count,timestamp,studentDate,operations});
// These native acknowledgements return HTTP200. Their create-duty template had
// inherited HTTP201, leaving the actual response outside the validator contract.
for(const paths of Object.values(spec.paths))for(const op of Object.values(paths))if(['saveClassDutyTask','removeClassDutyTask','saveClassAttendanceSheet','publishClassAttendanceSheet'].includes(op?.operationId)){
 op.responses['200']=op.responses['201'];delete op.responses['201'];
}
// The existing link-issuance service creates its one-time link with HTTP201.
// Keep its HTTP200 envelope and validate the actual creation response as well.
for(const paths of Object.values(spec.paths))for(const op of Object.values(paths))if(op?.operationId==='issueParentAccess')op.responses['201']=structuredClone(op.responses['200']);
// ADR-090: explicit statuses observed in the existing synchronous handlers.
// Keep their original envelopes and documented statuses; validate the actual
// status too. No undeclared status or unvalidated JSON success is accepted.
const synchronousStatuses={forgotPassword:[200,202],inviteStaff:[201,202],inviteSchoolAdmin:[201,202],inviteSchoolStaff:[201,202],assignPosition:[201,200],postSchoolMessage:[201,200],postPlatformTicketMessage:[201,200],publishSchoolAnnouncement:[200,202],publishClassAnnouncement:[200,202],commitRollover:[200,202],issueReviewedParentAccess:[201,200]};
for(const paths of Object.values(spec.paths))for(const op of Object.values(paths))if(synchronousStatuses[op?.operationId]){
 const [actual,original]=synchronousStatuses[op.operationId];
 if(!op.responses[String(original)]?.content?.['application/json'])throw new Error('Missing success envelope '+op.operationId);
 op.responses[String(actual)]=structuredClone(op.responses[String(original)]);
}
extendPublicAnnouncementContract(spec,extendOperation,{object,uuid,label,count,timestamp,operations});
extendConductRuleContract(spec,extendOperation,{object,uuid,label,count,timestamp,operations});
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
