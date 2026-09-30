import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { Database,one,iso,type Row,type Transaction } from '../../database/database';
import { Permissions,grantAllows } from '../../common/permissions';
import { canonical } from '../../common/commands';
import { runtimeConfig } from '../../common/config';
import { equal } from '../../common/security';
import { Problem,notFound,validation } from '../../common/problem';
import type { Handler,RequestContext,Result } from '../../api.router';

interface Membership {id:string;school_id:string;name:string;timezone:string}
interface Cursor {fingerprint:string;at:string;id:string}
function signature(payload:string){return crypto.createHmac('sha256',runtimeConfig().key).update('notification-feed:'+payload).digest('base64url');}
const accessible=`EXISTS(SELECT 1 FROM jsonb_to_recordset($3::jsonb) AS g(scope_type text,class_id uuid,subject_id uuid,actions text[])
 WHERE n.required_action=ANY(g.actions) AND (g.scope_type='SCHOOL'
  OR (n.class_id IS NULL AND n.required_action='school.read')
  OR (n.class_id IS NULL AND n.required_action='announcement.read' AND n.target_kind='announcement' AND EXISTS(
    SELECT 1 FROM app.announcement_targets t WHERE t.school_id=n.school_id AND t.announcement_id=n.target_id
      AND (t.audience_kind IN ('PUBLIC','SCHOOL') OR (t.audience_kind='STAFF' AND t.member_id=n.member_id))))
  OR (n.class_id=g.class_id AND (g.scope_type='CLASS' OR (n.subject_id IS NOT NULL AND n.subject_id=g.subject_id)))))
 AND (n.target_kind<>'announcement' OR EXISTS(SELECT 1 FROM app.announcements a JOIN app.publication_revisions p ON p.school_id=a.school_id AND p.announcement_id=a.id
   WHERE a.school_id=n.school_id AND a.id=n.target_id AND a.discarded_at IS NULL AND p.status='PUBLISHED'))
 AND (n.target_kind<>'activity' OR EXISTS(SELECT 1 FROM app.activities a WHERE a.school_id=n.school_id AND a.id=n.target_id AND a.status<>'ARCHIVED'))`;
const projection=`SELECT n.id,n.version,n.created_at,n.updated_at,n.read_at,n.kind,
 to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
 (${accessible}) AS accessible,CASE WHEN ${accessible} THEN n.title ELSE 'Phạm vi truy cập đã thay đổi' END AS title,
 CASE WHEN ${accessible} THEN n.body ELSE 'Nội dung gốc nằm ngoài quyền truy cập hiện tại.' END AS body,
 CASE WHEN ${accessible} THEN n.target_kind ELSE 'none' END AS target_kind,
 CASE WHEN ${accessible} THEN n.target_id END AS target_id,CASE WHEN ${accessible} THEN n.class_id END AS class_id,
 CASE WHEN ${accessible} THEN (SELECT c.year_id FROM app.classes c WHERE c.school_id=n.school_id AND c.id=n.class_id) END AS year_id
 FROM app.notifications n WHERE n.school_id=$1 AND n.member_id=$2`;
