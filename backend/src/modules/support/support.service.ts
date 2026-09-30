import { Injectable } from '@nestjs/common';
import { Database,one,type Row,type Transaction } from '../../database/database';
import { listResource,dto } from '../../database/resources';
import { Commands,audit } from '../../common/commands';
import { Permissions,grantAllows,coversDelegatedExpiry,type Grant } from '../../common/permissions';
import { Problem,notFound,validation } from '../../common/problem';
import { platformAudit } from '../platform/platform-data';
import { ticketResource,messageResource,supportResource,supportActions,operatorSql,supportRow,supportText } from './support-data';
import type { Handler,RequestContext,Result } from '../../api.router';

@Injectable()
export class SupportService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands){}
  handlers():Record<string,Handler>{return Object.fromEntries(['listPlatformTickets','getPlatformTicket','updatePlatformTicket','listPlatformTicketMessages','postPlatformTicketMessage','listPlatformSupportAccess','listSchoolTickets','createTicket','getSchoolTicket','listSchoolMessages','postSchoolMessage','listSchoolSupportAccess','createSupportAccess','approveSupportAccess','revokeSupportAccess'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  private platform(c:RequestContext){return c.operation.path.startsWith('/api/v1/platform/');}
  private async schoolAuthority(tx:Transaction,c:RequestContext,action:string):Promise<Grant[]>{
    const schoolId=c.params.schoolId!,member=await one(tx,"SELECT m.id FROM app.memberships m JOIN platform.schools s ON s.id=m.school_id WHERE m.school_id=$1 AND m.user_id=$2 AND m.status='ACTIVE' AND m.ended_at IS NULL",[schoolId,c.principal!.userId]);if(!member)notFound();
    // Support metadata/consent remains available to a current school administrator
    // during setup or suspension. This exception never authorizes pupil data.
    const grants=await this.policy.grants(tx,c.principal!.userId,schoolId);if(!grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes(action)))throw new Problem(403,'FORBIDDEN');return grants;
  }
  private async authorize(tx:Transaction,c:RequestContext){
    if(this.platform(c))return this.policy.platform(c.principal!,'platform.support',tx);
    if(c.operation.id==='createSupportAccess'){
      const operator=await one(tx,`${operatorSql} AND u.id=$1`,[c.principal!.userId]);if(operator&&c.body.operatorId===c.principal!.userId)return;
    }
    return this.schoolAuthority(tx,c,c.operation.permission);
  }
  private version(row:Row,expected:unknown){if(row.version!==expected)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row.version));}
  private text(value:unknown,path:string,min:number){const text=supportText(value);if(text.length<min||/\b\d{9,12}\b/.test(text))validation(path,'Nội dung quá ngắn hoặc chứa số giấy tờ/số điện thoại cá nhân');return text;}
  private async ticket(tx:Transaction,c:RequestContext,lock=false){
    const row=await one<Row>(tx,`SELECT * FROM platform.support_tickets WHERE id=$1${this.platform(c)?'':' AND school_id=$2'}${lock?' FOR UPDATE':''}`,this.platform(c)?[c.params.ticketId]:[c.params.ticketId,c.params.schoolId]);if(!row)notFound();return row;
  }
  private async ticketView(tx:Transaction,row:Row){
    const view=dto(ticketResource,(await one<Row>(tx,`SELECT * FROM ${ticketResource.table} t WHERE t.id=$1`,[row.id]))!),operators=(await tx.query<{id:string;display_name:string}>(`${operatorSql} ORDER BY u.display_name,u.id LIMIT 101`)).rows;if(operators.length>100)throw new Problem(422,'OPERATOR_CHOICE_LIMIT');
    return {...view,operatorChoices:operators.map(u=>({id:u.id,name:u.display_name}))};
  }
  private async grant(tx:Transaction,c:RequestContext){const row=await one<Row>(tx,'SELECT * FROM platform.support_access WHERE school_id=$1 AND id=$2 FOR UPDATE',[c.params.schoolId,c.params.supportAccessId]);if(!row)notFound();return row;}
  private async consent(tx:Transaction,c:RequestContext,row:Row){
    const grants=await this.schoolAuthority(tx,c,'support.approve'),scope={schoolId:c.params.schoolId!,...(row.class_id?{classId:String(row.class_id)}:{})},school=(await one<{today:string}>(tx,"SELECT to_char(now() AT TIME ZONE timezone,'YYYY-MM-DD') AS today FROM platform.schools WHERE id=$1",[scope.schoolId]))!;
    const from=new Date(row.valid_from as Date),until=new Date(row.valid_until as Date);
    if(!grants.some(g=>g.scope_type==='SCHOOL'&&g.actions.includes('support.approve')&&coversDelegatedExpiry(g,from,until)))throw new Problem(403,'DELEGATION_CEILING');
    for(const action of row.allowed_actions as string[]){const required=action==='import.read'?'import.manage':action;if(!grants.some(g=>grantAllows(g,required,scope,school.today)&&coversDelegatedExpiry(g,from,until)))throw new Problem(403,'DELEGATION_CEILING');}
    if(c.principal!.userId===row.operator_id)throw new Problem(403,'SELF_SUPPORT_APPROVAL_FORBIDDEN');
  }
  private async log(tx:Transaction,c:RequestContext,type:string,id:string,schoolId:string,status:string){
    const actor={...c,params:{...c.params,schoolId}};await platformAudit(tx,actor,type,id,{status});if(!this.platform(c))await audit(tx,actor,type,id,{status});
  }
  private async handle(c:RequestContext):Promise<Result>{
    const op=c.operation.id,global=this.platform(c),schoolId=global?null:c.params.schoolId!,authorize=(tx:Transaction)=>this.authorize(tx,c);
    const work=async(tx:Transaction):Promise<Result>=>{
      if(['listPlatformTickets','listSchoolTickets'].includes(op))return listResource(tx,ticketResource,schoolId,{...c.query,sort:c.query.sort??'createdAt',dir:c.query.dir??'desc'},undefined,c.principal!.userId);
      if(['listPlatformSupportAccess','listSchoolSupportAccess'].includes(op))return listResource(tx,supportResource,schoolId,{...c.query,sort:c.query.sort??'createdAt',dir:c.query.dir??'desc'},undefined,c.principal!.userId);
      if(op==='createSupportAccess'){
        const ticket=await one<Row>(tx,'SELECT * FROM platform.support_tickets WHERE school_id=$1 AND id=$2',[schoolId,c.body.ticketId]);if(!ticket)notFound();if(['RESOLVED','CLOSED'].includes(String(ticket.status)))throw new Problem(409,'TICKET_CLOSED');
        if(!await one(tx,`${operatorSql} AND u.id=$1`,[c.body.operatorId]))validation('operatorId','Operator không còn quyền hỗ trợ');
        const actions=c.body.allowedActions as string[],from=new Date(String(c.body.validFrom)),until=new Date(String(c.body.validUntil));
        if(!actions.length||new Set(actions).size!==actions.length||actions.some(a=>!(supportActions as readonly string[]).includes(a)))validation('allowedActions','Chỉ chọn phạm vi hỗ trợ đọc được cho phép');
        if(c.body.classId){if(actions.some(a=>!['class.read','assignment.read'].includes(a)))validation('allowedActions','Phạm vi lớp chỉ gồm cấu trúc và phân công lớp');if(!await one(tx,'SELECT id FROM app.classes WHERE school_id=$1 AND id=$2',[schoolId,c.body.classId]))notFound();}
        if(!Number.isFinite(from.getTime())||!Number.isFinite(until.getTime())||until<=from||until.getTime()<=Date.now()||until.getTime()-from.getTime()>14*86400000)validation('validUntil','Thời gian hỗ trợ cần còn hạn và không quá 14 ngày');
        const reason=this.text(c.body.reason,'reason',5),row=(await one<Row>(tx,"INSERT INTO platform.support_access(school_id,ticket_id,operator_id,class_id,allowed_actions,reason,valid_from,valid_until,requested_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[schoolId,ticket.id,c.body.operatorId,c.body.classId??null,actions,reason,from,until,c.principal!.userId]))!;await this.log(tx,c,'support-access',String(row.id),schoolId!,'REQUESTED');return {data:await supportRow(tx,schoolId!,String(row.id)),status:201};
      }
      if(['approveSupportAccess','revokeSupportAccess'].includes(op)){
        const row=await this.grant(tx,c);this.version(row,c.body.expectedVersion);
        if(op==='approveSupportAccess'){if(row.status!=='REQUESTED'||new Date(row.valid_until as Date).getTime()<=Date.now())throw new Problem(409,'SUPPORT_ACCESS_UNAVAILABLE');await this.consent(tx,c,row);await tx.query("UPDATE platform.support_access SET status='APPROVED',approved_by_user_id=$3 WHERE school_id=$1 AND id=$2",[schoolId,row.id,c.principal!.userId]);}
        else{const reject=c.body.decision==='REJECT';if(reject?row.status!=='REQUESTED':!['REQUESTED','APPROVED'].includes(String(row.status)))throw new Problem(409,'INVALID_STATE');await tx.query('UPDATE platform.support_access SET status=$3,revoked_at=now() WHERE school_id=$1 AND id=$2',[schoolId,row.id,reject?'REJECTED':'REVOKED']);}
        const view=await supportRow(tx,schoolId!,String(row.id));await this.log(tx,c,'support-access',String(row.id),schoolId!,String(view.status));return {data:view};
      }
      if(op==='createTicket'){
        const row=(await one<Row>(tx,'INSERT INTO platform.support_tickets(school_id,requester_id,subject,description,priority) VALUES($1,$2,$3,$4,$5) RETURNING *',[schoolId,c.principal!.userId,this.text(c.body.subject,'subject',5),this.text(c.body.description,'description',10),c.body.priority]))!;await this.log(tx,c,'ticket',String(row.id),schoolId!,'OPEN');return {data:await this.ticketView(tx,row),status:201};
      }
      const ticket=await this.ticket(tx,c,c.operation.method!=='GET');
      if(['getPlatformTicket','getSchoolTicket'].includes(op))return {data:await this.ticketView(tx,ticket)};
      if(['listPlatformTicketMessages','listSchoolMessages'].includes(op))return listResource(tx,messageResource,global?null:schoolId,{...c.query,sort:c.query.sort??'createdAt',dir:c.query.dir??'asc'},{sql:'t.ticket_id=$1',values:[ticket.id]},c.principal!.userId);
      if(op==='updatePlatformTicket'){
        this.version(ticket,c.body.expectedVersion);if(c.body.assigneeId&&!await one(tx,`${operatorSql} AND u.id=$1`,[c.body.assigneeId]))validation('assigneeId','Người phụ trách không có quyền hỗ trợ');
        const row=(await one<Row>(tx,'UPDATE platform.support_tickets SET status=$2,assignee_id=$3 WHERE id=$1 RETURNING *',[ticket.id,c.body.status??ticket.status,Object.hasOwn(c.body,'assigneeId')?c.body.assigneeId:ticket.assignee_id]))!;await this.log(tx,c,'ticket',String(row.id),String(row.school_id),String(row.status));return {data:await this.ticketView(tx,row)};
      }
      if(['postPlatformTicketMessage','postSchoolMessage'].includes(op)){
        if(['RESOLVED','CLOSED'].includes(String(ticket.status)))throw new Problem(409,'TICKET_CLOSED');const body=this.text(c.body.body,'body',3),message=(await one<Row>(tx,'INSERT INTO platform.support_messages(ticket_id,author_id,body,side) VALUES($1,$2,$3,$4) RETURNING *',[ticket.id,c.principal!.userId,body,global?'PLATFORM':'SCHOOL']))!;
        if(!global&&ticket.status==='WAITING_SCHOOL')await tx.query("UPDATE platform.support_tickets SET status='IN_PROGRESS' WHERE id=$1",[ticket.id]);await this.log(tx,c,'support-message',String(message.id),String(ticket.school_id),'POSTED');const view=(await one<Row>(tx,`SELECT * FROM ${messageResource.table} m WHERE m.id=$1`,[message.id]))!;return {data:dto(messageResource,view),status:201};
      }
      throw new Error('Unexpected registered support operation');
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId:schoolId??undefined,userId:c.principal!.userId,readOnly:true});
    return global?this.commands.platform(c,authorize,work):this.commands.execute(c,authorize,work);
  }
}
