import type {ApiSchemas} from '../../api/generated';
import type {ID,AcademicYear,ClassRoom} from '../../model/types';
import {inclusiveDate} from '../../api/dates';
import {requiredId,requiredValue} from './common';

export function year(row:ApiSchemas['Year'],schoolId:ID){return {id:requiredId(row.id),schoolId,label:row.name,code:row.code,startDate:row.startsOn,endDate:inclusiveDate(row.endsOn),status:row.status.toLowerCase() as AcademicYear['status'],version:row.version};}
export function term(row:ApiSchemas['Term'],schoolId:ID){return {id:requiredId(row.id),schoolId,yearId:requiredId(row.yearId),name:row.name,code:row.code,startDate:row.startsOn,endDate:inclusiveDate(row.endsOn),openingDate:row.openingDate??undefined,weekCount:row.weekCount,version:row.version};}
export function holiday(row:ApiSchemas['CalendarEvent'],schoolId:ID){return {id:requiredId(row.id),schoolId,yearId:requiredId(row.yearId),name:row.title,startDate:row.startsOn,endDate:inclusiveDate(row.endsOn),version:row.version,status:row.status};}
export function week(row:ApiSchemas['Week'],schoolId:ID,today:string){return {id:requiredId(row.id),schoolId,yearId:requiredId(row.yearId),termId:requiredId(row.termId),index:row.weekNumber,startDate:row.startsOn,endDate:inclusiveDate(row.endsOn),closeDeadline:requiredValue(row.inputDeadlineDay,'inputDeadlineDay')??undefined,locked:requiredValue(row.locked,'locked'),isCurrent:row.startsOn<=today&&row.endsOn>today,version:row.version};}
export function classInfo(row:ApiSchemas['Class'],schoolId:ID){return {id:requiredId(row.id),schoolId,yearId:requiredId(row.yearId),gradeId:requiredId(row.gradeLevelId),name:row.name,capacity:row.capacity,status:row.status.toLowerCase() as ClassRoom['status'],roomId:row.roomId,motto:row.motto??undefined,version:row.version};}
export function classRow(row:ApiSchemas['Class'],schoolId:ID){
  const info=classInfo(row,schoolId),size=requiredValue(row.studentCount,'studentCount'),homeroomName=row.homeroomName??undefined,hasTimetable=requiredValue(row.hasTimetable,'hasTimetable'),inactive=requiredValue(row.inactiveAssignmentCount,'inactiveAssignmentCount');
  const issues:string[]=[];
  if(info.status!=='archived'){if(!homeroomName)issues.push('Chưa có giáo viên chủ nhiệm');if(size===0)issues.push('Chưa có học sinh');if(!hasTimetable)issues.push('Chưa có thời khóa biểu');if(inactive)issues.push(`${inactive} phân công của thành viên đang bị khóa`);}
  return {...info,yearLabel:requiredValue(row.yearName,'yearName'),gradeName:requiredValue(row.gradeName,'gradeName'),size,homeroomName,homeroomUserId:row.homeroomUserId,homeroomMembershipId:row.homeroomMemberId,subjectTeacherCount:requiredValue(row.subjectTeacherCount,'subjectTeacherCount'),roomCode:row.roomCode??undefined,referenceDate:requiredValue(row.referenceDate,'referenceDate'),issues};
}
