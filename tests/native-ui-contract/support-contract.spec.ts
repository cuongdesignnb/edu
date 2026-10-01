import {expect,test,type Page,type Route} from '@playwright/test';

const schoolId='30000000-0000-4000-8000-000000000001',yearId='30000000-0000-4000-8000-000000000002',ticketId='30000000-0000-4000-8000-000000000003',grantId='30000000-0000-4000-8000-000000000004',userId='30000000-0000-4000-8000-000000000005',messageId='30000000-0000-4000-8000-000000000006';
const base=`/api/v1/schools/${schoolId}`,web=`/school/${schoolId}`,stamp='2026-10-01T00:00:00Z';
const school={id:schoolId,version:1,code:'SUPPORT',name:'Trường hỗ trợ API',slug:'support-api',shortName:'API',province:'TP.HCM',level:null,accentColor:'#123456',motto:'Học tốt',publicIntro:'',publicContactEmail:null,publicContactPhone:null,publicAddress:null,website:null,status:'ACTIVE',createdAt:stamp};
const ticket={id:ticketId,schoolId,version:4,subject:'Yêu cầu cấu hình API',description:'Nội dung yêu cầu API',status:'WAITING_SCHOOL',priority:'HIGH',requesterId:userId,requesterName:'Người gửi API',schoolName:school.name,schoolStatus:'ACTIVE',createdAt:stamp,updatedAt:stamp,messageCount:12};
const queue={total:41,open:10,inProgress:15,waitingSchool:12,resolved:4,high:7};
const grants={total:1,requested:1,active:0,expired:0,revoked:0,declined:0,inactive:0};
const grant=(version=3)=>({id:grantId,schoolId,ticketId,operatorId:messageId,operatorName:'Người hỗ trợ API',schoolName:school.name,allowedActions:['class.read'],reason:'Kiểm tra cấu trúc lớp',version,status:'REQUESTED',viewStatus:'requested',effective:false,validFrom:'2026-10-01T00:00:00Z',validUntil:'2026-10-02T00:00:00Z',createdAt:stamp,updatedAt:stamp,requesterName:'Người hỗ trợ API'});
const reply=(r:Route,data:unknown)=>r.fulfill({status:200,json:{data,requestId:'support-browser-contract'}});
const list=(r:Route,data:unknown[])=>r.fulfill({status:200,json:{data,requestId:'support-browser-contract',page:{limit:100,total:data.length,hasMore:false,nextCursor:null}}});
const deny=(r:Route)=>r.fulfill({status:403,json:{code:'PERMISSION_DENIED',requestId:'support-browser-contract'}});
const screenshot=(name:string)=>`qa/backend/${process.env.EDU_NATIVE_QA_PREFIX??'b6-native-support'}-${name}.png`;
async function routes(page:Page,actions:string[],handler:(route:Route,path:string)=>Promise<unknown>){
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/v1/me/context')return reply(route,{user:{id:userId,version:1,displayName:'Nhân sự native',email:'synthetic@example.invalid',status:'ACTIVE'},platformActions:[],csrfToken:'support-contract-csrf',mode:'connected',serverNow:new Date().toISOString(),memberships:[{memberId:userId,schoolId,schoolName:school.name,schoolCode:school.code,schoolSlug:school.slug,schoolStatus:'ACTIVE',status:'ACTIVE',timezone:'Asia/Ho_Chi_Minh',today:'2026-10-01',duties:[],grants:[{id:grantId,version:1,roleId:grantId,roleCode:'CUSTOM',roleLabel:'Quyền API',scopeType:'SCHOOL',validFrom:'2020-01-01T00:00:00Z',validUntil:null,revokedAt:null,actions}]}]});
    if(path==='/api/v1/me/notifications')return list(route,[]);
    if(path===`${base}/profile`)return reply(route,school);
    if(path===`${base}/academic-years`)return list(route,[{id:yearId,version:1,code:'Y',name:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01',status:'ACTIVE'}]);
    return handler(route,path);
  });
}

test.describe('Native school support browser contracts — intercepted API, separate from PostgreSQL E2E',()=>{
  test('uses server ticket totals, message counts and filters without borrowing consent authority',async({page})=>{
    const requests:string[]=[],privateReads:string[]=[];
    await routes(page,['school.read','year.read','support.manage'],(r,path)=>{
      if(path===`${base}/support-summary`)return reply(r,{queue,grants:null,canApprove:false});
      if(path===`${base}/support`){requests.push(r.request().url());return list(r,[ticket]);}
      privateReads.push(path);return deny(r);
    });
    await page.goto(`${web}/support`);await expect(page.getByRole('cell',{name:'12',exact:true})).toBeVisible();await expect(page.getByText('41 yêu cầu',{exact:true})).toBeVisible();await expect(page.getByText('Bạn không được phép xem đề nghị quyền hỗ trợ.',{exact:true})).toBeVisible();await expect(page.getByText('Chưa có đề nghị quyền hỗ trợ',{exact:true})).toHaveCount(0);
    await page.getByLabel('Lọc trạng thái',{exact:true}).selectOption('waiting_school');await expect.poll(()=>requests.some(u=>new URL(u).searchParams.get('status')==='WAITING_SCHOOL')).toBe(true);expect(privateReads).toEqual([]);await page.screenshot({path:screenshot('support-desktop'),fullPage:true});
  });

  test('keeps a ticket draft through read failure and mismatched create ACK, then manually retries the same intent',async({page})=>{
    let failure=0,reads=0;const bodies:Record<string,unknown>[]=[],keys:Array<string|undefined>=[];
    await routes(page,['school.read','year.read','support.manage'],(r,path)=>{
      if(path===`${base}/support-summary`){reads++;return failure?r.fulfill({status:failure,json:{code:'SERVICE_UNAVAILABLE'}}):reply(r,{queue,grants:null,canApprove:false});}
      if(path===`${base}/support`){if(r.request().method()==='POST'){const body=r.request().postDataJSON();bodies.push(body);keys.push(r.request().headers()['idempotency-key']);return reply(r,{...ticket,...body,subject:bodies.length===1?'Sai nội dung':body.subject,status:'OPEN'});}return list(r,[ticket]);}
      if(path===`${base}/support/${ticketId}`)return reply(r,{...ticket,status:'OPEN'});
      if(path===`${base}/support/${ticketId}/messages`)return list(r,[]);
      return deny(r);
    });
    await page.goto(`${web}/support`);await page.getByRole('button',{name:'Tạo yêu cầu hỗ trợ',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel(/^Tiêu đề/).fill('Yêu cầu mới từ API');await modal.getByLabel(/^Mô tả vấn đề/).fill('Các bước xử lý cấu hình thật');
    const previous=reads;failure=503;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(previous);await expect(modal.getByLabel(/^Tiêu đề/)).toHaveValue('Yêu cầu mới từ API');failure=0;
    await modal.getByRole('button',{name:'Tạo yêu cầu',exact:true}).click();await expect(modal.getByText('Chưa xác minh được kết quả từ máy chủ. Hãy giữ nội dung để thử lại.',{exact:true})).toBeVisible();await expect(modal.getByLabel(/^Tiêu đề/)).toHaveValue('Yêu cầu mới từ API');await modal.getByRole('button',{name:'Tạo yêu cầu',exact:true}).click();await expect(page).toHaveURL(`${web}/support/${ticketId}`);expect(bodies).toHaveLength(2);expect(bodies[0]).toEqual(bodies[1]);expect(keys[0]).toBeTruthy();expect(keys[0]).toBe(keys[1]);
  });

  test('uses the reviewed support version through refresh and retains a required decline reason on conflict',async({page})=>{
    let version=3,reads=0;const bodies:Record<string,unknown>[]=[];
    await routes(page,['school.read','year.read','support.manage','support.approve'],(r,path)=>{
      if(path===`${base}/support-summary`)return reply(r,{queue,grants,canApprove:true});
      if(path===`${base}/support`)return list(r,[ticket]);
      if(path===`${base}/support-access`){reads++;return list(r,[grant(version)]);}
      if(path===`${base}/support-access/${grantId}/revoke`){bodies.push(r.request().postDataJSON());return r.fulfill({status:409,json:{code:'VERSION_CONFLICT',currentVersion:4}});}
      return deny(r);
    });
    await page.goto(`${web}/support`);await expect(page.getByText('Xem lớp',{exact:true})).toBeVisible();await expect(page.getByText('Xem phân công',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Từ chối',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel(/^Lý do/).fill('Không cần xem cấu hình');const previous=reads;version=4;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(previous);
    await modal.getByRole('button',{name:'Từ chối',exact:true}).click();await expect(modal.getByLabel(/^Lý do/)).toHaveValue('Không cần xem cấu hình');await expect(modal.getByText(/Dữ liệu đã được người khác thay đổi/)).toBeVisible();expect(bodies).toEqual([{expectedVersion:3,reason:'Không cần xem cấu hình',decision:'REJECT'}]);await page.setViewportSize({width:390,height:844});await page.screenshot({path:screenshot('support-conflict-mobile'),fullPage:true});
  });

  test('retains an unconfirmed school message and sends the same key on manual retry',async({page})=>{
    const keys:Array<string|undefined>=[];let saved=false,closed=false;
    const message={id:messageId,authorId:userId,authorLabel:'Người gửi API',body:'Cập nhật từ nhà trường',createdAt:stamp,side:'SCHOOL'};
    await routes(page,['school.read','year.read','support.manage'],(r,path)=>{
      if(path===`${base}/support-summary`)return reply(r,{queue,grants:null,canApprove:false});
      if(path===`${base}/support/${ticketId}`)return reply(r,{...ticket,status:closed?'CLOSED':ticket.status});
      if(path===`${base}/support/${ticketId}/messages`){if(r.request().method()==='POST'){keys.push(r.request().headers()['idempotency-key']);saved=keys.length>1;return reply(r,{...message,side:saved?'SCHOOL':'PLATFORM'});}return list(r,saved?[message]:[]);}
      return deny(r);
    });
    await page.goto(`${web}/support/${ticketId}`);await page.getByLabel('Thêm cập nhật',{exact:true}).fill(message.body);await page.getByRole('button',{name:'Ghi cập nhật',exact:true}).click();await expect(page.getByLabel('Thêm cập nhật',{exact:true})).toHaveValue(message.body);await expect(page.getByText('Chưa xác minh được kết quả từ máy chủ. Hãy giữ nội dung để thử lại.',{exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'Ghi cập nhật',exact:true}).click();await expect(page.getByLabel('Thêm cập nhật',{exact:true})).toHaveValue('');expect(keys).toHaveLength(2);expect(keys[0]).toBeTruthy();expect(keys[0]).toBe(keys[1]);closed=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByLabel('Thêm cập nhật',{exact:true})).toHaveCount(0);await expect(page.getByText('Yêu cầu đã kết thúc, không nhận thêm cập nhật.',{exact:true})).toBeVisible();
  });

  test('uses audit SQL filters and removes a private detail drawer when read authority is denied',async({page})=>{
    let denied=false,reads=0;const requests:string[]=[];
    const event={id:grantId,actorId:null,actorLabel:'Hệ thống',action:'approveSupportAccess',targetType:'support-access',targetId:grantId,createdAt:stamp,reason:'Cho phép cấu hình',changes:[{field:'status',before:null,after:'APPROVED'}]};
    await routes(page,['school.read','year.read','audit.read'],(r,path)=>{
      if(path===`${base}/audit-options`)return reply(r,{actors:[{id:userId,name:'Người gửi API'}],entityTypes:['support-access']});
      if(path===`${base}/audit`){reads++;requests.push(r.request().url());return denied?deny(r):list(r,[event]);}
      return deny(r);
    });
    await page.goto(`${web}/audit`);await page.getByLabel('Lọc đối tượng',{exact:true}).selectOption('support-access');await expect.poll(()=>requests.some(u=>new URL(u).searchParams.get('targetType')==='support-access')).toBe(true);await page.getByRole('button',{name:'Xuất CSV theo bộ lọc',exact:true}).click();await expect(page.getByText('Chức năng xuất nhật ký chưa sẵn sàng. Nội dung đang xem được giữ nguyên.',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Xem chi tiết: Cho phép hỗ trợ tạm thời',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();const previous=reads;denied=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(previous);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Xem chi tiết: Cho phép hỗ trợ tạm thời',exact:true})).toHaveCount(0);
  });
});
