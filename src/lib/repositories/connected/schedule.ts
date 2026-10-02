import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import {apiList} from '../../api/lists';
import {addDays,mondayOf} from '../../calendar';
import type {Ctx} from '../core';
import {RepoError} from '../errors';
import {withStaffAccess,displayedVersion,requiredId} from './common';

type Workspace=ApiSchemas['ScheduleWorkspace'];
export type LessonChangeSource=ApiSchemas['ScheduleLessonSource'];
export type ScheduleChange=ApiSchemas['ScheduleLessonChange'];
const invalid=()=>new RepoError('READ_ERROR','Máy chủ chưa xác nhận đầy đủ lịch của phạm vi này.');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function nativeScheduleWorkspace(value:Workspace,schoolId:string,classId?:string,yearId?:string,week?:string){
 if(!value||value.schoolId!==schoolId||classId&&value.classId!==classId||yearId&&value.yearId!==yearId||week&&value.weekStart!==week||mondayOf(value.weekStart)!==value.weekStart||!Array.isArray(value.lessons)||value.lessons.length>5000||!Array.isArray(value.changes)||value.changes.length>2000||!value.options||!Array.isArray(value.options.classes))throw invalid();
 const visible=new Map(value.options.classes.map(cl=>[cl.id,cl]));
 if(classId&&!visible.has(classId)||new Set(value.lessons.map(l=>l.id)).size!==value.lessons.length||new Set(value.changes.map(l=>l.id)).size!==value.changes.length)throw invalid();
 for(const lesson of value.lessons){const cls=visible.get(lesson.classId);if(!uuid(lesson.id)||!cls||lesson.yearId!==cls.yearId||classId&&lesson.classId!==classId||lesson.date<value.weekStart||lesson.date>=addDays(value.weekStart,7)||!Number.isInteger(lesson.period)||lesson.period<1||lesson.end<=lesson.start||Date.parse(lesson.endsAt)<=Date.parse(lesson.startsAt)||lesson.source.lessonId!==lesson.id||lesson.source.lessonVersion!==lesson.version)throw invalid();}
 for(const change of value.changes){const cls=visible.get(change.classId);if(!uuid(change.id)||change.schoolId!==schoolId||!cls||change.yearId!==cls.yearId||classId&&change.classId!==classId||change.date<value.weekStart||change.date>=addDays(value.weekStart,7)||!['draft','published'].includes(change.status)||change.status==='draft'&&(change.source.draftId!==change.id||change.source.draftVersion!==change.version))throw invalid();}
 return value;
}
async function workspace(schoolId:string,query:{classId?:string;yearId?:string;weekStart?:string}={}){return nativeScheduleWorkspace((await http('getScheduleWorkspace',{params:{schoolId},query})).data,schoolId,query.classId,query.yearId,query.weekStart);}
function sourceRequired(source:LessonChangeSource|undefined){if(!source||!uuid(source.lessonId)||!Number.isInteger(source.lessonVersion)||source.lessonVersion<1)throw new RepoError('CONFLICT','Hãy tải lại tiết học trước khi sửa để giữ đúng dữ liệu nguồn.');return source;}
function actionSource(change:ScheduleChange|undefined){if(!change||change.status!=='draft'||!change.source.draftId||!change.source.draftVersion)throw new RepoError('CONFLICT','Hãy tải lại bản nháp trước khi thao tác.');return {classId:change.classId,source:sourceRequired(change.source),expectedVersion:displayedVersion(change.version),expectedPublicationId:change.publicationId};}
const classResult=(d:Workspace)=>({monday:d.weekStart,days:Array.from({length:7},(_,i)=>{const date=addDays(d.weekStart,i);return {date,holiday:d.holidays.filter(h=>(h.classId===null||h.classId===d.classId)&&h.startsOn<=date&&h.endsOn>date).map(h=>h.name).join(' · ')||undefined,lessons:d.lessons.filter(l=>l.date===date)};}),changes:d.changes,canEdit:d.canEdit,canPublish:d.canPublish,publicationId:d.publicationId,week:null as {index:number}|null,options:d.options});
export function scheduleClashes(lessons:Workspace['lessons']){
 const clashes:string[]=[];
 for(let i=0;i<lessons.length;i++)for(let j=i+1;j<lessons.length;j++){
  const a=lessons[i],b=lessons[j];if(a.cancelled||b.cancelled||a.classId===b.classId||a.endsAt<=b.startsAt||b.endsAt<=a.startsAt)continue;
  if(a.teacherMembershipId===b.teacherMembershipId)clashes.push(`${a.date}: ${a.teacher} trùng giờ tại ${a.className}, ${b.className}`);
  if(a.roomId&&a.roomId===b.roomId)clashes.push(`${a.date}: Phòng ${a.room} trùng giờ tại ${a.className}, ${b.className}`);
 }return clashes;
}

