import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {connectedSchoolRepo} from '@/lib/repositories/connected/school';
import type {Ctx} from '@/lib/repositories/core';
import {authenticationChanged,setStaffCsrf} from '@/lib/api/client';
import {inclusiveDate,exclusiveDate} from '@/lib/api/dates';
import {uiActions} from '@/lib/api/permissions';

vi.mock('@/lib/api/session',()=>({refreshStaffContext:vi.fn().mockResolvedValue({}),serverToday:vi.fn(()=> '2026-09-30')}));
vi.mock('@/lib/api/permissions',()=>({uiActions:vi.fn(()=>new Set(['school.profile.edit','school.settings.edit','dictionary.manage']))}));
const schoolId='00000000-0000-4000-8000-000000000001',itemId='00000000-0000-4000-8000-000000000002';
const ctx={} as Ctx;
const envelope=(data:unknown)=>new Response(JSON.stringify({data,requestId:'adapter-test',...(Array.isArray(data)?{page:{limit:100,hasMore:false,nextCursor:null,total:data.length}}:{})}),{headers:{'content-type':'application/json'}});
beforeEach(()=>{authenticationChanged();setStaffCsrf('test-csrf');vi.mocked(uiActions).mockReturnValue(new Set(['school.profile.edit','school.settings.edit','dictionary.manage']));});
afterEach(()=>{vi.unstubAllGlobals();authenticationChanged();});

