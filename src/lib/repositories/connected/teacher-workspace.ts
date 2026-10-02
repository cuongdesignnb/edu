import type {ApiSchemas} from '../../api/generated';
import {http} from '../../api/client';
import type {Ctx} from '../core';
import {RepoError} from '../errors';
import {addDays} from '../../calendar';
import {withStaffAccess} from './common';

const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ công việc và lịch của giáo viên.');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const time=(v:unknown)=>typeof v==='string'&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
const timestamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const text=(v:unknown)=>typeof v==='string'&&!!v.trim();
const nullableText=(v:unknown)=>v===null||text(v);
const count=(v:unknown)=>Number.isInteger(v)&&Number(v)>=0;
function exact(value:object,keys:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw invalid();}
function receipt(row:{schoolId:string;today:string;asOf:string},schoolId:string){if(!uuid(schoolId)||row.schoolId!==schoolId||!date(row.today)||!timestamp(row.asOf))throw invalid();}
function unique(rows:{id:string}[]){if(new Set(rows.map(r=>r.id)).size!==rows.length)throw invalid();}

function lesson(row:ApiSchemas['TeacherWorkspaceLesson'],today:string){
 exact(row,['id','classId','yearId','className','date','periodNumber','startsAtLocal','endsAtLocal','subjectName','roomName','status','changeReason','canAttend']);
 if(!uuid(row.id)||!uuid(row.classId)||!uuid(row.yearId)||!text(row.className)||!date(row.date)||!(row.periodNumber===null||count(row.periodNumber)&&row.periodNumber>0)||!time(row.startsAtLocal)||!time(row.endsAtLocal)||row.endsAtLocal<=row.startsAtLocal||!text(row.subjectName)||!nullableText(row.roomName)||!['SCHEDULED','CANCELLED'].includes(row.status)||!nullableText(row.changeReason)||typeof row.canAttend!=='boolean'||row.canAttend&&(row.status!=='SCHEDULED'||row.date>today))throw invalid();
 return {id:row.id,classId:row.classId,yearId:row.yearId,className:row.className,date:row.date,period:row.periodNumber,start:row.startsAtLocal,end:row.endsAtLocal,subject:row.subjectName,room:row.roomName,
  changed:row.changeReason?{reason:row.changeReason}:undefined,cancelled:row.status==='CANCELLED',canAttend:row.canAttend};
}

function tasks(rows:ApiSchemas['TeacherWorkspaceTask'][],schoolId:string){
 if(!Array.isArray(rows)||rows.length>2000)throw invalid();unique(rows);
 return rows.map(row=>{
  exact(row,['id','kind','title','detail','classId','yearId','className','targetType','targetId','status','tone','dueAt']);
  if(!text(row.id)||!['attendance','conduct','evidence','announcement','groups'].includes(row.kind)||!text(row.title)||!text(row.detail)||!uuid(row.classId)||!uuid(row.yearId)||!text(row.className)||!uuid(row.targetId)||!text(row.status)||!['danger','warning','info','neutral'].includes(row.tone)||!(row.dueAt===null||timestamp(row.dueAt)))throw invalid();
  const expected:Record<string,string>={attendance:'attendance',lesson:'attendance','conduct-period':'conduct',activity:'evidence',announcement:'announcement',adjustment:'conduct',groups:'groups'};
  if(expected[row.targetType]!==row.kind)throw invalid();
  const path={attendance:'/attendance',lesson:`/attendance?slot=lesson-${row.targetId}`, 'conduct-period':row.id.startsWith('conduct-lock:')?'/conduct':'/conduct/review',activity:row.id.startsWith('supplement:')?'/activities':'/evidence',announcement:'/announcements',adjustment:'/adjustments',groups:'/groups'}[row.targetType];
  return {id:row.id,kind:row.kind,title:row.title,detail:row.detail,classId:row.classId,className:row.className,href:`/classroom/${schoolId}/${row.yearId}/${row.classId}${path}`,status:row.status,tone:row.tone,due:row.dueAt??undefined};
 });
}

export function nativeTeacherTasks(row:ApiSchemas['TeacherWorkspaceTasks'],schoolId:string){
 exact(row,['schoolId','today','asOf','tasks']);receipt(row,schoolId);return tasks(row.tasks,schoolId);
}

