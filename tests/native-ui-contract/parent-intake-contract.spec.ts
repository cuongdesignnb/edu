import {expect,test,type Page,type Route} from '@playwright/test';
const slug='parent-browser-native',first='63000000-0000-4000-8000-000000000001',second='63000000-0000-4000-8000-000000000002';
const tokenA='A'.repeat(43),tokenB='B'.repeat(43),prefix=process.env.EDU_NATIVE_QA_PREFIX??'b6-parent-intake';
const wire=(viewId:string,name:string,sections=['overview','attendance'])=>({viewId,school:{name:'Trường API phụ huynh',slug,publicContactPhone:null,shortName:null,motto:null,publicContactEmail:null,publicAddress:null},student:{displayName:name,classLabel:'6A',schoolYearLabel:'2026–2027'},allowedSections:sections,allowDownload:false,csrfToken:'synthetic-parent-browser-csrf',expiresAt:'2026-10-01T23:00:00Z',today:'2026-10-01',year:{label:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01'},relationshipLabel:'Mẹ',linkExpiresAt:'2026-11-01T00:00:00Z',lastPublishedAt:null});
const reply=(r:Route,data:unknown)=>r.fulfill({status:200,json:{data,requestId:'synthetic-parent-browser'}});
type State={viewId:string|null;revoked:boolean;exchanges:number;sections:string[]};
async function routes(page:Page,state:State){
  await page.route('**/api/v1/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(path==='/api/v1/me/context')return route.fulfill({status:401,json:{code:'UNAUTHENTICATED',requestId:'anonymous-parent-browser'}});
    if(path==='/api/v1/auth/csrf')return reply(route,{csrfToken:'synthetic-parent-bootstrap'});
    if(path===`/api/v1/public/schools/${slug}`)return reply(route,{name:'Trường API phụ huynh',slug,announcements:[],publicContactEmail:'public@example.invalid'});
    if(path===`/api/v1/parent/${slug}/access/exchange`){state.exchanges++;const token=req.postDataJSON().token;state.viewId=token===tokenA?first:second;return reply(route,wire(state.viewId,state.viewId===first?'Con API thứ nhất':'Con API thứ hai',state.sections));}
    if(path===`/api/v1/parent/${slug}/context`){
      if(state.revoked)return route.fulfill({status:401,json:{code:'PARENT_ACCESS_INVALID',requestId:'revoked-parent-browser'}});
      if(req.headers()['x-parent-view']!==state.viewId)return route.fulfill({status:409,json:{code:'PARENT_CONTEXT_CHANGED',requestId:'changed-parent-browser'}});
      return reply(route,wire(state.viewId!,state.viewId===first?'Con API thứ nhất':'Con API thứ hai',state.sections));
    }
    return route.fulfill({status:503,json:{code:'UNEXPECTED_OPERATION',requestId:'unexpected-parent-browser'}});
  });
}
const initial=():State=>({viewId:null,revoked:false,exchanges:0,sections:['overview','attendance']});
async function open(page:Page,token:string){await page.goto(`/p/${slug}/access#token=${token}`);await expect(page).toHaveURL(new RegExp(`/p/${slug}/overview$`));}
async function pointer(page:Page){return page.evaluate(()=>({local:Object.keys(localStorage),session:{...sessionStorage}}));}
test('Parent native intake consumes fragment, persists only view ID and reloads the owned context',async({page})=>{
  const state=initial();await routes(page,state);await open(page,tokenA);await expect(page.locator('p:visible').filter({hasText:'Con API thứ nhất'}).first()).toBeVisible();expect(await pointer(page)).toEqual({local:[],session:{'edu-parent-view':JSON.stringify({slug,viewId:first})}});expect(page.url()).not.toContain(tokenA);await page.reload();await expect(page.locator('p:visible').filter({hasText:'Con API thứ nhất'}).first()).toBeVisible();expect(state.exchanges).toBe(1);
  await page.screenshot({path:`qa/backend/${prefix}-parent-context-desktop.png`,fullPage:true});
});
test('Parent opening a second link shows only that child and replaces the tab pointer',async({page})=>{
  const state=initial();await routes(page,state);await open(page,tokenA);await expect(page.locator('p:visible').filter({hasText:'Con API thứ nhất'}).first()).toBeVisible();await open(page,tokenB);await expect(page.locator('p:visible').filter({hasText:'Con API thứ hai'}).first()).toBeVisible();await expect(page.getByText('Con API thứ nhất',{exact:true})).toHaveCount(0);expect((await pointer(page)).session).toEqual({'edu-parent-view':JSON.stringify({slug,viewId:second})});
});
test('Parent query-string credentials cannot exchange and the unavailable page uses actual public contact',async({page})=>{
  const state=initial();await routes(page,state);await page.goto(`/p/${slug}/access?t=${tokenA}`);await expect(page).toHaveURL(/\/access-unavailable\?reason=invalid$/);await expect(page.getByRole('heading',{name:'Đường dẫn không sử dụng được'})).toBeVisible();await expect(page.getByText('public@example.invalid',{exact:true})).toBeVisible();expect(state.exchanges).toBe(0);expect(await pointer(page)).toEqual({local:[],session:{}});
});
test('Parent invalid current session clears child content and only its own storage key',async({page})=>{
  const state=initial();await routes(page,state);await open(page,tokenA);await expect(page.locator('p:visible').filter({hasText:'Con API thứ nhất'}).first()).toBeVisible();await page.evaluate(()=>sessionStorage.setItem('unrelated-preference','keep'));state.revoked=true;await page.reload();await expect(page).toHaveURL(/\/access-unavailable\?reason=invalid$/);await expect(page.getByText('Con API thứ nhất',{exact:true})).toHaveCount(0);expect((await pointer(page)).session).toEqual({'unrelated-preference':'keep'});
});
test('Parent other-tab cookie/view change fails closed without replacing the other tab child',async({page,context})=>{
  const state=initial();await routes(page,state);await open(page,tokenA);await expect(page.locator('p:visible').filter({hasText:'Con API thứ nhất'}).first()).toBeVisible();const other=await context.newPage();await routes(other,state);await open(other,tokenB);await expect(other.locator('p:visible').filter({hasText:'Con API thứ hai'}).first()).toBeVisible();await page.reload();await expect(page).toHaveURL(/\/access-unavailable\?reason=changed$/);await expect(page.getByRole('heading',{name:'Phiên tra cứu đã thay đổi'})).toBeVisible();await expect(page.getByText('Con API thứ nhất',{exact:true})).toHaveCount(0);expect((await pointer(other)).session).toEqual({'edu-parent-view':JSON.stringify({slug,viewId:second})});await other.close();
});
test('Parent landing and navigation respect a link whose overview is not shared on mobile',async({page})=>{
  const state=initial();state.sections=['attendance'];await routes(page,state);await page.setViewportSize({width:390,height:844});await page.goto(`/p/${slug}/access#token=${tokenA}`);await expect(page).toHaveURL(new RegExp(`/p/${slug}/attendance$`));await expect(page.getByRole('heading',{name:'Chuyên cần của con'})).toBeVisible();await expect(page.getByRole('link',{name:'Tổng quan',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.screenshot({path:`qa/backend/${prefix}-parent-context-mobile.png`,fullPage:true});
});
