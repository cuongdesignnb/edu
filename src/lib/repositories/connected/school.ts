import type {ID,School,SchoolSettings} from '../../model/types';
import type {Ctx,ListQuery} from '../core';
import type {ApiSchemas} from '../../api/generated';
import {http,captureStaffAccess} from '../../api/client';
import {apiList,apiPage} from '../../api/lists';
import {refreshStaffContext,serverToday} from '../../api/session';
import {exclusiveDate} from '../../api/dates';
import {year,term,holiday,week,classRow,classInfo} from './organization-mapping';
import {uiActions,hasSchoolApiAction} from '../../api/permissions';
import {RepoError} from '../errors';
import {formResult,requiredId,requiredValue,withStaffAccess,displayedVersion,commandReason} from './common';
import {readRolloverPreview,applyRollover,type RolloverDecision} from './rollover';

function school(row:ApiSchemas['School']){
  return {id:requiredId(row.id),name:row.name,code:row.code,slug:row.slug,shortName:requiredValue(row.shortName,'shortName'),status:row.status.toLowerCase() as School['status'],level:row.level??null,province:requiredValue(row.province,'province'),address:row.publicAddress??'',publicEmail:row.publicContactEmail??'',publicPhone:row.publicContactPhone??'',website:row.website??undefined,accentColor:requiredValue(row.accentColor,'accentColor'),motto:requiredValue(row.motto,'motto'),publicIntro:requiredValue(row.publicIntro,'publicIntro'),version:row.version,createdAt:row.createdAt,activatedAt:row.activatedAt??undefined,statusReason:row.statusReason??undefined,onboarding:row.onboarding};
}
export {school as mapSchool};
function settings(row:ApiSchemas['Settings'],schoolId:ID){
  return {weeklyDeadlineDay:row.weeklyDeadlineDay??4,weeklySubmitTime:row.weeklySubmitTime??'18:00',weeklyLockTime:row.weeklyLockTime??'20:00',schoolId,language:'vi' as const,timezone:row.timezone,linkDefaultDays:row.parentLinkTtlDays,reportHeader:requiredValue(row.reportHeader,'reportHeader'),shareTeacherPhone:requiredValue(row.shareTeacherPhone,'shareTeacherPhone'),shareTeacherEmail:requiredValue(row.shareTeacherEmail,'shareTeacherEmail'),contactHours:requiredValue(row.contactHours,'contactHours'),version:row.version};
}
type DictionaryKind='grade'|'subject'|'room';
const paths={grade:'grades',subject:'subjects',room:'rooms'} as const;
function dictionary(row:ApiSchemas['DictionaryItem'],schoolId:ID){return {id:requiredId(row.id),schoolId,code:row.code,name:row.name,status:row.status==='ACTIVE'?'active' as const:'inactive' as const,version:row.version,inUse:row.inUse,level:row.gradeLevel??null,color:row.color,capacity:row.capacity??null};}
const version=displayedVersion;
const reason=commandReason;
function confirmed(row:{id?:string|null;version?:number;status?:string}|null|undefined,id?:string,previous?:number,status?:string){
  return !!row&&(!id||row.id===id)&&Number.isInteger(row.version)&&row.version!>(previous??0)&&(!status||row.status===status);
}