export function nativeTeacherSchedule(row:ApiSchemas['TeacherWorkspaceSchedule'],schoolId:string,weekStart:string){
 exact(row,['schoolId','today','asOf','weekStart','days']);receipt(row,schoolId);
 if(!date(weekStart)||new Date(weekStart+'T00:00:00Z').getUTCDay()!==1||row.weekStart!==weekStart||!Array.isArray(row.days)||row.days.length!==7)throw invalid();
 const days=row.days.map((day,i)=>{exact(day,['date','holiday','lessons']);if(day.date!==addDays(weekStart,i)||!nullableText(day.holiday)||!Array.isArray(day.lessons)||day.lessons.length>500)throw invalid();unique(day.lessons);
  const mapped=day.lessons.map(l=>{if(l.date!==day.date)throw invalid();return lesson(l,row.today);});return {date:day.date,holiday:day.holiday??undefined,lessons:mapped};});
 if(days.reduce((n,d)=>n+d.lessons.length,0)>500)throw invalid();unique(days.flatMap(d=>d.lessons));
 return {days,monthLessonDays:days.filter(d=>d.lessons.some(l=>!l.cancelled)).map(d=>d.date)};
}

export function nativeTeacherHome(row:ApiSchemas['TeacherWorkspaceHome'],schoolId:string){
 exact(row,['schoolId','today','asOf','membershipId','classes','tasks','unread','feed']);receipt(row,schoolId);
 if(!uuid(row.membershipId)||!count(row.unread)||!Array.isArray(row.classes)||row.classes.length>500||!Array.isArray(row.feed)||row.feed.length>6)throw invalid();unique(row.classes);unique(row.feed);
 const classes=row.classes.map(c=>{
  exact(c,['id','yearId','name','motto','isHomeroom','subjects','size','room','nextLesson','attendance','pendingConduct']);
  if(!uuid(c.id)||!uuid(c.yearId)||!text(c.name)||!(c.motto===null||typeof c.motto==='string')||typeof c.isHomeroom!=='boolean'||!Array.isArray(c.subjects)||c.subjects.length>100||c.subjects.some(s=>!text(s))||new Set(c.subjects).size!==c.subjects.length||!(c.size===null||count(c.size))||!nullableText(c.room)||!(c.pendingConduct===null||count(c.pendingConduct)))throw invalid();
  let attendance:null|{status:'none'|'saved'|'locked'|'published';total:number;present:number;late:number;excused:number;unexcused:number;unmarked:number;presentAll:number}=null;
  if(c.attendance){const a=c.attendance;exact(a,['status','total','present','late','excused','unexcused','unmarked']);if(!c.isHomeroom||!['none','saved','locked','published'].includes(a.status)||[a.total,a.present,a.late,a.excused,a.unexcused,a.unmarked].some(n=>!count(n))||a.total!==a.present+a.late+a.excused+a.unexcused+a.unmarked||a.status==='none'&&a.unmarked!==a.total)throw invalid();attendance={...a,presentAll:a.present+a.late};}
  const nextLesson=c.nextLesson?lesson(c.nextLesson,row.today):null;
  if(nextLesson&&(nextLesson.classId!==c.id||nextLesson.yearId!==c.yearId||nextLesson.className!==c.name||nextLesson.date!==row.today||nextLesson.cancelled))throw invalid();
  return {...c,motto:c.motto??undefined,nextLesson,attendance};
 });
 const mappedTasks=tasks(row.tasks,schoolId);for(const t of mappedTasks)if(!classes.some(c=>c.id===t.classId))throw invalid();
 for(const f of row.feed){exact(f,['id','action','entityLabel','at']);if(!text(f.id)||!text(f.action)||!text(f.entityLabel)||!timestamp(f.at))throw invalid();}
 const homeroom=classes.find(c=>c.isHomeroom)??null,att=homeroom?.attendance,visibleConduct=classes.filter(c=>c.pendingConduct!==null);
 return {classes,tasks:mappedTasks,homeroom,kpi:{presentToday:att?.presentAll??null,sizeHomeroom:homeroom?.size??null,attendanceStatus:att?.status??null,absentToday:att?att.excused+att.unexcused:null,unmarkedToday:att?.unmarked??null,pendingConduct:visibleConduct.length?visibleConduct.reduce((n,c)=>n+c.pendingConduct!,0):null,unread:row.unread},todayLessons:classes.flatMap(c=>c.nextLesson?[c.nextLesson]:[]),feed:row.feed,membershipId:row.membershipId,today:row.today};
}

export const connectedTeacherWorkspaceRepo=withStaffAccess({
 async teacherHome(_ctx:Ctx,schoolId:string){return nativeTeacherHome((await http('getTeacherWorkspaceHome',{params:{schoolId}})).data,schoolId);},
 async teacherTasks(_ctx:Ctx,schoolId:string){return nativeTeacherTasks((await http('getTeacherWorkspaceTasks',{params:{schoolId}})).data,schoolId);},
 async teacherSchedule(_ctx:Ctx,schoolId:string,weekStart:string){return nativeTeacherSchedule((await http('getTeacherWorkspaceSchedule',{params:{schoolId},query:{weekStart}})).data,schoolId,weekStart);},
});
