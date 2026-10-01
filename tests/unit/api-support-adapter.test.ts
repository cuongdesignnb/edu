import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {supportRepo as connectedSupportRepo} from '@/lib/repositories';
import {authenticationChanged,authorizationChanged,captureStaffAccess,onStaffMutationAcknowledged,setStaffCsrf} from '@/lib/api/client';
import type {Ctx} from '@/lib/repositories/core';

const ctx={} as Ctx,id='00000000-0000-4000-8000-000000000001';
const ticket={id,schoolId:id,subject:'Yêu cầu API',description:'Nội dung API',status:'WAITING_SCHOOL',priority:'HIGH',requesterId:id,requesterName:'Người gửi API',schoolName:'Trường API',schoolStatus:'ACTIVE',version:4,createdAt:'2026-09-30T00:00:00Z',updatedAt:'2026-09-30T00:00:00Z',messageCount:12};
const queue={total:41,open:10,inProgress:15,waitingSchool:12,resolved:4,high:7};
const grant={id,schoolId:id,ticketId:id,operatorId:id,operatorName:'Operator thật',schoolName:'Trường API',allowedActions:['class.read'],reason:'Kiểm tra cấu trúc',version:3,status:'REQUESTED',viewStatus:'requested',effective:false,validFrom:'2026-09-30T00:00:00Z',validUntil:'2026-10-02T00:00:00Z'};
const envelope=(data:unknown,page?:unknown)=>new Response(JSON.stringify({data,requestId:'support-adapter',...(page?{page}:{})}));
const page={limit:10,total:12,hasMore:false,nextCursor:null};
beforeEach(()=>{authenticationChanged();setStaffCsrf('fixture-csrf');});
afterEach(()=>{authenticationChanged();vi.unstubAllGlobals();});

describe('activated native school support adapters',()=>{
  it('uses SQL pages and exact queue totals without borrowing support.approve',async()=>{
    const fetcher=vi.fn().mockImplementation((url:string)=>Promise.resolve(url.includes('support-summary')?envelope({queue,grants:null,canApprove:false}):envelope([ticket],page)));vi.stubGlobal('fetch',fetcher);
    const view=await connectedSupportRepo.overview(ctx,id,{pageSize:10,q:'API',filters:{status:'waiting_school',priority:'high'}});
    expect(view.counts.total).toBe(41);expect(view.tickets.total).toBe(12);expect(view.tickets.items[0]).toMatchObject({messageCount:12,version:4});expect(view.grants).toBeNull();expect(view.grantCounts).toBeNull();expect(view.canApprove).toBe(false);expect(fetcher.mock.calls[1][0]).toContain('q=API&status=WAITING_SCHOOL&priority=HIGH');expect(fetcher.mock.calls.some(([url])=>String(url).includes('support-access'))).toBe(false);
  });
  it('loads real updates and filters grants by the exact ticket before paging',async()=>{
    const message={id,authorId:null,authorLabel:'Người gửi lịch sử',body:'Cập nhật API',createdAt:'2026-09-30T01:00:00Z',side:'UNKNOWN'};
    const fetcher=vi.fn().mockImplementation((url:string)=>Promise.resolve(url.includes('support-summary')?envelope({queue,grants:{total:1},canApprove:true}):url.includes('messages')?envelope([message],page):url.includes('support-access')?envelope([grant],page):envelope(ticket)));vi.stubGlobal('fetch',fetcher);
    const view=await connectedSupportRepo.ticket(ctx,id,id);expect(view.updates[0]).toMatchObject({by:undefined,byName:'Người gửi lịch sử',side:'unknown'});expect(view.grants?.[0]).toMatchObject({canonicalStatus:'REQUESTED',effective:false});expect(fetcher.mock.calls.some(([url])=>String(url).includes(`support-access?ticketId=${id}`))).toBe(true);
  });
  it('requires the displayed version and human reason, with the exact declined intent on uncertain retry',async()=>{
    const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
    await expect(connectedSupportRepo.decideGrant(ctx,id,id,'approve')).rejects.toMatchObject({code:'CONFLICT'});
    await expect(connectedSupportRepo.decideGrant(ctx,id,id,'decline',3)).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{reason:expect.any(String)}});expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(envelope({...grant,status:'REJECTED',viewStatus:'declined',version:4}));
    await expect(connectedSupportRepo.decideGrant(ctx,id,id,'decline',3,'Không cần hỗ trợ')).rejects.toMatchObject({code:'NETWORK'});const value=await connectedSupportRepo.decideGrant(ctx,id,id,'decline',3,'Không cần hỗ trợ');expect(value.status).toBe('declined');expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({expectedVersion:3,reason:'Không cần hỗ trợ',decision:'REJECT'});
  });
  it('maps native field errors and fails visibly when the support API is unavailable',async()=>{
    const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:'VALIDATION_ERROR',fieldErrors:[{path:'/description',message:'Nội dung không hợp lệ'}]}),{status:422})).mockResolvedValueOnce(new Response(JSON.stringify({code:'SERVICE_UNAVAILABLE'}),{status:503}));vi.stubGlobal('fetch',fetcher);
    await expect(connectedSupportRepo.createTicket(ctx,id,{title:'Yêu cầu thật',body:'Nội dung chưa hợp lệ',priority:'normal'})).rejects.toMatchObject({code:'VALIDATION',fieldErrors:{body:'Nội dung không hợp lệ'}});expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({subject:'Yêu cầu thật',description:'Nội dung chưa hợp lệ',priority:'NORMAL'});
    await expect(connectedSupportRepo.overview(ctx,id)).rejects.toMatchObject({code:'READ_ERROR',details:{httpStatus:503}});
  });
  it('filters audit actors, entity and date ranges on the server and preserves unknown prior values',async()=>{
    const event={id,actorId:null,actorLabel:'Hệ thống',action:'approveSupportAccess',targetType:'support-access',targetId:id,createdAt:'2026-09-30T00:00:00Z',changes:[{field:'status',before:null,after:'APPROVED'}]};
    const fetcher=vi.fn().mockImplementation((url:string)=>Promise.resolve(url.includes('audit-options')?envelope({actors:[{id,name:'Nhân sự thật'}],entityTypes:['support-access']}):envelope([event],page)));vi.stubGlobal('fetch',fetcher);
    const result=await connectedSupportRepo.audit(ctx,id,{pageSize:10,filters:{entityType:'support-access',actor:id,from:'2026-09-01',to:'2026-09-30'}});expect(result.items[0]).toMatchObject({level:'school',actorId:undefined,before:undefined,after:{status:'APPROVED'}});expect(result.actors).toEqual([{id,name:'Nhân sự thật'}]);expect(fetcher.mock.calls[0][0]).toContain(`targetType=support-access&actorId=${id}&from=2026-09-01&to=2026-09-30`);
  });
});