describe('school API adapter candidates',()=>{
  it('maps returned profile fields and the read version without inventing onboarding progress',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({id:schoolId,code:'API',slug:'api-school',name:'Trường từ API',shortName:'API',province:'TP.HCM',level:null,accentColor:'#123456',motto:'Học tốt',publicIntro:'Giới thiệu',publicContactEmail:'office@example.invalid',publicContactPhone:null,publicAddress:'Địa chỉ',website:'https://example.invalid',status:'ACTIVE',version:12,createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-01T00:00:00Z',timezone:'Asia/Ho_Chi_Minh'}));
    vi.stubGlobal('fetch',fetcher);const result=await connectedSchoolRepo.profile(ctx,schoolId);
    expect(result.school).toMatchObject({name:'Trường từ API',publicEmail:'office@example.invalid',publicPhone:'',address:'Địa chỉ',website:'https://example.invalid',version:12,level:null});expect(result.school.onboarding).toBeUndefined();expect(result.canEdit).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects a response missing required profile fields instead of substituting mock content',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope({id:schoolId,name:'API',status:'ACTIVE',version:1})));
    await expect(connectedSchoolRepo.profile(ctx,schoolId)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('requires the version displayed by the form before modifying a dictionary',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    await expect(connectedSchoolRepo.saveDictionaryItem(ctx,schoolId,'subject',{id:itemId,name:'Toán',code:'MATH',color:'#123456'})).rejects.toMatchObject({code:'CONFLICT',details:{requiresReload:true}});
    await expect(connectedSchoolRepo.setDictionaryStatus(ctx,schoolId,'room',itemId,'inactive')).rejects.toMatchObject({code:'CONFLICT'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('validates the grade and preserves the submitted version and real field errors',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:'VALIDATION_ERROR',fieldErrors:[{path:'gradeLevel',message:'Khối không hợp lệ'}]}),{status:422}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedSchoolRepo.saveDictionaryItem(ctx,schoolId,'grade',{name:'Khối chưa rõ'})).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{level:'Khối phải từ 1 đến 12.'}});expect(fetcher).not.toHaveBeenCalled();
    await expect(connectedSchoolRepo.saveDictionaryItem(ctx,schoolId,'grade',{id:itemId,name:'Khối 6',level:6,version:3})).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{level:'Khối không hợp lệ'}});
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({name:'Khối 6',code:'6',gradeLevel:6,expectedVersion:3});expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not replace a missing dictionary usage flag with false',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope([{id:itemId,code:'6',name:'Khối 6',status:'ACTIVE',version:1,gradeLevel:6}])));
    await expect(connectedSchoolRepo.dictionaries(ctx,schoolId)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('submits the complete year wizard once with exclusive ends, including one-day holidays',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({id:itemId,setup:{termCount:2,weekCount:40,holidayCount:1}}));vi.stubGlobal('fetch',fetcher);
    const result=await connectedSchoolRepo.createYear(ctx,schoolId,{label:'2028–2029',startDate:'2028-09-01',endDate:'2029-05-31',terms:[{name:'Học kỳ I',startDate:'2028-09-01',endDate:'2029-01-19',openingDate:'2028-09-05'},{name:'Học kỳ II',startDate:'2029-01-20',endDate:'2029-05-31'}],holidays:[{name:'Nghỉ một ngày',startDate:'2028-09-02',endDate:'2028-09-02'}],copyRules:true});
    expect(result).toEqual({id:itemId,setup:{termCount:2,weekCount:40,holidayCount:1}});expect(fetcher).toHaveBeenCalledTimes(1);
    const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body.code).toBe('2028-2029');expect(body.endsOn).toBe('2029-06-01');expect(body.terms[0].endsOn).toBe('2029-01-20');expect(body.holidays[0]).toEqual({title:'Nghỉ một ngày',startsOn:'2028-09-02',endsOn:'2028-09-03'});expect(body.copyRules).toBe(true);
  });
  it('adds a holiday as one acknowledged published command',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({id:itemId,yearId:schoolId,title:'Ngày nghỉ',startsOn:'2028-09-02',endsOn:'2028-09-03',status:'PUBLISHED',version:1}));vi.stubGlobal('fetch',fetcher);
    const result=await connectedSchoolRepo.addHoliday(ctx,schoolId,schoolId,{name:'Ngày nghỉ',startDate:'2028-09-02',endDate:'2028-09-02'});expect(result.endDate).toBe('2028-09-02');expect(result.status).toBe('PUBLISHED');expect(JSON.parse(fetcher.mock.calls[0][1].body).status).toBe('PUBLISHED');expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps nullable authorized counts instead of displaying fabricated zeroes',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope([{id:itemId,name:'2028–2029',code:'2028-2029',startsOn:'2028-09-01',endsOn:'2029-06-01',status:'DRAFT',version:2,terms:[],classCount:null,studentCount:null}])));
    const rows=await connectedSchoolRepo.years(ctx,schoolId);expect(rows[0].classCount).toBeNull();expect(rows[0].studentCount).toBeNull();expect(rows[0].endDate).toBe('2029-05-31');
  });
  it('sends a deadline day and the displayed version for server timezone conversion',async()=>{
    const fetcher=vi.fn().mockResolvedValue(envelope({id:itemId,weekNumber:3,version:8,inputDeadline:'2028-09-24T16:59:59.999Z'}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedSchoolRepo.updateWeekDeadline(ctx,schoolId,itemId,'2028-09-24')).rejects.toMatchObject({code:'CONFLICT'});expect(fetcher).not.toHaveBeenCalled();
    const result=await connectedSchoolRepo.updateWeekDeadline(ctx,schoolId,itemId,'2028-09-24',7);expect(result.version).toBe(8);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({expectedVersion:7,inputDeadlineDay:'2028-09-24'});
  });
  it('converts date-only leap-year and month boundaries independently of local timezone',()=>{
    expect(exclusiveDate('2028-02-29')).toBe('2028-03-01');expect(inclusiveDate('2028-03-01')).toBe('2028-02-29');expect(exclusiveDate('2028-12-31')).toBe('2029-01-01');expect(()=>exclusiveDate('2026-02-29')).toThrow();
  });
  it('loads purpose-bound picker metadata without retaining staff contacts or grants',async()=>{
    vi.mocked(uiActions).mockReturnValue(new Set(['class.manage','assignment.manage']));
    const fetcher=vi.fn().mockImplementation((url:string)=>{
      const path=new URL(url,'https://api-test.invalid').pathname;
      if(path.endsWith('/academic-years'))return Promise.resolve(envelope([{id:itemId,name:'2028–2029',code:'2028-2029',startsOn:'2028-09-01',endsOn:'2029-06-01',status:'DRAFT',version:1}]));
      if(path.endsWith('/members'))return Promise.resolve(envelope([{id:itemId,userId:schoolId,workDisplayName:'Nhân sự API',department:'Tổ API',homeroomOf:['10A1'],workPhone:'unexpected-contact',grants:[{actions:['unexpected']}]}]));
      return Promise.resolve(envelope([{id:itemId,name:'Danh mục API',code:'10',status:'ACTIVE',version:1,gradeLevel:10}]));
    });vi.stubGlobal('fetch',fetcher);
    const result=await connectedSchoolRepo.formOptions(ctx,schoolId);expect(result.canAssign).toBe(true);expect(result.teachers?.[0]).toEqual({membershipId:itemId,userId:schoolId,name:'Nhân sự API',department:'Tổ API',homeroomOf:['10A1']});expect(fetcher).toHaveBeenCalledTimes(5);
    for(const [url]of fetcher.mock.calls)expect(new URL(url,'https://api-test.invalid').searchParams.get('purpose')).toMatch(/^(class|assignment)-picker$/);
  });
  it('does not fetch assignment metadata when the context only permits class management',async()=>{
    vi.mocked(uiActions).mockReturnValue(new Set(['class.manage']));const fetcher=vi.fn().mockImplementation((url:string)=>Promise.resolve(envelope(new URL(url,'https://api-test.invalid').pathname.endsWith('/academic-years')?[{id:itemId,name:'2028–2029',code:'2028-2029',startsOn:'2028-09-01',endsOn:'2029-06-01',status:'DRAFT',version:1}]:[])));vi.stubGlobal('fetch',fetcher);
    const result=await connectedSchoolRepo.formOptions(ctx,schoolId);expect(result.canAssign).toBe(false);expect(result.teachers).toBeUndefined();expect(result.subjects).toBeUndefined();expect(fetcher).toHaveBeenCalledTimes(3);expect(fetcher.mock.calls.some(([url])=>String(url).includes('/members'))).toBe(false);
  });
  it('looks up one week through a server date filter and rejects an ignored filter',async()=>{
    const yearRow={id:itemId,name:'2026–2027',code:'2026-2027',startsOn:'2026-09-01',endsOn:'2027-06-01',status:'ACTIVE',version:1},weekRow={id:itemId,yearId:itemId,termId:schoolId,weekNumber:5,startsOn:'2026-09-28',endsOn:'2026-10-05',inputDeadlineDay:'2026-10-05',locked:false,version:1};
    const fetcher=vi.fn().mockResolvedValueOnce(envelope([yearRow])).mockResolvedValueOnce(envelope([weekRow]));vi.stubGlobal('fetch',fetcher);
    const result=await connectedSchoolRepo.weekOf(ctx,schoolId,'2026-09-30');expect(result?.index).toBe(5);expect(result?.endDate).toBe('2026-10-04');expect(result?.isCurrent).toBe(true);expect(fetcher.mock.calls[1][0]).toContain('onDate=2026-09-30');
    fetcher.mockResolvedValueOnce(envelope([yearRow])).mockResolvedValueOnce(envelope([weekRow,{...weekRow,id:schoolId}]));await expect(connectedSchoolRepo.weekOf(ctx,schoolId,'2026-09-30')).rejects.toMatchObject({code:'VALIDATION',details:{maximum:1}});
  });
  it('preserves unavailable overview panels/counts and does not manufacture completion or query broad datasets',async()=>{
    const year={id:itemId,name:'2026–2027',code:'2026-2027',startsOn:'2026-09-01',endsOn:'2027-06-01',status:'ACTIVE',version:1},kpi={activeClasses:null,draftClasses:null,prevClasses:null,staffActive:null,students:null,prevStudents:null,linksActive:null,linksOpened:null};
    const fetcher=vi.fn().mockResolvedValue(envelope({asOf:'2026-09-30T08:00:00Z',referenceDate:'2026-09-30',metrics:[],tasks:[],schoolOverview:{year,prevYear:null,kpi,setup:['year','classes','homeroom','students','timetable','rules','announce','activate'].map(key=>({key,label:key,done:null,detail:'Không có quyền xem hạng mục',href:`/school/${schoolId}/imports`})),classesNeedingAction:null,classesNeedingActionTotal:null,todayItems:null,announcements:null}}));vi.stubGlobal('fetch',fetcher);
    const result=await connectedSchoolRepo.overview(ctx,schoolId,itemId);expect(result.kpi).toEqual(kpi);expect(result.setup[0].done).toBeNull();expect(result.classesNeedingAction).toBeNull();expect(result.classesNeedingActionTotal).toBeNull();expect(result.todayItems).toBeNull();expect(result.announcements).toBeNull();expect(result.prevYear).toBeUndefined();expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toContain(`yearId=${itemId}`);
  });
  it('rejects a missing overview projection and a substituted selected year',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(envelope({metrics:[],tasks:[],asOf:'2026-09-30T08:00:00Z'})).mockResolvedValueOnce(envelope({schoolOverview:{year:{id:schoolId}}}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedSchoolRepo.overview(ctx,schoolId,itemId)).rejects.toMatchObject({code:'READ_ERROR'});await expect(connectedSchoolRepo.overview(ctx,schoolId,itemId)).rejects.toMatchObject({code:'READ_ERROR'});
  });
  it('keeps full SQL totals separate from the bounded six-row class preview',async()=>{
    const row={id:itemId,yearId:itemId,gradeLevelId:schoolId,code:'10A1',name:'10A1',capacity:40,status:'DRAFT',version:2,yearName:'2026–2027',gradeName:'Khối 10',homeroomName:null,studentCount:null,subjectTeacherCount:0,hasTimetable:true,inactiveAssignmentCount:0,referenceDate:'2026-09-30',tasks:['Chờ kích hoạt lớp'],severity:'blocked'};
    const value={year:{id:itemId,name:'2026–2027',code:'2026-2027',startsOn:'2026-09-01',endsOn:'2027-06-01',status:'ACTIVE',version:1},prevYear:null,kpi:{activeClasses:2000,draftClasses:42,prevClasses:null,staffActive:null,students:null,prevStudents:null,linksActive:null,linksOpened:null},setup:[],classesNeedingAction:Array.from({length:6},(_,i)=>({...row,id:`00000000-0000-4000-8000-0000000000${String(i+10)}`})),classesNeedingActionTotal:42,todayItems:[],announcements:[]};
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(envelope({asOf:'2026-09-30T08:00:00Z',referenceDate:'2026-09-30',schoolOverview:value})));
    const result=await connectedSchoolRepo.overview(ctx,schoolId,itemId);expect(result.classesNeedingAction).toHaveLength(6);expect(result.classesNeedingActionTotal).toBe(42);expect(result.kpi.activeClasses).toBe(2000);expect(result.classesNeedingAction?.[0].size).toBeNull();expect(result.classesNeedingAction?.[0].issues).not.toContain('Chưa có học sinh');
  });
});