@Injectable()
export class NotificationsService {
  constructor(private readonly db:Database,private readonly policy:Permissions){}
  handlers():Record<string,Handler>{return {listMyNotifications:c=>this.list(c),readMyNotification:c=>this.read(c)};}
  private async memberships(c:RequestContext){
    const rows=await this.db.transaction(tx=>tx.query<Membership>(`SELECT m.id,m.school_id,s.name,s.timezone FROM app.memberships m JOIN platform.schools s ON s.id=m.school_id
      WHERE m.user_id=$1 AND m.status='ACTIVE' AND m.ended_at IS NULL AND s.status='ACTIVE' ORDER BY m.school_id LIMIT 101`,[c.principal!.userId]),{userId:c.principal!.userId});
    if(rows.rows.length>100)throw new Problem(422,'MEMBERSHIP_LIMIT');return rows.rows;
  }
  private async grants(tx:Transaction,c:RequestContext,m:Membership){
    const today=(await one<{today:string}>(tx,"SELECT to_char(now() AT TIME ZONE $1,'YYYY-MM-DD') AS today",[m.timezone]))!.today;
    return (await this.policy.grants(tx,c.principal!.userId,m.school_id)).map(g=>({scope_type:g.scope_type,class_id:g.class_id,subject_id:g.subject_id,
      actions:g.actions.filter(action=>grantAllows(g,action,{schoolId:m.school_id,...(g.class_id?{classId:g.class_id}:{}),...(g.subject_id?{subjectId:g.subject_id}:{}),allowSubject:true,allowScopedContext:true},today))}));
  }
  private async list(c:RequestContext):Promise<Result>{
    const query=c.query;for(const [key,value] of Object.entries(query))if(!['limit','cursor','q','schoolId','kind','unread'].includes(key)||typeof value!=='string')validation(key,'Bộ lọc thông báo không hợp lệ');
    const limit=Number(query.limit??25);if(!Number.isInteger(limit)||limit<1||limit>100)validation('limit','Chọn từ 1 đến 100 thông báo');
    if(query.q&&query.q.length>100)validation('q','Tối đa 100 ký tự');if(query.kind&&!['task','announcement','system','permission'].includes(query.kind))validation('kind','Loại thông báo không hợp lệ');
    if(query.unread&&!['true','false'].includes(query.unread))validation('unread','Giá trị boolean không hợp lệ');
    const memberships=await this.memberships(c);if(query.schoolId&&!memberships.some(m=>m.school_id===query.schoolId))notFound();
    const fingerprint=crypto.createHash('sha256').update(canonical({userId:c.principal!.userId,limit,q:query.q??'',schoolId:query.schoolId??'',kind:query.kind??'',unread:query.unread??''})).digest('hex');let cursor:Cursor|undefined;
    if(query.cursor){const [payload,signed]=query.cursor.split('.');if(!payload||!signed||query.cursor.length>1024||!equal(signed,signature(payload)))throw new Problem(422,'INVALID_CURSOR');
      try{cursor=JSON.parse(Buffer.from(payload,'base64url').toString('utf8')) as Cursor;}catch{throw new Problem(422,'INVALID_CURSOR');}
      if(!cursor||cursor.fingerprint!==fingerprint||typeof cursor.at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(cursor.at)||typeof cursor.id!=='string'||!/^[0-9a-f-]{36}$/.test(cursor.id))throw new Problem(422,'INVALID_CURSOR');
    }
    const candidates:{row:Row;membership:Membership}[]=[];let total=0;
    for(const membership of memberships.filter(m=>!query.schoolId||m.school_id===query.schoolId))await this.db.transaction(async tx=>{
      const current=await one(tx,"SELECT m.id FROM app.memberships m JOIN platform.schools s ON s.id=m.school_id WHERE m.school_id=$1 AND m.id=$2 AND m.user_id=$3 AND m.status='ACTIVE' AND m.ended_at IS NULL AND s.status='ACTIVE'",[membership.school_id,membership.id,c.principal!.userId]);if(!current)return;
      const values:unknown[]=[membership.school_id,membership.id,JSON.stringify(await this.grants(tx,c,membership))],where=['true'];const value=(v:unknown)=>{values.push(v);return '$'+values.length;};
      if(query.kind)where.push('t.kind='+value(query.kind));if(query.unread)where.push(query.unread==='true'?'t.read_at IS NULL':'t.read_at IS NOT NULL');
      if(query.q)where.push(`(t.title ILIKE ${value('%'+query.q.replace(/[\\%_]/g,'\\$&')+'%')} OR t.body ILIKE $${values.length})`);
      const count=(await one<{total:string}>(tx,`SELECT count(*) AS total FROM (${projection}) t WHERE ${where.join(' AND ')}`,values))!.total;total+=Number(count);
      if(cursor)where.push(`(t.created_at,t.id)<(${value(cursor.at)}::timestamptz,${value(cursor.id)}::uuid)`);
      const rows=(await tx.query<Row>(`SELECT * FROM (${projection}) t WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC,t.id DESC LIMIT ${value(limit+1)}`,values)).rows;
      candidates.push(...rows.map(row=>({row,membership})));
    },{schoolId:membership.school_id,userId:c.principal!.userId});
    candidates.sort((a,b)=>String(b.row.cursor_at).localeCompare(String(a.row.cursor_at))||String(b.row.id).localeCompare(String(a.row.id)));const hasMore=candidates.length>limit,selected=candidates.slice(0,limit),last=selected.at(-1)?.row;
    const payload=hasMore&&last?Buffer.from(JSON.stringify({fingerprint,at:last.cursor_at,id:last.id})).toString('base64url'):null;
    return {data:selected.map(({row,membership})=>({id:row.id,version:row.version,createdAt:iso(row.created_at as Date),updatedAt:iso(row.updated_at as Date),readAt:row.read_at?iso(row.read_at as Date):null,kind:row.kind,title:row.title,body:row.body,schoolId:membership.school_id,schoolName:membership.name,targetType:row.target_kind,targetId:row.target_id??null,...(row.class_id?{classId:row.class_id}:{}),...(row.year_id?{yearId:row.year_id}:{}),accessible:row.accessible})),page:{limit,total,hasMore,nextCursor:payload?`${payload}.${signature(payload)}`:null}};
  }
  private async read(c:RequestContext):Promise<Result>{
    for(const m of await this.memberships(c)){
      const result=await this.db.transaction(async tx=>{
        await tx.query('SELECT app.lock_school()');
        const row=await one<Row>(tx,`SELECT n.* FROM app.notifications n JOIN app.memberships m ON m.school_id=n.school_id AND m.id=n.member_id JOIN platform.schools s ON s.id=m.school_id
          WHERE n.school_id=$1 AND n.id=$2 AND m.user_id=$3 AND m.status='ACTIVE' AND m.ended_at IS NULL AND s.status='ACTIVE' FOR UPDATE OF n`,[m.school_id,c.params.notificationId,c.principal!.userId]);if(!row)return undefined;
        if(!row.read_at)await tx.query('UPDATE app.notifications SET read_at=now() WHERE school_id=$1 AND id=$2',[m.school_id,row.id]);return {data:{id:row.id,status:'READ'}};
      },{schoolId:m.school_id,userId:c.principal!.userId});if(result)return result;
    }
    notFound();
  }
}
