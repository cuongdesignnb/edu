import {expect,test,type Page,type Route} from '@playwright/test';
import type {ApiSchemas} from '@/lib/api/generated';
import {overviewContext,overviewValue,overviewOnly,overviewSlug as slug,overviewSchoolId as schoolId,overviewAccessId as accessId,overviewAt as stamp,overviewPeriodId as periodId} from '../fixtures/parent-overview';

const base=`/api/v1/schools/${schoolId}`,preview=`${base}/parent-access/${accessId}/preview`,web=`/school/${schoolId}/parent-access/${accessId}/preview`,userId='73000000-0000-4000-8000-000000000001',yearId='73000000-0000-4000-8000-000000000002',fileId='73000000-0000-4000-8000-000000000003';
const prefix=process.env.EDU_NATIVE_QA_PREFIX??'b6-parent-preview',pointer=JSON.stringify({slug:'another-public-child',viewId:'73000000-0000-4000-8000-000000000004'});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVZkAAAAASUVORK5CYII=','base64');
const school={id:schoolId,version:1,code:'PREVIEW',name:'Trường tổng quan API',slug,shortName:'API',province:'TP.HCM',level:null,accentColor:'#123456',motto:null,publicIntro:'',publicContactEmail:null,publicContactPhone:null,publicAddress:null,website:null,status:'ACTIVE',createdAt:stamp};
const year={id:yearId,version:1,name:'2026–2027',code:'Y',startsOn:'2026-09-01',endsOn:'2027-06-01',status:'ACTIVE'};
const file=()=>({id:fileId,title:'Tệp riêng để xem trước',contentType:'image/png',byteSize:png.length,downloadAllowed:false,viewAllowed:true,publishedAt:stamp});
const reply=(r:Route,data:unknown)=>r.fulfill({status:200,json:{data,requestId:'staff-preview-controlled-browser'}});
const list=(r:Route,data:unknown[])=>r.fulfill({status:200,json:{data,requestId:'staff-preview-controlled-browser',page:{limit:100,total:data.length,hasMore:false,nextCursor:null}}});
type State={mode:'ready'|'only'|'denied'|'invalid'|'failed';calls:string[];unexpected:string[];methods:string[];views:number};
const ready=():State=>({mode:'ready',calls:[],unexpected:[],methods:[],views:0});
function month(selected:string):ApiSchemas['ParentAttendanceMonth']{
 const first=selected+'-01',next=new Date(first+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);const count=(next.getTime()-Date.parse(first))/86400000,source=overviewValue().attendanceWeek!,totals={present:0,late:0,excused:0,unexcused:0,unmarked:0,published:0,marked:0};
 const days=Array.from({length:count},(_,i)=>{const date=`${selected}-${String(i+1).padStart(2,'0')}`,sessions=source.records.filter(row=>row.date===date),statuses=new Set(sessions.map(row=>row.status.toLowerCase()));for(const row of sessions){totals[row.status.toLowerCase() as keyof typeof totals]++;totals.published++;if(row.status!=='UNMARKED')totals.marked++;}return {date,weekday:(new Date(date+'T00:00:00Z').getUTCDay()+6)%7+1,holidayNames:[],sessions,status:(sessions.length?statuses.size===1?[...statuses][0]:'mixed':date>'2026-10-04'?'future':'not_published') as ApiSchemas['ParentAttendanceMonth']['days'][number]['status']};});
 return {granularity:'DAILY',month:selected,yearStart:'2026-09',yearEnd:'2027-05',today:'2026-10-04',totals,days};
}
async function routes(page:Page,state:State){
 await page.addInitScript(value=>sessionStorage.setItem('edu-parent-view',value),pointer);
 await page.route('**/api/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;state.methods.push(req.method());expect(req.headers()['x-parent-view']).toBeUndefined();
  if(path==='/api/v1/me/context')return reply(route,{user:{id:userId,version:1,displayName:'Nhân sự xem trước',email:'preview@example.invalid',status:'ACTIVE'},platformActions:[],csrfToken:'preview-staff-csrf',mode:'connected',serverNow:new Date().toISOString(),memberships:[{memberId:userId,schoolId,schoolName:school.name,schoolShortName:'API',schoolSlug:slug,schoolStatus:'ACTIVE',status:'ACTIVE',timezone:'Asia/Ho_Chi_Minh',today:'2026-10-04',department:'',schoolWorkspace:true,teacherWorkspace:false,duties:[],grants:[{id:userId,version:1,roleId:userId,roleCode:'CUSTOM',roleLabel:'Xem trước độc lập',scopeType:'SCHOOL',validFrom:'2020-01-01T00:00:00Z',validUntil:null,revokedAt:null,actions:['school.read','year.read','parent_access.preview']}]}]});
  if(path==='/api/v1/me/notifications')return list(route,[]);
  if(path===`${base}/profile`)return reply(route,school);
  if(path===`${base}/academic-years`)return list(route,[year]);
  if(path.startsWith(preview+'/')){
   const tail=path.slice(preview.length+1);state.calls.push(tail);
   if(state.mode==='denied'||state.mode==='invalid'||state.mode==='failed')return route.fulfill({status:state.mode==='denied'?403:state.mode==='invalid'?401:503,json:{code:state.mode==='denied'?'PERMISSION_DENIED':state.mode==='invalid'?'PARENT_ACCESS_INVALID':'DATABASE_UNAVAILABLE',requestId:'staff-preview-denied'}});
   const value=overviewValue();
   if(tail==='context')return reply(route,overviewContext(state.mode==='only'?['overview']:['overview','attendance','conduct','teachers','timetable','duties','activities','announcements','documents']));
   if(tail==='overview/published')return reply(route,state.mode==='only'?overviewOnly():value);
   if(tail==='attendance-month')return reply(route,month(url.searchParams.get('month')!));
   if(tail==='teacher-directory')return reply(route,value.teachers);
   if(tail==='timetable-week')return reply(route,value.timetable);
   if(tail==='duty-schedule')return reply(route,value.duties);
   if(tail==='conduct/published')return reply(route,{items:[value.conduct]});
   if(tail===`conduct/${periodId}/published`)return reply(route,value.conduct);
   if(tail==='activities/published')return reply(route,value.activities);
   if(tail===`activities/${value.activities!.items[0].id}/published`)return reply(route,value.activities!.items[0]);
   if(tail==='announcements/published')return reply(route,value.announcements);
   if(tail===`announcements/${value.announcements!.items[0].id}/published`)return reply(route,value.announcements!.items[0]);
   if(tail==='document-directory')return reply(route,{files:[file()],reports:[{periodId,title:'Kết quả thi đua Tuần nguồn 5',publishedAt:stamp,total:'100.00',grade:null,revision:1}]});
   if(tail===`documents/${fileId}`)return reply(route,file());
   if(tail===`documents/${fileId}/view`){state.views++;return route.fulfill({status:200,contentType:'image/png',body:png,headers:{'Content-Disposition':'inline; filename="preview.png"'}});}
  }
  state.unexpected.push(`${req.method()} ${path}`);return route.fulfill({status:503,json:{code:'UNEXPECTED_PREVIEW_OPERATION',requestId:'unexpected-preview-browser'}});
 });
}
async function visit(page:Page,tail='overview'){await page.goto(`${web}/${tail}`);await expect(page.getByRole('heading',{name:'Xem trước trang phụ huynh',exact:true})).toBeVisible();}
async function assertPointer(page:Page,state:State){expect(await page.evaluate(()=>sessionStorage.getItem('edu-parent-view'))).toBe(pointer);expect(state.unexpected).toEqual([]);expect(state.methods.every(method=>method==='GET')).toBe(true);expect(state.calls).not.toContain('');}

