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
// ADR-004: expose lifecycle metadata needed by the existing assignment UI.
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
spec.info.version = '1.0.0-implementation';
await SwaggerParser.validate(structuredClone(spec));
await fs.mkdir(path.join(root, 'backend/api'), { recursive: true });
await fs.writeFile(path.join(root, 'backend/api/openapi.yaml'), YAML.stringify(spec, { aliasDuplicateObjects: false }));
const operations = JSON.parse(await fs.readFile(path.join(source, 'api/operations.json'), 'utf8'));
const mapping = JSON.parse(await fs.readFile(path.join(source, 'api/frontend-api-map.json'), 'utf8'));
const permissions = JSON.parse(await fs.readFile(path.join(source, 'api/permissions.json'), 'utf8'));
const roles = JSON.parse(await fs.readFile(path.join(source, 'api/role-templates.json'), 'utf8'));
permissions.push('publication.read', 'publication.withdraw');
for (const role of roles.roles) {
  if (['HOMEROOM', 'SUBJECT_TEACHER'].includes(role.code)) role.actions.push('class.read');
  if (role.actions.includes('conduct.read')) role.actions.push('publication.read');
  if (role.code === 'SCHOOL_ADMIN' || role.code === 'SCHOOL_LEADERSHIP') role.actions.push('publication.withdraw');
}
const schemas = {};
for (const [name, schema] of Object.entries(spec.components.schemas)) schemas[name] = schema;
const resolvedOperations = operations.map(op => {
  const actual = spec.paths[op.path.replace(/^\/api\/v1/, '')]?.[op.method.toLowerCase()]
    ?? spec.paths[op.path]?.[op.method.toLowerCase()];
  if (!actual || actual.operationId !== op.id) throw new Error(`Registry mismatch ${op.id}`);
  return { ...op, parameters: actual.parameters ?? [], requestBody: actual.requestBody,
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
try { await fs.access(progressPath); } catch { await fs.writeFile(progressPath, JSON.stringify(progress, null, 2) + '\n'); }
const rows = operations.map(op => `| ${op.id} | ${op.frontend_ids.join(', ')} | NOT_STARTED | |`).join('\n');
try { await fs.access(path.join(root, 'docs/backend-progress.md')); }
catch { await fs.writeFile(path.join(root, 'docs/backend-progress.md'),
  '# Backend operation and screen progress\n\nBaseline `14dfad5`. Runtime evidence is tracked in `backend-progress.json`.\n\n'
  + '| operationId | screenId | Status | Evidence |\n|---|---|---|---|\n' + rows + '\n'); }
console.log(`Validated ${operations.length} operations, ${Object.keys(schemas).length} schemas, ${mapping.length} screen mappings.`);
console.log(`ADR-001: normalized ${emptyRequiredFixed} empty required arrays; source handoff preserved.`);
