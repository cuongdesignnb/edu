import type {ID,SupportTicket} from '../../model/types';
import type {Ctx,ListQuery} from '../core';
import {http} from '../../api/client';
import {apiList,apiPage} from '../../api/lists';
import {supportGrant,supportTicket,supportMessage,platformAudit} from './platform-mapping';
import {withStaffAccess,displayedVersion,commandReason,formResult} from './common';

/** School support adapters use separate native ticket and consent permissions. */
export const connectedSupportRepo=withStaffAccess({
  async overview(_ctx:Ctx,schoolId:ID,ticketQuery:ListQuery={},grantQuery:ListQuery={}){
    const summary=(await http('getSchoolSupportSummary',{params:{schoolId}})).data;
    const [tickets,grants]=await Promise.all([
      apiPage('listSchoolTickets',{params:{schoolId},query:{q:ticketQuery.q,status:ticketQuery.filters?.status?.toUpperCase(),priority:ticketQuery.filters?.priority?.toUpperCase(),sort:ticketQuery.sort??'createdAt',dir:ticketQuery.dir??'desc'}},ticketQuery,supportTicket),
      summary.canApprove?apiPage('listSchoolSupportAccess',{params:{schoolId},query:{q:grantQuery.q,viewStatus:grantQuery.filters?.status,sort:grantQuery.sort??'createdAt',dir:grantQuery.dir??'desc'}},grantQuery,supportGrant):null,
    ]);
    return {tickets,grants,counts:summary.queue,grantCounts:summary.grants,canApprove:summary.canApprove};
  },
  async ticket(_ctx:Ctx,schoolId:ID,ticketId:ID){
    const summary=(await http('getSchoolSupportSummary',{params:{schoolId}})).data;
    const [value,messages,grants]=await Promise.all([http('getSchoolTicket',{params:{schoolId,ticketId}}),apiList('listSchoolMessages',{params:{schoolId,ticketId},query:{sort:'createdAt',dir:'asc'}},2000),summary.canApprove?apiList('listSchoolSupportAccess',{params:{schoolId},query:{ticketId}},1000):null]);
    const ticket=supportTicket(value.data),updates=messages.map(supportMessage);return {ticket:{...ticket,updates},updates,createdByName:ticket.createdByName,assigneeName:ticket.assigneeName,grants:grants?.map(supportGrant)??null,canApprove:summary.canApprove};
  },
  async createTicket(_ctx:Ctx,schoolId:ID,input:{title:string;body:string;priority:SupportTicket['priority']}){
    return supportTicket((await formResult(http('createTicket',{params:{schoolId},body:{subject:input.title.trim(),description:input.body.trim(),priority:input.priority.toUpperCase() as 'LOW'|'NORMAL'|'HIGH'}}),{subject:'title',description:'body'})).data);
  },
  async addUpdate(_ctx:Ctx,schoolId:ID,ticketId:ID,text:string){return supportMessage((await formResult(http('postSchoolMessage',{params:{schoolId,ticketId},body:{body:text.trim()}}),{body:'text'})).data);},
  async decideGrant(_ctx:Ctx,schoolId:ID,grantId:ID,decision:'approve'|'decline'|'revoke',expectedVersion?:number,reason?:string){
    const version=displayedVersion(expectedVersion),params={schoolId,supportAccessId:grantId};
    return supportGrant(decision==='approve'?(await http('approveSupportAccess',{params,body:{expectedVersion:version}})).data:(await http('revokeSupportAccess',{params,body:{expectedVersion:version,reason:commandReason(reason),decision:decision==='decline'?'REJECT':'REVOKE'}})).data);
  },
  async audit(_ctx:Ctx,schoolId:ID,q:ListQuery){
    const [page,options]=await Promise.all([apiPage('listSchoolAudit',{params:{schoolId},query:{q:q.q,targetType:q.filters?.entityType,actorId:q.filters?.actor,from:q.filters?.from,to:q.filters?.to,sort:q.sort??'createdAt',dir:q.dir??'desc'}},q,row=>({...platformAudit(row),level:'school' as const,schoolId})),http('getSchoolAuditOptions',{params:{schoolId}})]);
    return {...page,...options.data,canView:true};
  },
});