test('SC25 staff shell previews native overview, attendance, conduct history, teachers, timetable and own duties through independent purposes',async({page})=>{
 const state=ready();await routes(page,state);await visit(page);await expect(page.getByText('8/10',{exact:true})).toBeVisible();await expect(page.getByRole('img',{name:'Điểm thi đua chính thức đã công bố: 100.00',exact:true})).toBeVisible();await expect(page.getByText('Xem trước nội bộ — đúng phần phụ huynh sẽ thấy qua link này. Không cấp thêm quyền nào.',{exact:true})).toBeVisible();await page.screenshot({path:`qa/backend/${prefix}-staff-preview-desktop.png`,fullPage:true});
 await visit(page,'attendance');await expect(page.getByRole('heading',{name:'Chuyên cần của con',exact:true})).toBeVisible();await expect.poll(()=>state.calls.includes('attendance-month')).toBe(true);
 await visit(page,'conduct');await expect(page.getByText('Tuần nguồn 5',{exact:true})).toBeVisible();await page.getByRole('link',{name:/Tuần nguồn 5/}).click();await expect(page.locator('tfoot')).toContainText('100.00');await expect(page.getByText('Quy chế: Quy chế đã công bố (phiên bản 2)',{exact:true})).toBeVisible();
 await visit(page,'teachers');await expect(page.getByText('Giáo viên được chia sẻ',{exact:true})).toBeVisible();await visit(page,'timetable');await expect(page.getByRole('region',{name:'Chủ nhật, 04/10/2026',exact:true})).toContainText('Tên giáo viên lúc công bố');await visit(page,'duties');await expect(page.getByText('Nhiệm vụ riêng của con',{exact:true})).toBeVisible();await assertPointer(page,state);
});
test('SC25 staff preview reads own activity and announcement details and actual private view bytes without lending downloads',async({page})=>{
 const state=ready();await routes(page,state);await visit(page,'activities');await expect(page.getByText('Được miễn',{exact:true})).toBeVisible();await page.getByRole('link',{name:/Hoạt động được miễn/}).click();await expect(page.getByRole('heading',{name:'Hoạt động được miễn',exact:true})).toBeVisible();await visit(page,'announcements');await page.getByRole('link',{name:/Thông báo dành riêng cho con/}).click();await expect(page.locator('article')).toContainText('Nội dung đã công bố');await visit(page,'documents');await expect(page.getByText('Kết quả thi đua Tuần nguồn 5',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Xem: Tệp riêng để xem trước',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('img',{name:'Xem trước: Tệp riêng để xem trước',exact:true})).toBeVisible();await expect.poll(()=>dialog.locator('img').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(1);await expect(dialog.getByRole('button',{name:'Tải xuống',exact:true})).toHaveCount(0);expect(state.views).toBe(1);await page.screenshot({path:`qa/backend/${prefix}-staff-preview-file.png`,fullPage:true});await assertPointer(page,state);
});
test('SC25 mobile preview respects overview-only capabilities and denies direct unshared routes without requesting their panels',async({page})=>{
 const state=ready();state.mode='only';await routes(page,state);await page.setViewportSize({width:390,height:844});await visit(page);await expect(page.getByText('Con tổng quan API',{exact:true}).first()).toBeVisible();await expect(page.getByText('Điểm danh tuần này',{exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:`qa/backend/${prefix}-staff-preview-mobile.png`,fullPage:true});await visit(page,'teachers');await expect(page.getByText('Mục này chưa được nhà trường chia sẻ qua link của bạn',{exact:true})).toBeVisible();expect(state.calls).not.toContain('teacher-directory');await assertPointer(page,state);
});
test('SC25 current preview denial, invalid link and API outage remove old child content while preserving the public tab pointer',async({page})=>{
 const state=ready();await routes(page,state);await visit(page);await expect(page.getByText('8/10',{exact:true})).toBeVisible();for(const mode of ['denied','invalid','failed'] as const){state.mode=mode;await page.reload();await expect(page.getByRole('heading',{name:'Xem trước trang phụ huynh',exact:true})).toBeVisible();await expect(page.getByText(mode==='denied'?'Bạn không có quyền xem mục này':mode==='invalid'?'Link hiện không sử dụng được':'Không tải được dữ liệu',{exact:true})).toBeVisible();await expect(page.getByText('Con tổng quan API',{exact:true})).toHaveCount(0);await expect(page.getByText('8/10',{exact:true})).toHaveCount(0);await assertPointer(page,state);}state.mode='ready';await page.getByRole('button',{name:'Thử lại',exact:true}).click();await expect(page.getByText('8/10',{exact:true})).toBeVisible();await assertPointer(page,state);
});
