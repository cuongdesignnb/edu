import type {Row} from '../../database/database';

export function publicationPolicy(schoolId:string,school:Row){
 const settings=(school.settings??{}) as Record<string,unknown>;
 const sections=(settings.parentSectionsDefault??['teachers','attendance','conduct','timetable','duties','activities','announcements','documents']) as string[];
 return {schoolId,lockBy:settings.conductLockBy??'homeroom',publishBy:settings.conductPublishBy??(settings.homeroomMayPublish===false?'school_leader':'homeroom'),requireLeaderApproval:settings.conductRequireLeaderApproval??false,weekCloseDay:settings.conductWeekCloseDay??'sunday',defaultParentModules:sections.filter(v=>v!=='overview'),attendanceAutoPublish:settings.attendanceAutoPublish??false,version:Number(school.version)};
}

/** An explicit week deadline wins; otherwise use the saved school close day. */
export function conductCloseDeadline(schoolId:string,school:Row,week:Row):string{
 if(week.input_deadline)return new Date(week.input_deadline as Date).toISOString().slice(0,10);
 const days=publicationPolicy(schoolId,school).weekCloseDay==='monday'?0:-1;
 return new Date(Date.parse(String(week.ends_on)+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
}
