import type {ActionKey,ID,StaffNotification,StaffUser} from '../../model/types';
import type {Ctx} from '../core';
import type {Me} from '../session';
import type {ApiSchemas} from '../../api/generated';
import {http,authenticationChanged,authorizationChanged,captureStaffAccess} from '../../api/client';
import {apiList} from '../../api/lists';
import {loginStaff,refreshStaffContext,readStaffContext} from '../../api/session';
import {invitationCredential,consumeInvitation} from '../../api/fragments';
import {uiActions} from '../../api/permissions';
import {ACTION_LABELS} from '../../permissions/actions';
import {RepoError} from '../errors';
import {formResult,assertStaffCtx} from './common';

function identity(user:ApiSchemas['User'],platform=false):StaffUser{
  if(!user.id)throw new RepoError('READ_ERROR','Hồ sơ API thiếu mã người dùng.');
  return {id:user.id,fullName:user.displayName,email:user.email,workPhone:user.workPhone??'',bio:user.bio??undefined,avatarTone:'blue',version:user.version,isPlatformOperator:platform};
}
function notification(row:ApiSchemas['Notification'],userId:string):StaffNotification&{schoolName:string;accessible:boolean}{
  if(!row.id||!row.schoolId||!['task','announcement','system','permission'].includes(row.kind))throw new RepoError('READ_ERROR','Thông báo API không đúng hợp đồng.');
  const base=`/school/${encodeURIComponent(row.schoolId)}`,classBase=row.classId&&row.yearId?`/classroom/${encodeURIComponent(row.schoolId)}/${encodeURIComponent(row.yearId)}/${encodeURIComponent(row.classId)}`:undefined;
  const routes:Record<string,string|undefined>={announcement:`${base}/announcements/${row.targetId}`,assignment:`${base}/assignments`,class:classBase,attendance:classBase?`${classBase}/attendance`:undefined,conduct:classBase?`${classBase}/conduct`:undefined,activity:classBase?`${classBase}/activities/${row.targetId}`:undefined};
  return {id:row.id,schoolId:row.schoolId,userId,kind:row.kind as StaffNotification['kind'],title:row.title,body:row.body??'',createdAt:row.createdAt,readAt:row.readAt??undefined,schoolName:row.schoolName??'',accessible:row.accessible===true,href:row.accessible&&row.targetId?routes[row.targetType]:undefined};
}
export const connectedSessionRepo={
  /** Historical method name retained for the existing login form; authentication is performed by the API. */
  demoLogin:loginStaff,
  async me(_ctx:Ctx):Promise<Me>{
    assertStaffCtx(_ctx);
    const value=await refreshStaffContext();return {user:identity(value.user,value.platformActions.length>0),isPlatform:value.platformActions.length>0,
      workspaces:value.memberships.map(m=>{
        if(!m.schoolId||!m.memberId)throw new RepoError('READ_ERROR','Không gian API thiếu mã trường hoặc thành viên.');
        return {school:{id:m.schoolId,name:m.schoolName,shortName:m.schoolShortName,slug:m.schoolSlug,status:m.schoolStatus.toLowerCase() as Me['workspaces'][number]['school']['status']},membershipId:m.memberId,membershipStatus:m.status==='ACTIVE'?'active':m.status==='ENDED'?'revoked':'suspended',department:m.department,
          roleNames:[...new Set(m.grants.filter(g=>g.scopeType==='SCHOOL').map(g=>g.roleLabel))],duties:m.duties.map(d=>d.kind==='HOMEROOM'?`Chủ nhiệm ${d.className}`:`${d.subjectName??''} ${d.className}`),schoolWorkspace:m.schoolWorkspace,teacherWorkspace:m.teacherWorkspace};
      })};
  },
  async schoolActions(_ctx:Ctx,schoolId:ID):Promise<ActionKey[]>{
    assertStaffCtx(_ctx);
    return [...uiActions(await refreshStaffContext(),{schoolId})].filter(key=>ACTION_LABELS[key].level==='school');
  },
  async updateProfile(_ctx:Ctx,patch:{fullName:string;workPhone:string;bio?:string;version:number}){
    assertStaffCtx(_ctx);const access=captureStaffAccess();
    const row=(await formResult(http('updateMyProfile',{body:{expectedVersion:patch.version,displayName:patch.fullName,workPhone:patch.workPhone,bio:patch.bio??null}}),{displayName:'fullName',expectedVersion:'version'})).data;
    access.assertCurrent();return identity(row,!!readStaffContext()?.platformActions.length);
  },
  async invitation(_ctx:Ctx,inviteId:ID){
    const secret=invitationCredential(inviteId),row=(await http('inspectInvitation',{body:secret})).data;
    if(row.id!==inviteId||!row.schoolId||!row.schoolName||!row.schoolStatus||typeof row.requiresLogin!=='boolean'||typeof row.signedInAsInvited!=='boolean')throw new RepoError('READ_ERROR','Lời mời API không đúng ngữ cảnh.');
    return {invitation:{id:row.id,schoolId:row.schoolId,email:row.email,fullName:row.workDisplayName??'',roleTemplateIds:[] as ID[],roleCodes:row.roleCodes??[],proposedDuty:(row.roleLabels??[]).join(', '),createdAt:row.createdAt,expiresAt:row.expiresAt,status:row.status.toLowerCase() as 'pending'|'accepted'|'declined'|'revoked'},school:{id:row.schoolId,name:row.schoolName,status:row.schoolStatus.toLowerCase() as 'draft'|'active'|'suspended'|'archived'},inviterName:row.inviterName??'',existingUser:row.requiresLogin?{email:row.email,fullName:row.workDisplayName??''}:undefined,signedInAsInvited:row.signedInAsInvited};
  },
  async respondInvitation(_ctx:Ctx,inviteId:ID,accept:boolean,fullName?:string,newPassword?:string){
    assertStaffCtx(_ctx);const access=captureStaffAccess();
    const secret=invitationCredential(inviteId);
    const validateData=(value:ApiSchemas['Ack'])=>value?.id===inviteId&&value.status===(accept?'ACCEPTED':'DECLINED');
    if(accept)await http('acceptInvitation',{body:{...secret,...(fullName!==undefined?{displayName:fullName}:{}),...(newPassword!==undefined?{newPassword}:{})},validateData});
    else await http('declineInvitation',{body:secret,validateData});
    access.assertCurrent();consumeInvitation(inviteId);
    const value=readStaffContext();if(accept)authorizationChanged();
    return {accepted:accept,userId:accept?value?.user.id??undefined:undefined};
  },
  async notifications(_ctx:Ctx,options:{unreadOnly?:boolean;schoolId?:ID}={}){
    assertStaffCtx(_ctx);const access=captureStaffAccess();
    const value=readStaffContext()??await refreshStaffContext(),userId=value.user.id;if(!userId)throw new RepoError('NO_SESSION');
    const rows=await apiList('listMyNotifications',{query:{schoolId:options.schoolId,unread:options.unreadOnly?true:undefined}},10000);access.assertCurrent();return rows.map(row=>notification(row,userId));
  },
  async markNotificationsRead(_ctx:Ctx,ids:ID[]|'all'){
    assertStaffCtx(_ctx);const access=captureStaffAccess();
    const selected=ids==='all'?(await apiList('listMyNotifications',{query:{unread:true}},10000)).map(row=>row.id):[...new Set(ids)];let acknowledged=0;
    for(const notificationId of selected){access.assertCurrent();if(!notificationId)throw new RepoError('READ_ERROR');await http('readMyNotification',{params:{notificationId}});access.assertCurrent();acknowledged++;}
    return acknowledged;
  },
  async sessions(_ctx:Ctx){assertStaffCtx(_ctx);return apiList('listMySessions');},
  async revokeSession(_ctx:Ctx,sessionId:ID){assertStaffCtx(_ctx);const access=captureStaffAccess(),current=(await apiList('listMySessions')).find(s=>s.id===sessionId)?.current;access.assertCurrent();const acknowledgement=(await http('revokeMySession',{params:{sessionId}})).data;access.assertCurrent();if(current)authenticationChanged();return acknowledgement;},
};
