import type {ApiSchemas} from '../../api/generated';
import {RepoError} from '../errors';

const invalid=()=>new RepoError('READ_ERROR','API chưa xác nhận đầy đủ tổng quan trong phạm vi lớp.');
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const text=(v:unknown)=>typeof v==='string'&&!!v.trim();
const nullableText=(v:unknown)=>v===null||text(v);
const count=(v:unknown)=>Number.isInteger(v)&&Number(v)>=0;
const version=(v:unknown)=>count(v)&&Number(v)>0;
const time=(v:unknown)=>typeof v==='string'&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
const timestamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
function exact(value:object,keys:string[]){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw invalid();}
const kinds=['attendance','attendance-finish','attendance-publish','lesson-attendance','conduct-review','conduct-lock','evidence','adjustment','adjustment-publish','groups'] as const;
export const CLASS_OVERVIEW_TASKS={
 attendance:{label:'Điểm danh buổi sáng',unit:'học sinh chưa có buổi điểm danh',status:'Chưa điểm danh',tone:'danger',path:'/attendance'},
 'attendance-finish':{label:'Hoàn tất điểm danh buổi sáng',unit:'học sinh chưa ghi trạng thái',status:'Chưa hoàn tất',tone:'warning',path:'/attendance'},
 'attendance-publish':{label:'Công bố chuyên cần hôm nay',unit:'buổi đã ghi đủ, chưa công bố nguồn hiện tại',status:'Chưa công bố',tone:'warning',path:'/attendance'},
 'lesson-attendance':{label:'Điểm danh các tiết của bạn',unit:'tiết giảng dạy chưa có buổi điểm danh',status:'Chưa điểm danh',tone:'neutral',path:'/attendance'},
 'conduct-review':{label:'Rà soát thi đua',unit:'ghi nhận trong kỳ chưa chốt đang chờ rà soát',status:'Chờ rà soát',tone:'warning',path:'/conduct/review'},
 'conduct-lock':{label:'Chốt thi đua',unit:'kỳ đã đến hạn nhập và chưa chốt',status:'Đến hạn',tone:'danger',path:'/conduct'},
 evidence:{label:'Duyệt minh chứng hoạt động',unit:'minh chứng đang chờ duyệt',status:'Chờ duyệt',tone:'info',path:'/evidence'},
 adjustment:{label:'Điều chỉnh sau chốt',unit:'đề nghị đang chờ duyệt',status:'Chờ duyệt',tone:'warning',path:'/adjustments'},
 'adjustment-publish':{label:'Công bố bản điều chỉnh',unit:'đề nghị đã duyệt, chưa áp dụng và công bố lại',status:'Đã duyệt',tone:'warning',path:'/adjustments'},
 groups:{label:'Xếp tổ cho học sinh',unit:'học sinh chưa phân tổ',status:'Chưa phân tổ',tone:'neutral',path:'/groups'},
} as const;

