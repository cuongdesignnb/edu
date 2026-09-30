import { Injectable } from '@nestjs/common';
import { Database,one,type Row,type Transaction } from '../../database/database';
import { listResource } from '../../database/resources';
import {auditResource,auditView} from '../../database/audit-view';
import { Permissions } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,notFound,validation } from '../../common/problem';
import { schoolSettings,settingsKeys } from './school-settings';
import type { Handler,RequestContext,Result } from '../../api.router';

@Injectable()
export class SettingsService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands){}
  handlers():Record<string,Handler>{return Object.fromEntries(['getSchoolSettings','updateSchoolSettings','listSchoolAudit','getSchoolAuditOptions'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,authorize=(tx:Transaction)=>this.policy.require(tx,c.principal!,c.operation.permission,{schoolId});
    const work=async(tx:Transaction):Promise<Result>=>{
      if(c.operation.id==='getSchoolAuditOptions'){
        const actors=(await tx.query<{id:string;name:string}>(`SELECT DISTINCT t.actor_user_id AS id,t.actor_label AS name FROM ${auditResource.table} t WHERE t.school_id=$1 AND t.actor_user_id IS NOT NULL ORDER BY name,id LIMIT 1001`,[schoolId])).rows;
        const types=(await tx.query<{type:string}>('SELECT DISTINCT target_type AS type FROM app.audit_events WHERE school_id=$1 ORDER BY type LIMIT 1001',[schoolId])).rows;
        if(actors.length>1000||types.length>1000)throw new Problem(422,'AUDIT_CHOICE_LIMIT');return {data:{actors,entityTypes:types.map(row=>row.type)}};
      }
      if(c.operation.id==='listSchoolAudit'){
        if(c.query.sort&&!['id','createdAt','actorLabel','action','targetType'].includes(c.query.sort))validation('sort','Sắp xếp nhật ký không hợp lệ');
        if(c.query.from&&c.query.to&&c.query.from>c.query.to)validation('to','Ngày kết thúc không được trước ngày bắt đầu');
        const predicates:string[]=[],values:unknown[]=[],school=(await one<{timezone:string}>(tx,'SELECT timezone FROM platform.schools WHERE id=$1',[schoolId]))!;
        if(c.query.from){values.push(c.query.from,school.timezone);predicates.push(`t.created_at>=($${values.length-1}::date::timestamp AT TIME ZONE $${values.length})`);}
        if(c.query.to){values.push(c.query.to,school.timezone);predicates.push(`t.created_at<(($${values.length-1}::date+1)::timestamp AT TIME ZONE $${values.length})`);}
        const result=await listResource(tx,auditResource,schoolId,{...c.query,sort:c.query.sort??'createdAt',dir:c.query.dir??'desc'},{sql:predicates.join(' AND '),values},c.principal!.userId);
        result.data=result.data.map(auditView);return result;
      }
      const school=await one<Row>(tx,`SELECT * FROM platform.schools WHERE id=$1${c.operation.method==='GET'?'':' FOR UPDATE'}`,[schoolId]);if(!school)notFound();
      if(c.operation.id==='getSchoolSettings')return {data:schoolSettings(school)};
      if(school.version!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(school.version));
      const timezone=String(c.body.timezone??school.timezone);
      if(!await one(tx,'SELECT name FROM pg_timezone_names WHERE name=$1',[timezone]))validation('timezone','Múi giờ IANA không hợp lệ');
      if(timezone!==school.timezone&&await one(tx,'SELECT id FROM app.academic_years WHERE school_id=$1 LIMIT 1',[schoolId]))throw new Problem(409,'TIMEZONE_LOCKED');
      const values={...school.settings as Record<string,unknown>,...Object.fromEntries(settingsKeys.filter(key=>Object.hasOwn(c.body,key)).map(key=>[key,c.body[key]]))};
      if(c.body.parentSectionsDefault&&new Set(c.body.parentSectionsDefault as string[]).size!==(c.body.parentSectionsDefault as string[]).length)validation('parentSectionsDefault','Mục chia sẻ bị trùng');
      const saved=await one<Row>(tx,'UPDATE platform.schools SET name=$2,timezone=$3,settings=$4 WHERE id=$1 RETURNING *',[schoolId,c.body.schoolName??school.name,timezone,values]);
      const data=schoolSettings(saved!);await audit(tx,c,'school-settings',schoolId,{status:'UPDATED'});return {data};
    };
    return c.operation.method==='GET'?this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId}):this.commands.execute(c,authorize,work);
  }
}
