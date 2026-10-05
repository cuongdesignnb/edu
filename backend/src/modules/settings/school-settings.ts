import type { Row } from '../../database/database';
import { validateSchema } from '../../common/contract';

export const settingsKeys=['parentLinkTtlDays','parentSectionsDefault','homeroomMayPublish','requireSecondApprovalForAdjustment','attendanceGranularity','reportHeader','shareTeacherPhone','shareTeacherEmail','contactHours','weeklyDeadlineDay','weeklySubmitTime','weeklyLockTime'] as const;
export interface SchoolPreferences {
  parentLinkTtlDays:number;parentSectionsDefault:string[];homeroomMayPublish:boolean;
  requireSecondApprovalForAdjustment:boolean;attendanceGranularity:'DAILY'|'LESSON';
  reportHeader:string;shareTeacherPhone:boolean;shareTeacherEmail:boolean;contactHours:string;
  weeklyDeadlineDay:number;weeklySubmitTime:string;weeklyLockTime:string;
}
export function schoolSettings(row:Row){
  const configured=(row.settings??{}) as Partial<SchoolPreferences>;
  const defaults:SchoolPreferences={parentLinkTtlDays:90,parentSectionsDefault:['overview','teachers','attendance','conduct','timetable','duties','activities','announcements','documents'],homeroomMayPublish:true,requireSecondApprovalForAdjustment:false,attendanceGranularity:'DAILY',reportHeader:String(row.name),shareTeacherPhone:true,shareTeacherEmail:true,contactHours:'',weeklyDeadlineDay:4,weeklySubmitTime:'18:00',weeklyLockTime:'20:00'};
  const values={...defaults,...Object.fromEntries(settingsKeys.filter(key=>Object.hasOwn(configured,key)).map(key=>[key,configured[key]]))} as SchoolPreferences;
  const data={...values,version:Number(row.version),schoolName:String(row.name),timezone:String(row.timezone),academicResultsEnabled:'OFF' as const};
  validateSchema('Settings',data,true);return data;
}