export const connectedSchoolRepo=withStaffAccess({
  async context(_ctx:Ctx,schoolId:ID){
    const context=await refreshStaffContext(),member=context.memberships.find(m=>m.schoolId===schoolId);
    if(!member||member.status!=='ACTIVE')throw new RepoError('REVOKED');
    const canReadProfile=hasSchoolApiAction(context,schoolId,'school.read'),canReadYears=hasSchoolApiAction(context,schoolId,'year.read');
    const [profile,rows]=await Promise.all([canReadProfile?http('getSchoolProfile',{params:{schoolId}}):null,canReadYears?apiList('listYears',{params:{schoolId},query:{sort:'startsOn',dir:'desc'}},100):null]);
    const basic={id:requiredId(member.schoolId),name:member.schoolName,code:null,slug:member.schoolSlug,shortName:member.schoolShortName,status:member.schoolStatus.toLowerCase() as School['status'],level:null,province:null,address:null,publicEmail:null,publicPhone:null,website:null,accentColor:null,motto:null,publicIntro:null,version:null,createdAt:null,activatedAt:null,statusReason:null,onboarding:null};
    return {school:profile?school(profile.data):basic,years:rows===null?null:rows.map(row=>year(row,schoolId)),yearMetadataAvailable:canReadYears,currentYearId:rows?.find(row=>row.status==='ACTIVE')?.id??undefined,
      roleNames:[...new Set(member.grants.filter(g=>g.scopeType==='SCHOOL').map(g=>g.roleLabel))],membershipId:requiredId(member.memberId)};
  },
  async profile(_ctx:Ctx,schoolId:ID){const [value,context]=await Promise.all([http('getSchoolProfile',{params:{schoolId}}),refreshStaffContext()]);return {school:school(value.data),canEdit:uiActions(context,{schoolId}).has('school.profile.edit')};},
  async saveProfile(_ctx:Ctx,schoolId:ID,patch:Pick<School,'shortName'|'motto'|'publicIntro'|'publicPhone'|'publicEmail'|'address'|'website'|'accentColor'>&{version:number}){
    const value=await formResult(http('updateSchoolProfile',{params:{schoolId},validateData:row=>confirmed(row,schoolId,version(patch.version)),body:{expectedVersion:version(patch.version),shortName:patch.shortName,motto:patch.motto,publicIntro:patch.publicIntro,publicContactPhone:patch.publicPhone||null,publicContactEmail:patch.publicEmail||null,publicAddress:patch.address||null,website:patch.website||null,accentColor:patch.accentColor}}),{expectedVersion:'version',publicContactPhone:'publicPhone',publicContactEmail:'publicEmail',publicAddress:'address'});return school(value.data);
  },
  async settings(_ctx:Ctx,schoolId:ID){const [value,context]=await Promise.all([http('getSchoolSettings',{params:{schoolId}}),refreshStaffContext()]);return {settings:settings(value.data,schoolId),canEdit:uiActions(context,{schoolId}).has('school.settings.edit')};},
  async saveSettings(_ctx:Ctx,schoolId:ID,patch:Omit<SchoolSettings,'schoolId'|'language'|'timezone'>){
    const value=await formResult(http('updateSchoolSettings',{params:{schoolId},validateData:row=>confirmed(row,undefined,version(patch.version)),body:{expectedVersion:version(patch.version),parentLinkTtlDays:patch.linkDefaultDays,reportHeader:patch.reportHeader,shareTeacherPhone:patch.shareTeacherPhone,shareTeacherEmail:patch.shareTeacherEmail,contactHours:patch.contactHours,weeklyDeadlineDay:patch.weeklyDeadlineDay,weeklySubmitTime:patch.weeklySubmitTime,weeklyLockTime:patch.weeklyLockTime}}),{expectedVersion:'version',parentLinkTtlDays:'linkDefaultDays'});return settings(value.data,schoolId);
  },
  async dictionaries(_ctx:Ctx,schoolId:ID){
    const [grades,subjects,rooms,context]=await Promise.all([apiList('listDictionary',{params:{schoolId,dictionary:'grades'}},100),apiList('listDictionary',{params:{schoolId,dictionary:'subjects'}},500),apiList('listDictionary',{params:{schoolId,dictionary:'rooms'}},500),refreshStaffContext()]);
    const map=(row:ApiSchemas['DictionaryItem'])=>{if(typeof row.inUse!=='boolean')throw new RepoError('READ_ERROR','Danh mục chưa trả thông tin sử dụng theo hợp đồng.');return dictionary(row,schoolId);};
    return {grades:grades.map(map),subjects:subjects.map(map),rooms:rooms.map(map),canManage:uiActions(context,{schoolId}).has('dictionary.manage')};
  },
  async saveDictionaryItem(_ctx:Ctx,schoolId:ID,kind:DictionaryKind,item:{id?:ID;name:string;code?:string;level?:number;color?:string;capacity?:number;version?:number}){
    if(kind==='grade'&&(!Number.isInteger(item.level)||item.level!<1||item.level!>12))throw new RepoError('VALIDATION','Khối học chưa hợp lệ.',{fieldErrors:{level:'Khối phải từ 1 đến 12.'}});
    const dictionaryPath=paths[kind];
    const fields={name:item.name,...(kind==='grade'?{code:String(item.level),gradeLevel:item.level}:{code:item.code??''}),...(kind==='subject'&&item.color!==undefined?{color:item.color}:{}),...(kind==='room'&&item.capacity!==undefined?{capacity:item.capacity}:{})};
    const write=item.id?http('updateDictionary',{params:{schoolId,dictionary:dictionaryPath,itemId:item.id},body:{...fields,expectedVersion:version(item.version)},validateData:row=>confirmed(row,item.id,item.version)}):http('createDictionary',{params:{schoolId,dictionary:dictionaryPath},body:fields,validateData:row=>confirmed(row)&&!!row.id});const value=await formResult(write,{expectedVersion:'version',gradeLevel:'level'});return dictionary(value.data,schoolId);
  },
  async setDictionaryStatus(_ctx:Ctx,schoolId:ID,kind:DictionaryKind,itemId:ID,status:'active'|'inactive',expectedVersion?:number){
    const value=await http('updateDictionary',{params:{schoolId,dictionary:paths[kind],itemId},body:{expectedVersion:version(expectedVersion),status:status==='active'?'ACTIVE':'ARCHIVED'},validateData:row=>confirmed(row,itemId,expectedVersion,status==='active'?'ACTIVE':'ARCHIVED')});return dictionary(value.data,schoolId);
  },
  async years(_ctx:Ctx,schoolId:ID){return (await apiList('listYears',{params:{schoolId},query:{sort:'startsOn',dir:'desc'}},100)).map(row=>({...year(row,schoolId),terms:requiredValue(row.terms,'terms').map(t=>term(t,schoolId)),classCount:requiredValue(row.classCount,'classCount'),studentCount:requiredValue(row.studentCount,'studentCount')}));},
  async createYear(_ctx:Ctx,schoolId:ID,input:{label:string;startDate:string;endDate:string;terms:{name:string;startDate:string;endDate:string;openingDate?:string}[];holidays:{name:string;startDate:string;endDate:string}[];copyRules:boolean}){
    if(!/^\d{4}–\d{4}$/.test(input.label))throw new RepoError('VALIDATION','Định dạng năm học chưa hợp lệ.',{fieldErrors:{label:'Định dạng năm học: 2027–2028'}});
    const result=await formResult(http('createYear',{params:{schoolId},validateData:row=>confirmed(row)&&!!row.id&&row.status==='DRAFT'&&!!row.setup,body:{code:input.label.replace('–','-'),name:input.label,startsOn:input.startDate,endsOn:exclusiveDate(input.endDate),terms:input.terms.map((t,i)=>({code:`TERM-${i+1}`,name:t.name,startsOn:t.startDate,endsOn:exclusiveDate(t.endDate),openingDate:t.openingDate})),holidays:input.holidays.map(h=>({title:h.name,startsOn:h.startDate,endsOn:exclusiveDate(h.endDate)})),copyRules:input.copyRules}}),{name:'label',code:'label',startsOn:'startDate',endsOn:'endDate',title:'name'});return {id:requiredId(result.data.id),setup:requiredValue(result.data.setup,'setup')};
  },
  async updateTerm(_ctx:Ctx,schoolId:ID,termId:ID,patch:{name:string;startDate:string;endDate:string;openingDate?:string;version?:number}){
    const result=await formResult(http('updateTerm',{params:{schoolId,termId},body:{expectedVersion:version(patch.version),name:patch.name,startsOn:patch.startDate,endsOn:exclusiveDate(patch.endDate),openingDate:patch.openingDate??null},validateData:row=>confirmed(row,termId,patch.version)}),{expectedVersion:'version',startsOn:'startDate',endsOn:'endDate'});return term(result.data,schoolId);
  },
  async updateWeekDeadline(_ctx:Ctx,schoolId:ID,weekId:ID,closeDeadline:string,expectedVersion?:number){
    const result=await formResult(http('updateWeek',{params:{schoolId,weekId},body:{expectedVersion:version(expectedVersion),inputDeadlineDay:closeDeadline},validateData:row=>confirmed(row,weekId,expectedVersion)}),{expectedVersion:'version',inputDeadlineDay:'closeDeadline',inputDeadline:'closeDeadline'});return {id:requiredId(result.data.id),index:result.data.weekNumber,closeDeadline,version:result.data.version};
  },
  async addHoliday(_ctx:Ctx,schoolId:ID,yearId:ID,input:{name:string;startDate:string;endDate:string}){
    const created=await formResult(http('createCalendarEvent',{params:{schoolId},body:{yearId,title:input.name,kind:'HOLIDAY',startsOn:input.startDate,endsOn:exclusiveDate(input.endDate),status:'PUBLISHED'},validateData:row=>confirmed(row)&&!!row.id&&row.yearId===yearId&&row.status==='PUBLISHED'}),{title:'name',startsOn:'startDate',endsOn:'endDate'});return holiday(created.data,schoolId);
  },
  async removeHoliday(_ctx:Ctx,schoolId:ID,holidayId:ID,expectedVersion?:number,explanation?:string){await http('updateCalendarEvent',{params:{schoolId,eventId:holidayId},body:{expectedVersion:version(expectedVersion),status:'WITHDRAWN',reason:reason(explanation)},validateData:row=>confirmed(row,holidayId,expectedVersion,'WITHDRAWN')});return true;},
  async setYearStatus(_ctx:Ctx,schoolId:ID,yearId:ID,status:'active'|'archived',expectedVersion?:number,explanation?:string){
    const result=status==='active'?await http('activateYear',{params:{schoolId,yearId},body:{expectedVersion:version(expectedVersion)},validateData:row=>confirmed(row,yearId,expectedVersion,'ACTIVE')}):await http('archiveYear',{params:{schoolId,yearId},body:{expectedVersion:version(expectedVersion),reason:reason(explanation)},validateData:row=>confirmed(row,yearId,expectedVersion,'ARCHIVED')});return year(result.data,schoolId);
  },
  async classes(_ctx:Ctx,schoolId:ID,q:ListQuery){
    const filters=q.filters??{},sort=q.sort==='size'?'studentCount':q.sort==='homeroom'?'homeroomName':q.sort??'name';
    return apiPage('listClasss',{params:{schoolId},query:{q:q.q,yearId:filters.yearId,gradeLevelId:filters.gradeId,status:filters.status?.toUpperCase(),sort,dir:q.dir,...(filters.homeroom==='none'?{homeroom:'none'}:filters.homeroom?{homeroomUserId:filters.homeroom}:{})}},q,row=>classRow(row,schoolId));
  },
  async classOptions(_ctx:Ctx,schoolId:ID,yearId?:ID){
    if(!yearId){const years=await apiList('listYears',{params:{schoolId},query:{status:'ACTIVE'}},100);yearId=years[0]?.id??undefined;}
    if(!yearId)return [];
    return (await apiList('listClasss',{params:{schoolId},query:{yearId,sort:'name'}},200)).map(row=>({id:requiredId(row.id),name:row.name,status:row.status.toLowerCase() as 'draft'|'active'|'archived',gradeId:requiredId(row.gradeLevelId)}));
  },
  async formOptions(_ctx:Ctx,schoolId:ID){
    const context=await refreshStaffContext(),actions=uiActions(context,{schoolId}),canAssign=actions.has('assignment.manage'),canManageClasses=actions.has('class.manage');
    if(!canAssign&&!canManageClasses)throw new RepoError('FORBIDDEN');
    const purpose=canManageClasses?'class-picker' as const:'assignment-picker' as const;
    const [years,grades,rooms,subjects,teachers]=await Promise.all([apiList('listYears',{params:{schoolId},query:{purpose,sort:'startsOn',dir:'desc'}},100),apiList('listDictionary',{params:{schoolId,dictionary:'grades'},query:{purpose,sort:'code'}},100),apiList('listDictionary',{params:{schoolId,dictionary:'rooms'},query:{purpose,sort:'code'}},500),canAssign?apiList('listDictionary',{params:{schoolId,dictionary:'subjects'},query:{purpose:'assignment-picker',sort:'code'}},500):undefined,canAssign?apiList('listMembers',{params:{schoolId},query:{purpose:'assignment-picker',sort:'workDisplayName'}},500):undefined]);
    return {years:years.map(y=>year(y,schoolId)),grades:grades.map(g=>dictionary(g,schoolId)),rooms:rooms.map(r=>dictionary(r,schoolId)),subjects:subjects?.map(s=>dictionary(s,schoolId)),teachers:teachers?.map(m=>({membershipId:requiredId(m.id),userId:requiredId(m.userId),name:m.workDisplayName,department:m.department??'',homeroomOf:requiredValue(m.homeroomOf,'homeroomOf')})),canAssign,canManageClasses};
  },
  async saveClass(_ctx:Ctx,schoolId:ID,input:{id?:ID;yearId:ID;gradeId:ID;name:string;capacity:number;roomId?:ID;motto?:string;homeroomMembershipId?:ID;version?:number}){
    const name=input.name.trim().toUpperCase(),body={name,gradeLevelId:input.gradeId,capacity:input.capacity,roomId:input.roomId??null,motto:input.motto,homeroomMemberId:input.homeroomMembershipId};
    const validateData=(row:ApiSchemas['Class'])=>confirmed(row,input.id,input.version)&&!!row.id&&row.name===name&&row.yearId===input.yearId&&row.gradeLevelId===input.gradeId&&row.capacity===input.capacity&&(!!input.id||row.status==='DRAFT');
    const write=input.id?http('updateClass',{params:{schoolId,classId:input.id},body:{...body,expectedVersion:version(input.version)},validateData}):http('createClass',{params:{schoolId},body:{...body,code:name,yearId:input.yearId},validateData});
    return {...classInfo((await formResult(write,{gradeLevelId:'gradeId',expectedVersion:'version',homeroomMemberId:'homeroomMembershipId'})).data,schoolId),...(!input.id?{homeroomAssigned:!!input.homeroomMembershipId}:{})};
  },
  async setClassStatus(_ctx:Ctx,schoolId:ID,classId:ID,status:'draft'|'active'|'archived',expectedVersion?:number,explanation?:string){
    const options={params:{schoolId,classId},body:{expectedVersion:version(expectedVersion)},validateData:(row:ApiSchemas['Class'])=>confirmed(row,classId,expectedVersion,status.toUpperCase())};
    const value=status==='active'?await http('activateClass',options):status==='archived'?await http('archiveClass',{...options,body:{...options.body,reason:reason(explanation)}}):await http('updateClass',{...options,body:{...options.body,status:'DRAFT'}});return classInfo(value.data,schoolId);
  },
  async yearDetail(_ctx:Ctx,schoolId:ID,yearId:ID){
    const context=await refreshStaffContext(),actions=uiActions(context,{schoolId}),canReadClasses=actions.has('class.view'),canManageClasses=actions.has('class.manage');
    const [value,weekRows,holidayRows,classes,grades]=await Promise.all([
      http('getYear',{params:{schoolId,yearId}}),
      apiList('listWeeks',{params:{schoolId},query:{yearId,sort:'weekNumber'}},110),
      apiList('listCalendarEvents',{params:{schoolId},query:{yearId,status:'PUBLISHED',sort:'startsOn'}},100),
      canReadClasses?apiList('listClasss',{params:{schoolId},query:{yearId,sort:'name'}},200):undefined,
      canManageClasses||hasSchoolApiAction(context,schoolId,'dictionary.read')?apiList('listDictionary',{params:{schoolId,dictionary:'grades'},query:canManageClasses?{purpose:'class-picker'}:{}},100):undefined,
    ]);
    const rows=classes?.map(c=>classRow(c,schoolId)),gradeRows=grades?.map(g=>dictionary(g,schoolId));
    // Class readers group only returned classes; they do not borrow dictionary or class-management authority.
    const groups=rows?new Map<string,{grade:{id:string;name:string;status?:'active'|'inactive'};classes:typeof rows}>():null;
    if(groups){for(const grade of gradeRows??[])if(grade.status==='active')groups.set(grade.id,{grade,classes:[]});
      for(const row of rows!){if(!groups.has(row.gradeId))groups.set(row.gradeId,{grade:gradeRows?.find(g=>g.id===row.gradeId)??{id:row.gradeId,name:row.gradeName},classes:[]});groups.get(row.gradeId)!.classes.push(row);}}
    return {year:year(value.data,schoolId),terms:requiredValue(value.data.terms,'terms').map(t=>term(t,schoolId)),weeks:weekRows.map(w=>week(w,schoolId,serverToday(schoolId))),holidays:holidayRows.map(h=>holiday(h,schoolId)),grades:gradeRows??null,classesByGrade:groups?[...groups.values()]:null,assignedHomeroom:rows?.filter(c=>c.homeroomName).length??null,totalClasses:rows?.length??null,canManage:actions.has('year.manage'),canManageClasses};
  },
  async weekOf(_ctx:Ctx,schoolId:ID,date:string){
    const [years]=await Promise.all([apiList('listYears',{params:{schoolId},query:{status:'ACTIVE'}},100),refreshStaffContext()]),yearId=years[0]?.id;if(!yearId)return null;
    const rows=await apiList('listWeeks',{params:{schoolId},query:{yearId,onDate:date}},1);return rows.length?week(rows[0],schoolId,serverToday(schoolId)):null;
  },
  async rolloverPreview(_ctx:Ctx,schoolId:ID,fromYearId:ID){return readRolloverPreview(schoolId,fromYearId);},
  async rolloverApply(_ctx:Ctx,schoolId:ID,fromYearId:ID,toYearId:ID,decisions:RolloverDecision[]){return applyRollover(schoolId,fromYearId,toYearId,decisions);},
  async overview(_ctx:Ctx,schoolId:ID,yearId:ID){
    const access=captureStaffAccess(),response=(await http('getSchoolOverview',{params:{schoolId},query:{yearId}})).data;access.assertCurrent();
    const value=requiredValue(response.schoolOverview,'schoolOverview');if(!value.year||value.year.id!==yearId)throw new RepoError('READ_ERROR','Tổng quan không thuộc năm học đã chọn.');
    for(const key of ['activeClasses','draftClasses','prevClasses','staffActive','students','prevStudents','linksActive','linksOpened'] as const)requiredValue(value.kpi[key],key);
    return {year:year(value.year,schoolId),prevYear:value.prevYear?year(value.prevYear,schoolId):undefined,kpi:value.kpi,setup:value.setup,classesNeedingAction:requiredValue(value.classesNeedingAction,'classesNeedingAction')?.map(row=>({...classRow(row,schoolId),tasks:row.tasks,severity:row.severity}))??null,classesNeedingActionTotal:requiredValue(value.classesNeedingActionTotal,'classesNeedingActionTotal'),todayItems:requiredValue(value.todayItems,'todayItems'),announcements:requiredValue(value.announcements,'announcements')?.map(a=>({id:requiredId(a.id),title:a.title,summary:a.summary,status:a.status.toLowerCase() as 'published'|'scheduled',createdAt:a.createdAt,publishedAt:a.publishedAt??undefined,scheduledAt:a.scheduledAt??undefined}))??null,asOf:response.asOf,referenceDate:requiredValue(response.referenceDate,'referenceDate')};
  },
});
