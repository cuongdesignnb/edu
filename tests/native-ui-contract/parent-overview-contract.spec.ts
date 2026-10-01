import {expect,test,type Page,type Route} from '@playwright/test';
import {overviewContext,overviewValue,overviewOnly,overviewSlug as slug,overviewViewId as viewId} from '../fixtures/parent-overview';
const prefix=process.env.EDU_NATIVE_QA_PREFIX??'b6-parent-overview';
type State={mode:'ready'|'only'|'unmarked'|'bad'|'withdrawn'|'invalid'|'denied'|'failed';calls:number};
const ready=():State=>({mode:'ready',calls:0}),reply=(route:Route,data:unknown)=>route.fulfill({status:200,json:{data,requestId:'overview-controlled-browser'}});
async function routes(page:Page,state:State){await page.route('**/api/v1/**',async route=>{
 const request=route.request(),path=new URL(request.url()).pathname;
 if(path==='/api/v1/me/context')return route.fulfill({status:401,json:{code:'UNAUTHENTICATED',requestId:'overview-anonymous'}});
 if(path==='/api/v1/auth/csrf')return reply(route,{csrfToken:'overview-bootstrap'});
 if(path===`/api/v1/public/schools/${slug}`)return reply(route,{name:'Trường tổng quan API',slug,announcements:[]});
 if(path.endsWith('/access/exchange'))return reply(route,overviewContext(state.mode==='only'?['overview']:undefined));
 expect(request.headers()['x-parent-view']).toBe(viewId);
 if(state.mode==='invalid')return route.fulfill({status:401,json:{code:'PARENT_ACCESS_INVALID',requestId:'overview-invalid'}});
 if(path.endsWith('/context'))return reply(route,overviewContext(state.mode==='only'?['overview']:undefined));
 if(path===`/api/v1/parent/${slug}/overview/published`){
  state.calls++;
  if(state.mode==='denied'||state.mode==='failed')return route.fulfill({status:state.mode==='denied'?403:503,json:{code:state.mode==='denied'?'PARENT_SECTION_DENIED':'DATABASE_UNAVAILABLE',requestId:'overview-denied'}});
  if(state.mode==='only')return reply(route,overviewOnly());
  const value=overviewValue();
  if(state.mode==='bad')value.attendanceWeek!.totals.marked=12;
  if(state.mode==='unmarked'){value.attendanceWeek!.records.forEach(row=>{row.status='UNMARKED';});value.attendanceWeek!.totals={present:0,late:0,excused:0,unexcused:0,unmarked:12,published:12,marked:0};}
  if(state.mode==='withdrawn'){value.conduct=null;value.attendanceWeek!.records=[];value.attendanceWeek!.totals={present:0,late:0,excused:0,unexcused:0,unmarked:0,published:0,marked:0};value.timetable!.days.forEach(day=>{day.lessons=[];});value.duties!.items=[];value.activities!.items=[];value.announcements!.items=[];}
  return reply(route,value);
 }
 throw new Error(`Unplanned overview browser API ${request.method()} ${path}`);
});}
async function open(page:Page){await page.goto(`/p/${slug}/access#token=${'J'.repeat(43)}`);await expect(page).toHaveURL(new RegExp(`/p/${slug}/overview$`));await expect(page.getByRole('heading',{name:'Thông tin của con',exact:true})).toBeVisible();}
test('Parent overview preserves published facts and existing cards with real marked denominator, null classification and cancelled lesson',async({page})=>{
 const state=ready();await routes(page,state);await open(page);await expect(page.getByText('8/10',{exact:true})).toBeVisible();await expect(page.getByText('80%',{exact:true})).toBeVisible();await expect(page.getByText('2 buổi công bố chưa có điểm danh, chưa tính vào tỷ lệ.',{exact:true})).toBeVisible();await expect(page.getByText('Chưa chia sẻ xếp loại',{exact:true})).toBeVisible();await expect(page.getByText('Tuần nguồn 5',{exact:true})).toBeVisible();await expect(page.getByRole('img',{name:'Điểm thi đua chính thức đã công bố: 100.00',exact:true})).toBeVisible();await expect(page.getByText('Được miễn',{exact:true})).toBeVisible();await expect(page.getByText('Tên giáo viên lúc công bố',{exact:true})).toBeVisible();await expect(page.getByText('Nghỉ',{exact:true})).toBeVisible();await expect(page.getByText('Theo lịch của nhà trường',{exact:false})).toHaveCount(0);await expect(page.getByText('Chưa có tiết học nào được công bố hôm nay',{exact:true})).toHaveCount(0);await expect(page.getByText('Thông báo dành riêng cho con',{exact:true})).toBeVisible();await page.screenshot({path:`qa/backend/${prefix}-parent-overview-desktop.png`,fullPage:true});expect(state.calls).toBeGreaterThan(0);expect(await page.evaluate(()=>({...sessionStorage}))).toEqual({'edu-parent-view':JSON.stringify({slug,viewId})});
});
test('Parent overview mobile fits its viewport and overview-only permissions remove every unshared panel',async({page})=>{
 const state=ready();await routes(page,state);await page.setViewportSize({width:390,height:844});await open(page);await expect(page.getByText('8/10',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:`qa/backend/${prefix}-parent-overview-mobile.png`,fullPage:true});state.mode='only';await page.reload();await expect(page.getByText('Trường tổng quan API',{exact:true}).first()).toBeVisible();for(const name of ['Thông tin giáo viên','Điểm danh tuần này','Thi đua đã công bố','Lịch học hôm nay','Thông báo mới','Trực nhật sắp tới của con','Hoạt động của con'])await expect(page.getByText(name,{exact:true})).toHaveCount(0);await page.screenshot({path:`qa/backend/${prefix}-parent-overview-only-mobile.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
test('Parent overview malformed totals stay errors, unmarked has no invented percentage and withdrawal/revocation hide current facts',async({page})=>{
 const state=ready();state.mode='bad';await routes(page,state);await open(page);await expect(page.getByText('API chưa xác nhận đầy đủ thông tin đã công bố của con.',{exact:true})).toBeVisible();await expect(page.getByText('8/10',{exact:true})).toHaveCount(0);state.mode='unmarked';await page.getByRole('button',{name:'Thử lại',exact:true}).click();await expect(page.getByText('Chưa có buổi được điểm danh tuần này',{exact:true})).toBeVisible();await expect(page.getByText('0%',{exact:true})).toHaveCount(0);state.mode='withdrawn';await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));await expect(page.getByText('Chưa có kết quả công bố',{exact:true})).toBeVisible();await expect(page.getByText('Chưa có tiết học nào được công bố hôm nay',{exact:true})).toBeVisible();await expect(page.getByText('Hôm nay con không có tiết học',{exact:true})).toHaveCount(0);await expect(page.getByText('Nhiệm vụ riêng của con',{exact:true})).toHaveCount(0);state.mode='failed';await page.reload();await expect(page.getByRole('button',{name:'Thử lại',exact:true})).toBeVisible();await expect(page.getByText('Chưa có kết quả công bố',{exact:true})).toHaveCount(0);state.mode='denied';await page.reload();await expect(page.getByText('Mục này chưa được nhà trường chia sẻ qua link của bạn',{exact:true})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('edu-parent-view'))).toBe(JSON.stringify({slug,viewId}));state.mode='invalid';await page.reload();await expect(page).toHaveURL(/access-unavailable\?reason=invalid$/);expect(await page.evaluate(()=>sessionStorage.getItem('edu-parent-view'))).toBeNull();
});
