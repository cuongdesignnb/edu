import { Injectable } from '@nestjs/common';
import { Database,one,type Transaction,type Row } from '../../database/database';
import { dto,listResource,type Resource } from '../../database/resources';
import { Permissions } from '../../common/permissions';
import { Commands,audit,canonical } from '../../common/commands';
import { hashToken } from '../../common/security';
import { Problem } from '../../common/problem';
import { validateSchema } from '../../common/contract';
import type { RequestContext,Handler,Result } from '../../api.router';

const columns:Record<string,string>={CONDUCT:'conduct_period_id',ATTENDANCE:'attendance_session_id',TIMETABLE:'timetable_id',DUTY:'duty_schedule_id',ACTIVITY:'activity_id',ANNOUNCEMENT:'announcement_id'};
const r:Resource={table:'app.publication_revisions',fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',kind:'kind',classId:'class_id',yearId:'year_id',revision:'revision',sourceVersion:'source_version',status:'status',publishedAt:'published_at',contentHash:'content_hash',
  ...Object.fromEntries(Object.entries(columns).map(([kind,column])=>[kind,column]))},writeFields:[],search:[],filters:{kind:'kind',status:'status',yearId:'year_id',classId:'class_id'}};
export function publicationDto(row:Row){const value=dto(r,row);for(const kind of Object.keys(columns)){if(value[kind])value.sourceId=value[kind];delete value[kind];}return value;}
export interface PublicationSource {kind:string;id:string;schoolId:string;classId?:string;yearId:string;version:number}
export interface ParentItem {studentId:string;section:string;payload:Record<string,unknown>;schema:string}
@Injectable()
export class PublicationsService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands){}
  handlers():Record<string,Handler>{return Object.fromEntries(['listSchoolPublications','listClassPublications','getClassPublication','withdrawPublication'].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  async create(tx:Transaction,c:RequestContext,source:PublicationSource,snapshot:Record<string,unknown>,items:ParentItem[],publish:boolean){
    const column=columns[source.kind];if(!column)throw new Error('Unknown publication source');
    const current=await one<Row>(tx,`SELECT * FROM app.publication_revisions WHERE school_id=$1 AND ${column}=$2 AND status='PUBLISHED' FOR UPDATE`,[source.schoolId,source.id]);
    if(publish&&Object.hasOwn(c.body,'expectedPublicationId')&&(c.body.expectedPublicationId??null)!==(current?.id??null))throw new Problem(409,'PUBLICATION_CONFLICT');
    if(publish&&current?.source_version===source.version)return publicationDto(current);
    if(new Set(items.map(item=>item.studentId)).size!==items.length)throw new Problem(422,'DUPLICATE_PROJECTION');
    for(const item of items)validateSchema(item.schema,item.payload,true);
    const projectionHash=hashToken(canonical(items.map(item=>({studentId:item.studentId,section:item.section,payload:item.payload})).sort((a,b)=>a.studentId.localeCompare(b.studentId))));
    const saved=await one<Row>(tx,`INSERT INTO app.publication_revisions(school_id,class_id,year_id,kind,${column},revision,source_version,content_hash,staff_snapshot,created_by,expected_item_count,projection_hash)
      SELECT $1,$2,$3,$4,$5,coalesce(max(revision),0)+1,$6,$7,$8,$9,$10,$11 FROM app.publication_revisions WHERE school_id=$1 AND ${column}=$5 RETURNING *`,
    [source.schoolId,source.classId??null,source.yearId,source.kind,source.id,source.version,hashToken(canonical({source,snapshot,items})),snapshot,c.principal!.userId,items.length,projectionHash]);
    for(const item of items)await tx.query('INSERT INTO app.parent_publication_items(school_id,publication_id,student_id,year_id,section,payload) VALUES($1,$2,$3,$4,$5,$6)',[source.schoolId,saved!.id,item.studentId,source.yearId,item.section,item.payload]);
    const count=await one<{n:number}>(tx,'SELECT count(*)::int AS n FROM app.parent_publication_items WHERE school_id=$1 AND publication_id=$2',[source.schoolId,saved!.id]);
    if(count!.n!==items.length)throw new Problem(409,'PROJECTION_INCOMPLETE');
    if(!publish)return publicationDto(saved!);
    if(current)await tx.query("UPDATE app.publication_revisions SET status='SUPERSEDED' WHERE school_id=$1 AND id=$2",[source.schoolId,current.id]);
    const published=await one<Row>(tx,"UPDATE app.publication_revisions SET status='PUBLISHED',published_at=now(),published_by=$3 WHERE school_id=$1 AND id=$2 RETURNING *",[source.schoolId,saved!.id,c.principal!.userId]);
    await audit(tx,c,'publication',String(saved!.id),{sourceVersion:source.version,revision:saved!.revision,items:items.length});return publicationDto(published!);
  }
  async publishReady(tx:Transaction,c:RequestContext,source:PublicationSource,ready:Row){
    const column=columns[source.kind]!;
    if(ready.status!=='READY'||ready.source_version!==source.version||ready[column]!==source.id)throw new Problem(409,'STALE_SOURCE');
    const current=await one<Row>(tx,`SELECT * FROM app.publication_revisions WHERE school_id=$1 AND ${column}=$2 AND status='PUBLISHED' FOR UPDATE`,[source.schoolId,source.id]);
    if(Object.hasOwn(c.body,'expectedPublicationId')&&(c.body.expectedPublicationId??null)!==(current?.id??null))throw new Problem(409,'PUBLICATION_CONFLICT');
    const rows=(await tx.query<{student_id:string;section:string;payload:Record<string,unknown>}>('SELECT student_id,section,payload FROM app.parent_publication_items WHERE school_id=$1 AND publication_id=$2 ORDER BY student_id',[source.schoolId,ready.id])).rows;
    const digest=hashToken(canonical(rows.map(row=>({studentId:row.student_id,section:row.section,payload:row.payload})).sort((a,b)=>a.studentId.localeCompare(b.studentId))));
    if(rows.length!==ready.expected_item_count||digest!==ready.projection_hash)throw new Problem(409,'PROJECTION_INCOMPLETE');
    if(current)await tx.query("UPDATE app.publication_revisions SET status='SUPERSEDED' WHERE school_id=$1 AND id=$2",[source.schoolId,current.id]);
    const published=await one<Row>(tx,"UPDATE app.publication_revisions SET status='PUBLISHED',published_at=now(),published_by=$3 WHERE school_id=$1 AND id=$2 RETURNING *",[source.schoolId,ready.id,c.principal!.userId]);
    await audit(tx,c,'publication',String(ready.id),{sourceVersion:source.version,revision:ready.revision,items:rows.length});return publicationDto(published!);
  }
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,classId=c.params.classId,op=c.operation.id;
    const get=async(tx:Transaction,lock=false)=>{const row=await one<Row>(tx,`SELECT * FROM app.publication_revisions WHERE school_id=$1 AND id=$2${classId?' AND class_id=$3':''}${lock?' FOR UPDATE':''}`,
      classId?[schoolId,c.params.publicationId,classId]:[schoolId,c.params.publicationId]);if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');return row;};
    const authorize=async(tx:Transaction)=>{
      const row=op==='withdrawPublication'?await get(tx):undefined;
      return op==='listSchoolPublications'?this.policy.collection(tx,c.principal!,'publication.read',schoolId):
        this.policy.require(tx,c.principal!,c.operation.permission,{schoolId,classId:classId??row?.class_id as string|undefined});
    };
    const work=async(tx:Transaction):Promise<Result>=>{
      if(op==='withdrawPublication'){
        await tx.query('SELECT app.lock_school()');const row=await get(tx,true);if(row.version!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row.version));
        if(row.status!=='PUBLISHED')throw new Problem(409,'INVALID_STATE');
        const updated=await one<Row>(tx,"UPDATE app.publication_revisions SET status='WITHDRAWN',withdrawn_at=now() WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,row.id]);
        await audit(tx,c,'publication',String(row.id),{status:'WITHDRAWN'});return {data:publicationDto(updated!)};
      }
      if(op==='getClassPublication'){
        const row=await get(tx);const snapshot=row.staff_snapshot as Record<string,unknown>;const value={publication:publicationDto(row),...snapshot};validateSchema('PublicationDetail',value,true);return {data:value};
      }
      const scope=await this.policy.collection(tx,c.principal!,'publication.read',schoolId);
      const result=await listResource(tx,r,schoolId,{...c.query,...(classId?{classId}:{})},scope.all?undefined:{sql:'t.class_id=ANY($1::uuid[])',values:[scope.classIds]},c.principal!.userId);
      result.data=result.data.map(row=>{for(const kind of Object.keys(columns)){if(row[kind])row.sourceId=row[kind];delete row[kind];}return row;});return result;
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId});
    return this.commands.execute(c,authorize,work);
  }
}