export const connectedScheduleClassroomRepo=withStaffAccess({
 async timetable(_ctx:Ctx,schoolId:string,yearId:string,classId:string,weekStart?:string){return classResult(await workspace(schoolId,{yearId,classId,weekStart}));},
 async schoolTimetable(_ctx:Ctx,schoolId:string,filter:{classId?:string;membershipId?:string;roomId?:string;weekStart:string}){
  const d=await workspace(schoolId,{classId:filter.classId,weekStart:filter.weekStart}),cells=d.lessons.filter(l=>(!filter.membershipId||l.teacherMembershipId===filter.membershipId)&&(!filter.roomId||l.roomId===filter.roomId));
  return {days:Array.from({length:7},(_,i)=>addDays(d.weekStart,i)),cells,clashes:scheduleClashes(d.lessons),options:d.options,canManage:d.canManage,canPublish:d.canPublish};
 },
 async checkLessonChange(_ctx:Ctx,schoolId:string,input:{classId:string;date:string;period:number;teacherMembershipId?:string;roomId?:string;subjectId?:string}){return (await http('checkScheduleLessonChange',{params:{schoolId},body:{classId:input.classId,date:input.date,period:input.period,teacherMembershipId:input.teacherMembershipId??null,roomId:input.roomId??null,subjectId:input.subjectId??null}})).data.conflicts;},
 async saveLessonChange(_ctx:Ctx,schoolId:string,input:{classId:string;date:string;period:number;kind:'swap'|'substitute'|'room'|'cancel';subjectId?:string;teacherMembershipId?:string;roomId?:string;reason:string;publish:boolean;source?:LessonChangeSource;expectedPublicationId?:string|null}){
  return (await http('saveScheduleLessonChange',{params:{schoolId},body:{classId:input.classId,date:input.date,period:input.period,kind:input.kind,subjectId:input.subjectId??null,teacherMembershipId:input.teacherMembershipId??null,roomId:input.roomId??null,reason:input.reason,publish:input.publish,source:sourceRequired(input.source),expectedPublicationId:input.expectedPublicationId??null}})).data;
 },
 async publishLessonChange(_ctx:Ctx,schoolId:string,changeId:string,change?:ScheduleChange){return (await http('publishScheduleLessonChange',{params:{schoolId,changeId},body:actionSource(change)})).data;},
 async deleteDraftChange(_ctx:Ctx,schoolId:string,changeId:string,change?:ScheduleChange){return (await http('discardScheduleLessonChange',{params:{schoolId,changeId},body:actionSource(change)})).data.discarded;},
 async timetableDrafts(_ctx:Ctx,schoolId:string,classId:string,weekStart?:string){
  const d=await workspace(schoolId,{classId,weekStart});if(!d.canEdit)throw new RepoError('FORBIDDEN','Bạn không có quyền quản lý thời khóa biểu lớp này.');
  const schedules=await apiList('listClassTimetables',{params:{schoolId,classId},query:{sort:'createdAt',dir:'desc'}},100),cls=d.options.classes.find(cl=>cl.id===classId)!;
  return {schedules:schedules.filter(s=>s.status!=='ARCHIVED'),classId,yearId:requiredId(d.yearId),today:d.today,startsOn:cls.startsOn,endsOn:cls.endsOn,publicationId:d.publicationId,canPublish:d.canPublish,options:d.options};
 },
 async saveTimetableDraft(_ctx:Ctx,schoolId:string,classId:string,input:{id?:string;version?:number;startsOn:string;endsOn:string;entries:ApiSchemas['TimetableEntry'][]}){
  return input.id?(await http('updateTimetable',{params:{schoolId,classId,timetableId:input.id},body:{expectedVersion:displayedVersion(input.version),startsOn:input.startsOn,endsOn:input.endsOn,entries:input.entries}})).data:(await http('createTimetable',{params:{schoolId,classId},body:{startsOn:input.startsOn,endsOn:input.endsOn,entries:input.entries}})).data;
 },
 async validateTimetableDraft(_ctx:Ctx,schoolId:string,classId:string,source:ApiSchemas['Timetable']){const params={schoolId,classId,timetableId:requiredId(source.id)},validation=(await http('validateTimetable',{params,body:{expectedVersion:displayedVersion(source.version)}})).data;return {validation,source:(await http('getTimetable',{params})).data};},
 async publishTimetableDraft(_ctx:Ctx,schoolId:string,classId:string,source:ApiSchemas['Timetable'],publicationId:string|null){return (await http('publishTimetable',{params:{schoolId,classId,timetableId:requiredId(source.id)},body:{expectedSourceVersion:displayedVersion(source.dataVersion),expectedPublicationId:publicationId}})).data;},
 async discardTimetableDraft(_ctx:Ctx,schoolId:string,classId:string,source:ApiSchemas['Timetable']){return (await http('discardTimetable',{params:{schoolId,classId,timetableId:requiredId(source.id)},body:{expectedVersion:displayedVersion(source.version)}})).data;},
});
export const connectedScheduleSchoolOpsRepo=withStaffAccess({
 async lessonSlot(_ctx:Ctx,schoolId:string,classId:string,date:string,period:number){const d=await workspace(schoolId,{classId,weekStart:mondayOf(date)}),cls=d.options.classes.find(c=>c.id===classId)!;if(!d.canEdit)throw new RepoError('FORBIDDEN','Bạn không có quyền đổi tiết lớp này.');const lesson=d.lessons.find(l=>l.date===date&&l.period===period)??null;return {className:cls.name,yearId:cls.yearId,date,period,start:lesson?.start,end:lesson?.end,isPast:date<d.today,today:d.today,lesson,draft:d.changes.find(ch=>ch.status==='draft'&&ch.date===date&&ch.period===period)??null,options:d.options,publicationId:d.publicationId,canPublish:d.canPublish};},
 async weekLessonChanges(_ctx:Ctx,schoolId:string,weekStart:string){return (await workspace(schoolId,{weekStart})).changes;},
});