it.each([{...grant,id:'00000000-0000-4000-8000-000000000002',version:4,status:'APPROVED'},{...grant,schoolId:'00000000-0000-4000-8000-000000000002',version:4,status:'APPROVED'},{...grant,version:3,status:'APPROVED'},{...grant,version:4,status:'REJECTED'}])('holds the support consent intent until the exact grant, school, advancing version and decision are acknowledged',async bad=>{
  const approved={...grant,version:4,status:'APPROVED',viewStatus:'inactive',effective:false},ack=vi.fn(),off=onStaffMutationAcknowledged(ack),fetcher=vi.fn().mockResolvedValueOnce(envelope(bad)).mockResolvedValueOnce(envelope(approved));vi.stubGlobal('fetch',fetcher);
  try{await expect(connectedSupportRepo.decideGrant(ctx,id,id,'approve',3)).rejects.toMatchObject({code:'NETWORK'});expect(ack).not.toHaveBeenCalled();
    expect(await connectedSupportRepo.decideGrant(ctx,id,id,'approve',3)).toMatchObject({canonicalStatus:'APPROVED',status:'inactive',effective:false});expect(ack).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({expectedVersion:3});
  }finally{off();}
});
it('keeps a create-ticket draft and key after a mismatched ACK',async()=>{
  const input={title:'Yêu cầu API',body:'Nội dung API',priority:'high' as const},fetcher=vi.fn().mockResolvedValueOnce(envelope(ticket)).mockResolvedValueOnce(envelope({...ticket,status:'OPEN'}));vi.stubGlobal('fetch',fetcher);
  await expect(connectedSupportRepo.createTicket(ctx,id,input)).rejects.toMatchObject({code:'NETWORK'});expect(await connectedSupportRepo.createTicket(ctx,id,input)).toMatchObject({title:input.title,body:input.body,status:'open'});expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);
});
it('does not consume a school update whose body or author side is unconfirmed',async()=>{
  const message={id,authorId:id,authorLabel:'Người gửi API',body:'Cập nhật API',createdAt:'2026-09-30T01:00:00Z',side:'PLATFORM'},fetcher=vi.fn().mockResolvedValueOnce(envelope(message)).mockResolvedValueOnce(envelope({...message,side:'SCHOOL'}));vi.stubGlobal('fetch',fetcher);
  await expect(connectedSupportRepo.addUpdate(ctx,id,id,'Cập nhật API')).rejects.toMatchObject({code:'NETWORK'});expect(await connectedSupportRepo.addUpdate(ctx,id,id,'Cập nhật API')).toMatchObject({side:'school',text:'Cập nhật API'});expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);
});
it('rejects a foreign ticket projection without treating it as the selected source',async()=>{
  const fetcher=vi.fn().mockImplementation((url:string)=>Promise.resolve(url.includes('support-summary')?envelope({queue,grants:null,canApprove:false}):url.includes('messages')?envelope([],page):envelope({...ticket,schoolId:'00000000-0000-4000-8000-000000000002'})));vi.stubGlobal('fetch',fetcher);
  await expect(connectedSupportRepo.ticket(ctx,id,id)).rejects.toMatchObject({code:'READ_ERROR'});
});
it('does not send support reads captured before a school authority revision',async()=>{
  const stale={staffOwner:captureStaffAccess()} as Ctx,fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);authorizationChanged();
  await expect(connectedSupportRepo.overview(stale,id)).rejects.toMatchObject({code:'FORBIDDEN'});await expect(connectedSupportRepo.audit(stale,id,{})).rejects.toMatchObject({code:'FORBIDDEN'});expect(fetcher).not.toHaveBeenCalled();
});
