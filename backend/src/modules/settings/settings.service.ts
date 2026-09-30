import { Injectable } from '@nestjs/common';
import { Database,one,type Row,type Transaction } from '../../database/database';
import { listResource,type Resource } from '../../database/resources';
import { Permissions } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,notFound,validation } from '../../common/problem';
import { schoolSettings,settingsKeys } from './school-settings';
import type { Handler,RequestContext,Result } from '../../api.router';

const auditResource:Resource={table:`(SELECT e.*,coalesce((SELECT m.work_display_name FROM app.memberships m WHERE m.school_id=e.school_id AND m.user_id=e.actor_user_id),(SELECT u.display_name FROM identity.users u WHERE u.id=e.actor_user_id),e.actor_kind) AS actor_label FROM app.audit_events e)`,fields:{id:'id',actorLabel:'actor_label',action:'action',targetType:'target_type',targetId:'target_id',createdAt:'created_at',reason:'reason',before:'redacted_before',after:'redacted_after'},writeFields:[],search:['action','target_type','actor_label'],filters:{targetId:'target_id'}};
const safeAuditFields=new Set(['status','sourceVersion','publicationId','baselinePublicationId','studentCount','expectedCount','allowDownload','sections','shareWithGuardian','discarded','rootId','count','total','applied','rejected','removed','groupId','enrollmentId','classId','yearId','ruleSetId','revision','effectiveOn','fromAssignmentId','toAssignmentId']);
@Injectable()
export class SettingsService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands){}
  handlers():Record<string,Handler>{return Object.fromEntries(['getSchoolSettings','updateSchoolSettings','listSchoolAudit'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,authorize=(tx:Transaction)=>this.policy.require(tx,c.principal!,c.operation.permission,{schoolId});
    const work=async(tx:Transaction):Promise<Result>=>{
      if(c.operation.id==='listSchoolAudit'){
        if(c.query.sort&&!['id','createdAt','actorLabel','action','targetType'].includes(c.query.sort))validation('sort','Sắp xếp nhật ký không hợp lệ');
        const result=await listResource(tx,auditResource,schoolId,{...c.query,sort:c.query.sort??'createdAt',dir:c.query.dir??'desc'},undefined,c.principal!.userId);
        result.data=result.data.map(row=>{const before=row.before as Record<string,unknown>,after=row.after as Record<string,unknown>,changes=[];
          for(const field of new Set([...Object.keys(before),...Object.keys(after)])){if(!safeAuditFields.has(field))continue;const old=before[field],next=after[field];if(old===next)continue;const display=(value:unknown)=>value===undefined||value===null?null:typeof value==='string'||typeof value==='number'||typeof value==='boolean'?String(value):Array.isArray(value)&&value.every(v=>typeof v==='string')?value.join(', '):null;if(display(old)===null&&display(next)===null)continue;changes.push({field,before:display(old),after:display(next)});}
          const view={...row};delete view.before;delete view.after;if(view.reason===null)delete view.reason;return {...view,changes};
        });return result;
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
