import type {ID,SupportTicket} from '../../model/types';
import type {Ctx,ListQuery} from '../core';
import {http} from '../../api/client';
import {apiList,apiPage} from '../../api/lists';
import {supportGrant,supportTicket,supportMessage,platformAudit} from './platform-mapping';
import {withStaffAccess,displayedVersion,commandReason,formResult,requiredValue} from './common';

/** School support adapters use separate native ticket and consent permissions. */
export const connectedSupportRepo=withStaffAccess({
  async overview(_ctx:Ctx,schoolId:ID,ticketQuery:ListQuery={},grantQuery:ListQuery={}){
    const summary=(await http('getSchoolSupportSummary',{params:{schoolId}})).data;
    const [tickets,grants]=await Promise.all([
      apiPage('listSchoolTickets',{params:{schoolId},query:{q:ticketQuery.q,status:ticketQuery.filters?.status?.toUpperCase(),priority:ticketQuery.filters?.priority?.toUpperCase(),sort:ticketQuery.sort??'createdAt',dir:ticketQuery.dir??'desc'}},ticketQuery,supportTicket),
      requiredValue(summary.canApprove,'canApprove')?apiPage('listSchoolSupportAccess',{params:{schoolId},query:{q:grantQuery.q,viewStatus:grantQuery.filters?.status,sort:grantQuery.sort??'createdAt',dir:grantQuery.dir??'desc'}},grantQuery,supportGrant):null,
    ]);
    return {tickets,grants,counts:summary.queue,grantCounts:summary.grants,canApprove:summary.canApprove};
  },
  async ticket(_ctx:Ctx,schoolId:ID,ticketId:ID){
    const summary=(await http('getSchoolSupportSummary',{params:{schoolId}})).data;
    const [value,messages,grants]=await Promise.all([http('getSchoolTicket',{params:{schoolId,ticketId},validateData:row=>row.id===ticketId&&row.schoolId===schoolId}),apiList('listSchoolMessages',{params:{schoolId,ticketId},query:{sort:'createdAt',dir:'asc'}},2000),requiredValue(summary.canApprove,'canApprove')?apiList('listSchoolSupportAccess',{params:{schoolId},query:{ticketId}},1000):null]);
    const ticket=supportTicket(value.data),updates=messages.map(supportMessage);return {ticket:{...ticket,updates},updates,createdByName:ticket.createdByName,assigneeName:ticket.assigneeName,grants:grants?.map(supportGrant)??null,canApprove:summary.canApprove};
  },
  async createTicket(_ctx:Ctx,schoolId:ID,input:{title:string;body:string;priority:SupportTicket['priority']}){
    const body={subject:input.title.trim(),description:input.body.trim(),priority:input.priority.toUpperCase() as 'LOW'|'NORMAL'|'HIGH'};
    return supportTicket((await formResult(http('createTicket',{params:{schoolId},body,validateData:row=>!!row.id&&row.schoolId===schoolId&&Number.isInteger(row.version)&&row.version>0&&row.status==='OPEN'&&row.subject===body.subject&&row.description===body.description&&row.priority===body.priority}),{subject:'title',description:'body'})).data);
  },
  async addUpdate(_ctx:Ctx,schoolId:ID,ticketId:ID,text:string){const body=text.trim();return supportMessage((await formResult(http('postSchoolMessage',{params:{schoolId,ticketId},body:{body},validateData:row=>!!row.id&&row.body===body&&row.side==='SCHOOL'}),{body:'text'})).data);},
  async decideGrant(_ctx:Ctx,schoolId:ID,grantId:ID,decision:'approve'|'decline'|'revoke',expectedVersion?:number,reason?:string){
    const version=displayedVersion(expectedVersion),params={schoolId,supportAccessId:grantId};
    const status=decision==='approve'?'APPROVED':decision==='decline'?'REJECTED':'REVOKED',confirmed=(row:{id:string|null;schoolId:string|null;version:number;status:string})=>row.id===grantId&&row.schoolId===schoolId&&Number.isInteger(row.version)&&row.version>version&&row.status===status;
    return supportGrant(decision==='approve'?(await http('approveSupportAccess',{params,body:{expectedVersion:version},validateData:confirmed})).data:(await http('revokeSupportAccess',{params,body:{expectedVersion:version,reason:commandReason(reason),decision:decision==='decline'?'REJECT':'REVOKE'},validateData:confirmed})).data);
  },
  async audit(_ctx:Ctx,schoolId:ID,q:ListQuery){
    const [page,options]=await Promise.all([apiPage('listSchoolAudit',{params:{schoolId},query:{q:q.q,targetType:q.filters?.entityType,actorId:q.filters?.actor,from:q.filters?.from,to:q.filters?.to,sort:q.sort??'createdAt',dir:q.dir??'desc'}},q,row=>({...platformAudit(row),level:'school' as const,schoolId})),http('getSchoolAuditOptions',{params:{schoolId}})]);
    return {...page,actors:requiredValue(options.data.actors,'actors'),entityTypes:requiredValue(options.data.entityTypes,'entityTypes'),canView:true};
  },
});
