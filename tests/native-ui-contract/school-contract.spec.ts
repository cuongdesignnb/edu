import {expect,test,type Page,type Route} from '@playwright/test';

const schoolId='10000000-0000-4000-8000-000000000001',yearId='10000000-0000-4000-8000-000000000002',gradeId='10000000-0000-4000-8000-000000000003',classId='10000000-0000-4000-8000-000000000004';
const userId='10000000-0000-4000-8000-000000000005',memberId='10000000-0000-4000-8000-000000000006';
const base=`/api/v1/schools/${schoolId}`,web=`/school/${schoolId}`;
const year={id:yearId,version:1,code:'2026-2027',name:'2026–2027',startsOn:'2026-09-01',endsOn:'2027-06-01',status:'DRAFT',terms:[],classCount:0,studentCount:0};
const school=(version=7)=>({id:schoolId,version,code:'NATIVE',name:'Trường từ API',slug:'native-school',shortName:`API ${version}`,province:'TP.HCM',level:null,accentColor:'#123456',motto:'Học tốt',publicIntro:'Thông tin từ API',publicContactEmail:null,publicContactPhone:null,publicAddress:null,website:null,status:'ACTIVE',createdAt:'2026-09-01T00:00:00Z'});
const context=(actions:string[])=>({user:{id:userId,version:1,displayName:'Nhân sự native',email:'synthetic@example.invalid',status:'ACTIVE'},platformActions:[],csrfToken:'school-contract-csrf',mode:'connected',serverNow:new Date().toISOString(),memberships:[{memberId,schoolId,schoolName:'Trường từ API',schoolCode:'NATIVE',schoolSlug:'native-school',schoolStatus:'ACTIVE',status:'ACTIVE',timezone:'Asia/Ho_Chi_Minh',today:'2026-10-01',duties:[],grants:[{id:memberId,version:1,roleId:memberId,roleCode:'CUSTOM',roleLabel:'Vai trò từ API',scopeType:'SCHOOL',validFrom:'2020-01-01T00:00:00Z',validUntil:null,revokedAt:null,actions}]}]});
const reply=(route:Route,data:unknown)=>route.fulfill({status:200,json:{data,requestId:'school-browser-contract'}});
const list=(route:Route,data:unknown[])=>route.fulfill({status:200,json:{data,requestId:'school-browser-contract',page:{limit:100,total:data.length,nextCursor:null,hasMore:false}}});
async function routes(page:Page,actions:string[],handler:(route:Route,path:string)=>Promise<unknown>){
  await page.route('**/api/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/v1/me/context')return reply(route,context(actions));
    if(path==='/api/v1/me/notifications')return list(route,[]);
    return handler(route,path);
  });
}
const denied=(route:Route)=>route.fulfill({status:403,json:{code:'PERMISSION_DENIED',requestId:'school-browser-contract'}});