/** SQL owns scope; this rejects foreign/private/inconsistent purpose receipts. */
export function nativeClassOverview(row:ApiSchemas['ClassWorkspaceOverview'],schoolId:string,yearId:string,classId:string){
 exact(row,['schoolId','yearId','classId','today','referenceDate','asOf','isCurrent','readOnly','permissions','canRecordMorning','allowedTaskKinds','tasks','attendance','lessons','groups','activities','navigation']);
 if(!uuid(schoolId)||!uuid(yearId)||!uuid(classId)||row.schoolId!==schoolId||row.yearId!==yearId||row.classId!==classId||!date(row.today)||!date(row.referenceDate)||!timestamp(row.asOf)||typeof row.isCurrent!=='boolean'||typeof row.readOnly!=='boolean'||row.readOnly&&row.isCurrent||row.isCurrent&&row.today!==row.referenceDate||typeof row.canRecordMorning!=='boolean')throw invalid();
 exact(row.permissions,['attendance','schedule','groups','activities']);
 if(Object.values(row.permissions).some(v=>typeof v!=='boolean')||(row.attendance!==null)!==(row.isCurrent&&row.permissions.attendance)||(row.lessons!==null)!==(row.isCurrent&&row.permissions.schedule)||(row.groups!==null)!==row.permissions.groups||(row.activities!==null)!==row.permissions.activities)throw invalid();
 if(!Array.isArray(row.allowedTaskKinds)||row.allowedTaskKinds.length>10||row.allowedTaskKinds.some(k=>!kinds.includes(k))||new Set(row.allowedTaskKinds).size!==row.allowedTaskKinds.length||!row.isCurrent&&row.allowedTaskKinds.length||JSON.stringify(row.allowedTaskKinds)!==JSON.stringify(kinds.filter(k=>row.allowedTaskKinds.includes(k)))||(row.tasks!==null)!==!!row.allowedTaskKinds.length)throw invalid();
 if(row.tasks!==null){if(!Array.isArray(row.tasks)||row.tasks.length>10)throw invalid();for(const task of row.tasks){exact(task,['kind','count']);if(!row.allowedTaskKinds.includes(task.kind)||!version(task.count))throw invalid();}if(new Set(row.tasks.map(t=>t.kind)).size!==row.tasks.length||JSON.stringify(row.tasks.map(t=>t.kind))!==JSON.stringify(kinds.filter(k=>row.tasks!.some(t=>t.kind===k))))throw invalid();}
 if(row.attendance){const a=row.attendance;exact(a,['calendarState','session','counts']);if(!['HOLIDAY','WITHIN_YEAR'].includes(a.calendarState))throw invalid();
  if(a.session!==null){exact(a.session,['id','version','sourceVersion','status']);if(!uuid(a.session.id)||!version(a.session.version)||!version(a.session.sourceVersion)||!['OPEN','LOCKED','PUBLISHED'].includes(a.session.status)||a.counts===null)throw invalid();}
  if(a.counts!==null){const n=a.counts;exact(n,['total','present','late','excused','unexcused','unmarked']);if(Object.values(n).some(v=>!count(v))||n.present+n.late+n.excused+n.unexcused+n.unmarked!==n.total||a.session===null&&(a.calendarState!=='WITHIN_YEAR'||n.unmarked!==n.total))throw invalid();}
  else if(a.calendarState!=='HOLIDAY'||a.session!==null)throw invalid();
 }
 if(row.canRecordMorning&&(!row.isCurrent||!row.attendance||row.attendance.calendarState!=='WITHIN_YEAR'))throw invalid();
 for(const task of row.tasks??[]){const a=row.attendance;if(task.kind==='attendance'&&(!a||a.calendarState!=='WITHIN_YEAR'||a.session!==null||a.counts?.total!==task.count)||task.kind==='attendance-finish'&&(!a||a.calendarState!=='WITHIN_YEAR'||a.session?.status!=='OPEN'||a.counts?.unmarked!==task.count)||task.kind==='attendance-publish'&&(!a||a.calendarState!=='WITHIN_YEAR'||!a.session||a.session.status==='PUBLISHED'||!a.counts||a.counts.total===0||a.counts.unmarked!==0||task.count!==1)||task.kind==='groups'&&(!row.groups||row.groups.noGroup!==task.count)||task.kind==='lesson-attendance'&&(!row.lessons||task.count>row.lessons.filter(l=>l.status==='SCHEDULED').length))throw invalid();}
 if(row.lessons!==null){if(!Array.isArray(row.lessons)||row.lessons.length>100)throw invalid();for(const l of row.lessons){exact(l,['id','version','periodNumber','startsAtLocal','endsAtLocal','subjectName','teacherName','roomName','status','changeReason']);if(!uuid(l.id)||!version(l.version)||!(l.periodNumber===null||version(l.periodNumber))||!time(l.startsAtLocal)||!time(l.endsAtLocal)||l.endsAtLocal<=l.startsAtLocal||!text(l.subjectName)||!nullableText(l.teacherName)||!nullableText(l.roomName)||!['SCHEDULED','CANCELLED'].includes(l.status)||!nullableText(l.changeReason))throw invalid();}if(new Set(row.lessons.map(l=>l.id)).size!==row.lessons.length)throw invalid();}
 if(row.groups){const g=row.groups;exact(g,['items','totalStudents','noGroup']);if(!count(g.totalStudents)||!count(g.noGroup)||g.noGroup>g.totalStudents||!Array.isArray(g.items)||g.items.length>100)throw invalid();for(const item of g.items){exact(item,['id','name','size']);if(!uuid(item.id)||!text(item.name)||!count(item.size))throw invalid();}if(new Set(g.items.map(item=>item.id)).size!==g.items.length||g.items.reduce((n,item)=>n+item.size,0)+g.noGroup!==g.totalStudents)throw invalid();}
 if(row.activities){const a=row.activities;exact(a,['items','total','hasMore']);if(!count(a.total)||typeof a.hasMore!=='boolean'||!Array.isArray(a.items)||a.items.length!==Math.min(a.total,6)||a.hasMore!==(a.total>a.items.length))throw invalid();for(const item of a.items){exact(item,['id','version','title','dueAt','dueDate','total','done']);if(!uuid(item.id)||!version(item.version)||!text(item.title)||!timestamp(item.dueAt)||!date(item.dueDate)||!count(item.total)||!count(item.done)||item.done>item.total)throw invalid();}if(new Set(a.items.map(item=>item.id)).size!==a.items.length)throw invalid();}
 const paths=['reports','attendance/weekly','conduct','timetable','groups','activities'];
 if(!Array.isArray(row.navigation)||row.navigation.length>6||row.navigation.some(p=>!paths.includes(p))||new Set(row.navigation).size!==row.navigation.length||row.navigation.includes('groups')!==row.permissions.groups||row.navigation.includes('activities')!==row.permissions.activities)throw invalid();
 return row;
}
