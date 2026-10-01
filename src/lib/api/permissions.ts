import type {ActionKey} from '../model/types';
import type {ApiSchemas} from './generated';

/** Existing Vietnamese UI capabilities map to actions held together by one server grant. */
export const UI_ACTIONS:Record<ActionKey,readonly string[]>={
  'school.view':['school.read'],'school.profile.edit':['school.settings'],'school.settings.edit':['school.settings'],
  'year.manage':['year.manage'],'class.manage':['class.manage'],'dictionary.manage':['dictionary.manage'],
  'staff.view':['member.read'],'staff.invite':['member.manage'],'staff.suspend':['member.manage'],
  'assignment.manage':['assignment.manage'],'role.manage':['role.manage'],
  'student.view.all':['student.read'],'student.edit':['student.manage'],'student.transfer':['student.transfer'],
  'guardian.manage.all':['guardian.manage'],'parentAccess.manage.all':['parent_access.manage'],
  'import.run':['import.manage'],'rules.manage':['rules.manage'],'policy.manage':['school.settings'],
  'timetable.manage':['schedule.manage'],'announcement.school':['announcement.manage'],'publication.oversee':['conduct.read'],
  'report.school':['report.read'],'export.run':['report.export'],'audit.view':['audit.read'],'support.manage':['support.manage'],
  'class.view':['class.read'],'roster.view':['student.read'],'student.profile.view':['student.read'],
  'guardian.view':['guardian.read'],'guardian.edit':['guardian.manage'],'parentAccess.issue':['parent_access.issue'],
  'attendance.record':['attendance.record'],'attendance.publish':['attendance.publish'],
  'conduct.record':['conduct.record'],'conduct.review':['conduct.review'],'conduct.lock':['conduct.lock'],'conduct.publish':['conduct.publish'],
  'adjustment.request':['conduct.adjust.request'],'adjustment.approve':['conduct.adjust.approve'],
  'groups.manage':['group.manage'],'seating.manage':['seating.manage'],'timetable.edit':['schedule.manage'],
  'duty.manage':['duty.manage'],'activity.manage':['activity.manage'],'evidence.manage':['evidence.manage'],
  'announcement.class':['announcement.manage'],'files.manage':['file.manage'],'report.class':['report.read'],'report.export':['report.export'],
};
export interface UiScope {schoolId:string;classId?:string;subjectId?:string;date?:string}
/** Advisory read capability for DTO panels without a legacy UI action key. */
export function hasSchoolApiAction(context:ApiSchemas['Context'],schoolId:string,action:string):boolean{
  const member=context.memberships.find(m=>m.schoolId===schoolId),now=Date.parse(context.serverNow);
  return !!member&&member.status==='ACTIVE'&&member.schoolStatus==='ACTIVE'&&member.grants.some(grant=>grant.scopeType==='SCHOOL'&&!grant.revokedAt&&Date.parse(grant.validFrom)<=now&&(!grant.validUntil||now<Date.parse(grant.validUntil))&&grant.actions.includes(action));
}
export function uiActions(context:ApiSchemas['Context'],scope:UiScope):Set<ActionKey>{
  const member=context.memberships.find(m=>m.schoolId===scope.schoolId),result=new Set<ActionKey>();
  if(!member||member.status!=='ACTIVE'||member.schoolStatus!=='ACTIVE')return result;
  const reference=scope.date??member.today;
  for(const grant of member.grants){
    if(grant.revokedAt||Date.parse(grant.validFrom)>Date.parse(context.serverNow)||grant.validUntil&&Date.parse(grant.validUntil)<=Date.parse(context.serverNow))continue;
    if(grant.scopeType!=='SCHOOL'){
      if(!scope.classId||grant.classId!==scope.classId)continue;
      if(grant.scopeType==='SUBJECT'&&scope.subjectId&&grant.subjectId!==scope.subjectId)continue;
      if(['HOMEROOM','SUBJECT_TEACHER'].includes(grant.roleCode??'')&&(!grant.assignmentStartsOn||reference<grant.assignmentStartsOn||grant.assignmentEndsOn&&reference>=grant.assignmentEndsOn))continue;
    }
    for(const [key,actions]of Object.entries(UI_ACTIONS))if(actions.every(action=>grant.actions.includes(action)))result.add(key as ActionKey);
  }
  return result;
}