test.describe('Native school browser contract — intercepted API, separate from PostgreSQL E2E',()=>{
  test('keeps school edits on a transient read failure and removes the private form on forbidden reads',async({page})=>{
    let failure=0;let reads=0;
    await routes(page,['school.read','school.settings','year.read'],(route,path)=>{
      if(path===`${base}/academic-years`)return list(route,[year]);
      if(path===`${base}/profile`){reads++;return failure?route.fulfill({status:failure,json:{code:failure===503?'SERVICE_UNAVAILABLE':'PERMISSION_DENIED',requestId:'read-failure'}}):reply(route,school());}
      return denied(route);
    });
    await page.goto(`${web}/profile`);await expect(page.getByLabel(/^Tên viết tắt/)).toHaveValue('API 7');await page.getByLabel(/^Tên viết tắt/).fill('Nội dung chưa lưu');
    const previous=reads;failure=503;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(previous);
    await expect(page.getByLabel(/^Tên viết tắt/)).toHaveValue('Nội dung chưa lưu');await expect(page.getByRole('button',{name:'Lưu thông tin',exact:true})).toBeEnabled();
    failure=403;await page.getByRole('button',{name:'Thử lại',exact:true}).first().click();await expect(page.getByLabel(/^Tên viết tắt/)).toHaveCount(0);
  });

  test('accepts nullable public contacts and clears dirty state only after a matching profile ACK',async({page})=>{
    let profile=school();const commands:Record<string,unknown>[]=[];
    await routes(page,['school.read','school.settings','year.read'],(route,path)=>{
      if(path===`${base}/academic-years`)return list(route,[year]);
      if(path===`${base}/profile`){if(route.request().method()==='PATCH'){const body=route.request().postDataJSON();commands.push(body);profile={...profile,...body,version:8};}return reply(route,profile);}
      return denied(route);
    });
    await page.goto(`${web}/profile`);await expect(page.getByLabel(/^Email liên hệ/)).toHaveValue('');await page.getByLabel(/^Tên viết tắt/).fill('API đã lưu');await page.getByRole('button',{name:'Lưu thông tin',exact:true}).click();
    await expect(page.getByText('Đã lưu thông tin trường',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Lưu thông tin',exact:true})).toBeDisabled();expect(commands).toHaveLength(1);expect(commands[0]).toMatchObject({expectedVersion:7,shortName:'API đã lưu',publicContactEmail:null,publicContactPhone:null});
  });

  test('opens a school without years and keeps year creation reachable',async({page})=>{
    const forbiddenReads:string[]=[];
    await routes(page,['school.read','year.read','year.manage'],(route,path)=>{
      if(path===`${base}/profile`)return reply(route,school());
      if(path===`${base}/academic-years`)return list(route,[]);
      forbiddenReads.push(path);return denied(route);
    });
    await page.goto(web);await expect(page.getByText('Chưa có năm học',{exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Tạo năm học',exact:true}).click();await expect(page.getByRole('heading',{name:'Tạo năm học',exact:true})).toBeVisible();
    expect(forbiddenReads).toEqual([]);expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
    await page.screenshot({path:'qa/backend/b6-native-school-bootstrap-desktop.png',fullPage:true});
  });

  test('keeps a reviewed school profile through background refresh and reloads explicitly after conflict',async({page})=>{
    let latest=school();let reads=0;const writes:Record<string,unknown>[]=[];
    await routes(page,['school.read','school.settings','year.read'],(route,path)=>{
      if(path===`${base}/academic-years`)return list(route,[year]);
      if(path===`${base}/profile`){
        if(route.request().method()==='PATCH'){writes.push(route.request().postDataJSON());return route.fulfill({status:409,json:{code:'VERSION_CONFLICT',requestId:'profile-conflict'}});}
        reads++;return reply(route,latest);
      }
      return denied(route);
    });
    await page.goto(`${web}/profile`);await expect(page.getByLabel(/^Tên viết tắt/)).toHaveValue('API 7');await page.getByLabel(/^Tên viết tắt/).fill('Bản đang sửa');
    const previous=reads;latest=school(8);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>reads).toBeGreaterThan(previous);
    await expect(page.getByLabel(/^Tên viết tắt/)).toHaveValue('Bản đang sửa');await page.getByRole('button',{name:'Lưu thông tin',exact:true}).click();
    await expect(page.getByRole('button',{name:'Tải bản mới nhất'})).toBeVisible();expect(writes).toHaveLength(1);expect(writes[0].expectedVersion).toBe(7);expect(writes[0].publicContactEmail).toBeNull();
    await expect(page.getByLabel(/^Tên viết tắt/)).toHaveValue('Bản đang sửa');await page.getByRole('button',{name:'Tải bản mới nhất'}).click();await expect(page.getByLabel(/^Tên viết tắt/)).toHaveValue('API 8');await expect(page.getByRole('button',{name:'Lưu thông tin',exact:true})).toBeDisabled();
  });

  test('creates a class with class authority alone, retains a wrong ACK and retries one atomic command',async({page})=>{
    const commands:{body:Record<string,unknown>;key:string}[]=[],metadataReads:string[]=[];
    const grade={id:gradeId,version:1,code:'10',name:'Khối 10',status:'ACTIVE',gradeLevel:10};
    const saved={id:classId,version:1,yearId,gradeLevelId:gradeId,name:'10A1',code:'10A1',capacity:40,status:'DRAFT',roomId:null};
    await routes(page,['school.read','year.read','class.read','class.manage'],(route,path)=>{
      if(path===`${base}/profile`)return reply(route,school());
      if(path===`${base}/academic-years`)return list(route,[year]);
      if(path===`${base}/dictionaries/grades`)return list(route,[grade]);
      if(path===`${base}/dictionaries/rooms`)return list(route,[]);
      if(path===`${base}/classes`){
        if(route.request().method()==='POST'){
          commands.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
          return reply(route,{...saved,gradeLevelId:commands.length===1?schoolId:gradeId});
        }
        return list(route,[]);
      }
      metadataReads.push(path);return denied(route);
    });
    await page.goto(`${web}/classes`);await page.getByRole('button',{name:'Tạo lớp',exact:true}).first().click();
    await expect(page.getByRole('heading',{name:'Tạo lớp mới'})).toBeVisible();await page.getByRole('dialog').getByLabel(/^Khối/).selectOption(gradeId);await page.getByLabel(/^Tên lớp/).fill('10A1');
    await expect(page.getByRole('combobox',{name:/Giáo viên chủ nhiệm \(tùy chọn\)/})).toHaveCount(0);
    await page.getByRole('button',{name:'Tạo lớp',exact:true}).last().click();await expect(page.getByRole('heading',{name:'Tạo lớp mới'})).toBeVisible();await expect(page.getByLabel(/^Tên lớp/)).toHaveValue('10A1');
    await page.getByRole('button',{name:'Tạo lớp',exact:true}).last().click();await expect(page.getByRole('heading',{name:'Tạo lớp mới'})).toHaveCount(0);
    expect(commands).toHaveLength(2);expect(commands[0].key).toBeTruthy();expect(commands[1]).toEqual(commands[0]);expect(commands[1].body).toEqual({name:'10A1',gradeLevelId:gradeId,capacity:40,roomId:null,code:'10A1',yearId});expect(metadataReads).toEqual([]);
  });

  test('shows the year calendar with year authority alone and labels denied class data',async({page})=>{
    const requests:string[]=[];
    await routes(page,['school.read','year.read','year.manage'],(route,path)=>{
      requests.push(path);
      if(path===`${base}/profile`)return reply(route,school());
      if(path===`${base}/academic-years`)return list(route,[year]);
      if(path===`${base}/academic-years/${yearId}`)return reply(route,year);
      if(path===`${base}/weeks`||path===`${base}/calendar-events`)return list(route,[]);
      return denied(route);
    });
    await page.goto(`${web}/academic-years/${yearId}`);await expect(page.getByText('Không có quyền xem lớp của năm học',{exact:true})).toBeVisible();
    expect(requests.some(path=>path.includes('/classes')||path.includes('/dictionaries')||path.includes('/members'))).toBe(false);
    await page.screenshot({path:'qa/backend/b6-native-school-year-only-desktop.png',fullPage:true});
  });
});
