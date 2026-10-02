import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import {one,iso,type Row,type Transaction} from '../../database/database';
import {listResource,type Resource} from '../../database/resources';
import {Permissions,grantAllows} from '../../common/permissions';
import {audit} from '../../common/commands';
import {Problem,validation} from '../../common/problem';
import {canonical} from '../../common/commands';
import {points} from './scoring';
import {loadRules} from './rules.service';
import type {RequestContext,Result} from '../../api.router';

const list:Resource={table:'app.rule_sets',fields:{id:'id',version:'version',createdAt:'created_at'},writeFields:[],search:[],filters:{}};
export const ruleWorkspaceOperations=['getRuleWorkspaceDirectory','getRuleWorkspaceDetail','createRuleWorkspace','copyRuleWorkspace','saveRuleWorkspace','issueRuleWorkspace','discardRuleWorkspace'];
const bounded=<T>(rows:T[],max:number)=>{if(rows.length>max)throw new Problem(422,'WORKSPACE_LIMIT');return rows;};
async function current(tx:Transaction,s:string,id:string,lock=false){
 const row=await one<Row>(tx,`SELECT * FROM app.rule_sets WHERE school_id=$1 AND id=$2 AND discarded_at IS NULL${lock?' FOR UPDATE':''}`,[s,id]);
 if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');return row;
}
async function context(tx:Transaction,p:Permissions,c:RequestContext){
 const s=c.params.schoolId!,allowed=await p.collection(tx,c.principal!,'rules.read',s,true),scope={schoolId:s};
 const can=(a:string)=>allowed.all&&allowed.grants.some(g=>grantAllows(g,a,scope,allowed.today));
 const ids=allowed.all?null:(await tx.query<{rule_set_id:string}>(`SELECT DISTINCT rule_set_id FROM app.class_rule_periods WHERE school_id=$1 AND class_id=ANY($2::uuid[]) AND starts_on<=$3 AND (ends_on IS NULL OR ends_on>$3)`,[s,allowed.classIds,allowed.today])).rows.map(r=>r.rule_set_id);
 return {schoolId:s,today:allowed.today,can,ids,classIds:allowed.all?null:allowed.classIds};
}
type Context=Awaited<ReturnType<typeof context>>;
async function applicationHash(tx:Transaction,ctx:Context){
 if(ctx.ids!==null)return crypto.createHash('sha256').update(canonical(ctx.ids.sort())).digest('hex');
 const rows=bounded((await tx.query<Row>(`SELECT c.id,c.version,c.year_id,c.status,y.version AS year_version,y.status AS year_status,y.starts_on,y.ends_on FROM app.classes c JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id WHERE c.school_id=$1 AND c.status<>'ARCHIVED' AND y.status<>'ARCHIVED' ORDER BY c.id LIMIT 5001`,[ctx.schoolId])).rows,5000);
 const calendars=await one<Row>(tx,`SELECT md5(coalesce(string_agg(id::text||':'||version::text,',' ORDER BY id),'')) AS hash FROM app.school_weeks WHERE school_id=$1`,[ctx.schoolId]);
 const schedule=await one<Row>(tx,`SELECT md5(coalesce(string_agg(id::text||':'||version::text,',' ORDER BY id),'')) AS hash FROM app.class_rule_periods WHERE school_id=$1`,[ctx.schoolId]);
 const periods=await one<Row>(tx,`SELECT md5(coalesce(string_agg(id::text||':'||version::text,',' ORDER BY id),'')) AS hash FROM app.conduct_periods WHERE school_id=$1`,[ctx.schoolId]);
 return crypto.createHash('sha256').update(canonical({rows,calendars,schedule,periods})).digest('hex');
}
export async function ruleWorkspaceView(tx:Transaction,ctx:Context,row:Row,hash:string){
 const items=await loadRules(tx,ctx.schoolId,String(row.id)),range=await one<Row>(tx,`SELECT min(starts_on) AS starts_on,max(ends_on)-1 AS ends_on,bool_or(ends_on IS NULL) AS open FROM app.class_rule_periods WHERE school_id=$1 AND rule_set_id=$2 AND ($3::uuid[] IS NULL OR class_id=ANY($3))`,[ctx.schoolId,row.id,ctx.classIds]);
 const effective=row.effective_from??range?.starts_on??null;
 const next=effective?await one<Row>(tx,`SELECT min(effective_from)-1 AS last_day FROM app.rule_sets WHERE school_id=$1 AND discarded_at IS NULL AND status='ISSUED' AND effective_from>$2`,[ctx.schoolId,effective]):null;
 // Global issuance metadata is a declared schedule; canonical sets derive their range from actual class application.
 const end=row.effective_from?(next?.last_day??null):(range?.open?null:range?.ends_on?String(range.ends_on):null);
 const counts=await one<{n:number}>(tx,`SELECT count(*)::int AS n FROM app.conduct_periods WHERE school_id=$1 AND rule_set_id=$2 AND status<>'OPEN' AND ($3::uuid[] IS NULL OR class_id=ANY($3))`,[ctx.schoolId,row.id,ctx.classIds]);
 const author=row.created_by?await one<{name:string}>(tx,'SELECT work_display_name AS name FROM app.memberships WHERE school_id=$1 AND user_id=$2',[ctx.schoolId,row.created_by]):null;
 const status=row.status==='DRAFT'?'draft':row.status==='RETIRED'||end&&String(end)<ctx.today?'retired':'published';
 return {schoolId:ctx.schoolId,id:row.id,name:row.name,versionNo:row.revision,status,effectiveFrom:effective,effectiveTo:end,baseScore:Number(row.base_points),cap:row.maximum_points===null?null:Number(row.maximum_points),floor:row.minimum_points===null?null:Number(row.minimum_points),
  rules:bounded(items.rules,200).map(r=>({id:r.id,code:r.code,label:r.label,points:Number(r.default_delta),category:r.group_name,icon:r.icon,shareWithParent:r.share_with_parent,attendanceLink:r.attendance_status==='LATE'?'late':r.attendance_status==='UNEXCUSED'?'unexcused':null,valueMode:r.value_mode,minimumDelta:r.minimum_delta===null?null:Number(r.minimum_delta),maximumDelta:r.maximum_delta===null?null:Number(r.maximum_delta),reasonRequired:r.reason_required,maxOccurrencesPerDay:r.max_occurrences_per_day})),
  bands:bounded(items.thresholds,50).map(t=>({min:Number(t.minimum_score),label:t.label,tone:t.tone})),entryDeadlineDays:row.entry_deadline_days,createdBy:row.created_by,createdByName:author?.name??null,publishedAt:row.issued_at?iso(row.issued_at as Date):null,version:row.version,source:{id:row.id,version:row.version,applicationHash:hash},isCurrent:status==='published'&&!!effective&&String(effective)<=ctx.today&&(!end||String(end)>=ctx.today),usedBySnapshots:counts!.n,canManage:ctx.can('rules.manage')&&status==='draft',canIssue:ctx.can('rules.issue')&&ctx.can('rules.apply')&&status==='draft'};
}
const view=ruleWorkspaceView;
export async function ruleWorkspace(tx:Transaction,p:Permissions,c:RequestContext):Promise<Result>{
 const ctx=await context(tx,p,c),op=c.operation.id,hash=await applicationHash(tx,ctx),s=ctx.schoolId;
 const permitted=async(id:string)=>{const row=await current(tx,s,id,c.operation.method!=='GET');if(ctx.ids!==null&&(!ctx.ids.includes(id)||row.status==='DRAFT'))throw new Problem(404,'RESOURCE_NOT_FOUND');return row;};
 if(op==='getRuleWorkspaceDirectory'){
  if(Object.keys(c.query).some(k=>!['limit','cursor'].includes(k)))throw new Problem(422,'INVALID_QUERY');
  const result=await listResource(tx,list,s,c.query,ctx.ids===null?{sql:'t.discarded_at IS NULL',values:[]}:{sql:"t.discarded_at IS NULL AND t.status<>'DRAFT' AND t.id=ANY($1::uuid[])",values:[ctx.ids]},c.principal!.userId);
  const items=[];for(const r of result.data as Row[])items.push(await view(tx,ctx,await current(tx,s,String(r.id)),hash));
  return {data:{schoolId:s,today:ctx.today,items,canManage:ctx.can('rules.manage'),applicationHash:hash},page:result.page};
 }
 if(op==='getRuleWorkspaceDetail'){
  if(Object.keys(c.query).length)throw new Problem(422,'INVALID_QUERY');
  const row=await permitted(c.params.ruleSetId!);
  const previous=await one<Row>(tx,`SELECT * FROM app.rule_sets WHERE school_id=$1 AND revision<$2 AND discarded_at IS NULL AND status<>'DRAFT'${ctx.ids===null?'':' AND id=ANY($3::uuid[])'} ORDER BY revision DESC,id DESC LIMIT 1`,ctx.ids===null?[s,row.revision]:[s,row.revision,ctx.ids]);
  const item=await view(tx,ctx,row,hash),earliest=await one<{day:string}>(tx,`SELECT greatest($2::date,coalesce(max(w.ends_on),$2::date))::text AS day FROM app.conduct_periods p JOIN app.school_weeks w ON w.school_id=p.school_id AND w.id=p.week_id WHERE p.school_id=$1 AND p.status<>'OPEN' AND ($3::uuid[] IS NULL OR p.class_id=ANY($3))`,[s,ctx.today,ctx.classIds]);
  return {data:{ruleSet:item,previous:previous?await view(tx,ctx,previous,hash):null,usedBySnapshots:item.usedBySnapshots,canManage:item.canManage,earliestEffective:earliest!.day}};
 }
 if(Object.keys(c.query).length)throw new Problem(422,'INVALID_QUERY');
 if(op==='createRuleWorkspace'){
  if(c.body.applicationHash!==hash)throw new Problem(409,'STALE_SOURCE');
  if((await tx.query('SELECT id FROM app.rule_sets WHERE school_id=$1 AND discarded_at IS NULL',[s])).rowCount)throw new Problem(409,'RULE_SET_EXISTS');
  const revision=(await one<{n:number}>(tx,'SELECT coalesce(max(revision),0)+1 AS n FROM app.rule_sets WHERE school_id=$1',[s]))!.n;
  const draft=(await one<Row>(tx,"INSERT INTO app.rule_sets(school_id,name,revision,base_points,effective_from,entry_deadline_days,created_by) VALUES($1,$2,$3,100,$4::date+7,7,$5) RETURNING *",[s,`Nội quy thi đua (bản ${revision})`,revision,ctx.today,c.principal!.userId]))!;
  await tx.query("INSERT INTO app.rule_thresholds(school_id,rule_set_id,label,minimum_score,sort_order,tone) VALUES($1,$2,'Chưa xếp loại',-99999999.99,0,'neutral')",[s,draft.id]);
  await audit(tx,c,'ruleSet',String(draft.id),{createdDraft:true});return {data:await view(tx,ctx,draft,hash),status:201};
 }
 const row=await permitted(c.params.ruleSetId!),source=c.body.source as {id:string;version:number;applicationHash:string};
 if(source.id!==row.id||source.version!==row.version)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(row.version));
 if(source.applicationHash!==hash)throw new Problem(409,'STALE_SOURCE');
 if(op==='copyRuleWorkspace'){
  if((await tx.query("SELECT id FROM app.rule_sets WHERE school_id=$1 AND status='DRAFT' AND discarded_at IS NULL",[s])).rowCount)throw new Problem(409,'RULE_DRAFT_EXISTS');
  const revision=(await one<{n:number}>(tx,'SELECT coalesce(max(revision),0)+1 AS n FROM app.rule_sets WHERE school_id=$1',[s]))!.n;
  const copy=(await one<Row>(tx,`INSERT INTO app.rule_sets(school_id,name,revision,base_points,minimum_points,maximum_points,effective_from,entry_deadline_days,created_by) VALUES($1,$2,$3,$4,$5,$6,$7::date+7,$8,$9) RETURNING *`,[s,`${String(row.name).replace(/ \(bản \d+\)$/,'')} (bản ${revision})`,revision,row.base_points,row.minimum_points,row.maximum_points,ctx.today,row.entry_deadline_days??7,c.principal!.userId]))!;
  await tx.query(`INSERT INTO app.conduct_rules(school_id,rule_set_id,code,label,group_name,value_mode,default_delta,minimum_delta,maximum_delta,max_occurrences_per_day,reason_required,attendance_status,icon,share_with_parent) SELECT school_id,$3,code,label,group_name,value_mode,default_delta,minimum_delta,maximum_delta,max_occurrences_per_day,reason_required,attendance_status,icon,share_with_parent FROM app.conduct_rules WHERE school_id=$1 AND rule_set_id=$2`,[s,row.id,copy.id]);
  await tx.query(`INSERT INTO app.rule_thresholds(school_id,rule_set_id,label,minimum_score,sort_order,tone) SELECT school_id,$3,label,minimum_score,sort_order,tone FROM app.rule_thresholds WHERE school_id=$1 AND rule_set_id=$2`,[s,row.id,copy.id]);
  await audit(tx,c,'ruleSet',String(copy.id),{copiedFrom:row.id});return {data:await view(tx,ctx,copy,hash),status:201};
 }
 if(row.status!=='DRAFT')throw new Problem(409,'RULE_SET_IMMUTABLE');
 if(op==='discardRuleWorkspace'){
  await tx.query('UPDATE app.rule_sets SET discarded_at=now() WHERE school_id=$1 AND id=$2',[s,row.id]);await audit(tx,c,'ruleSet',String(row.id),{discarded:true});return {data:{id:row.id,discarded:true}};
 }
 if(op==='saveRuleWorkspace'){
  const b=c.body,rules=b.rules as Row[],bands=b.bands as Row[];
  if(String(b.effectiveFrom)<ctx.today)validation('effectiveFrom','Không áp dụng ngược về quá khứ');
  if(b.cap!==null&&new Decimal(String(b.cap)).lt(String(b.baseScore)))validation('cap','Trần không thấp hơn điểm gốc');
  if(b.floor!==null&&new Decimal(String(b.floor)).gt(String(b.baseScore)))validation('floor','Sàn không cao hơn điểm gốc');
  if(new Set(rules.map(r=>r.id)).size!==rules.length||new Set(rules.map(r=>String(r.code).trim().toUpperCase())).size!==rules.length)validation('rules','Mã quy tắc bị trùng');
  if(new Set(bands.map(r=>points(String(r.min)))).size!==bands.length)validation('bands','Mốc xếp loại bị trùng');
  const linked=rules.filter(r=>r.attendanceLink!==null);if(new Set(linked.map(r=>r.attendanceLink)).size!==linked.length)validation('rules','Liên kết chuyên cần bị trùng');
  for(const r of rules){points(String(r.points));if(r.valueMode==='FIXED'&&Number(r.points)===0)validation('rules','Điểm quy tắc cố định phải khác không');
   if(r.attendanceLink!==null&&r.valueMode!=='FIXED')validation('rules','Chuyên cần cần điểm cố định');
   if(r.valueMode==='MANUAL'&&(r.minimumDelta===null||r.maximumDelta===null||new Decimal(String(r.minimumDelta)).gt(String(r.maximumDelta))||new Decimal(String(r.points)).lt(String(r.minimumDelta))||new Decimal(String(r.points)).gt(String(r.maximumDelta))))validation('rules','Điểm thủ công thiếu hoặc vượt giới hạn');
  }
  await tx.query('DELETE FROM app.conduct_rules WHERE school_id=$1 AND rule_set_id=$2',[s,row.id]);
  for(const r of rules)await tx.query(`INSERT INTO app.conduct_rules(id,school_id,rule_set_id,code,label,group_name,value_mode,default_delta,minimum_delta,maximum_delta,reason_required,max_occurrences_per_day,attendance_status,icon,share_with_parent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[r.id,s,row.id,String(r.code).trim().toUpperCase(),String(r.label).trim(),r.category,r.valueMode,points(String(r.points)),r.minimumDelta,r.maximumDelta,r.reasonRequired,r.maxOccurrencesPerDay,r.attendanceLink==='late'?'LATE':r.attendanceLink==='unexcused'?'UNEXCUSED':null,r.icon,r.shareWithParent]);
  await tx.query('DELETE FROM app.rule_thresholds WHERE school_id=$1 AND rule_set_id=$2',[s,row.id]);
  for(let i=0;i<bands.length;i++){const b=bands[i]!;await tx.query('INSERT INTO app.rule_thresholds(school_id,rule_set_id,label,minimum_score,sort_order,tone) VALUES($1,$2,$3,$4,$5,$6)',[s,row.id,String(b.label).trim(),points(String(b.min)),i,b.tone]);}
  const saved=(await one<Row>(tx,'UPDATE app.rule_sets SET name=$3,base_points=$4,maximum_points=$5,minimum_points=$6,effective_from=$7,entry_deadline_days=$8 WHERE school_id=$1 AND id=$2 RETURNING *',[s,row.id,String(b.name).trim(),points(String(b.baseScore)),b.cap===null?null:points(String(b.cap)),b.floor===null?null:points(String(b.floor)),b.effectiveFrom,b.entryDeadlineDays]))!;
  await audit(tx,c,'ruleSet',String(row.id));return {data:await view(tx,ctx,saved,hash)};
 }
 if(!row.effective_from||row.entry_deadline_days===null)validation('effectiveFrom','Lưu ngày hiệu lực và hạn nhập trước khi ban hành');
 const date=String(row.effective_from);if(date<ctx.today)validation('effectiveFrom','Ngày hiệu lực đã qua');
 const rules=await loadRules(tx,s,String(row.id));if(!rules.thresholds.length)validation('bands','Thiếu mốc xếp loại');
 const target=bounded((await tx.query<Row>(`SELECT c.id,c.year_id,y.ends_on FROM app.classes c JOIN app.academic_years y ON y.school_id=c.school_id AND y.id=c.year_id WHERE c.school_id=$1 AND c.status<>'ARCHIVED' AND y.status<>'ARCHIVED' AND y.starts_on<=$2 AND y.ends_on>$2 ORDER BY c.id LIMIT 5001`,[s,date])).rows,5000);
 if(!target.length)validation('effectiveFrom','Ngày hiệu lực cần nằm trong năm học có lớp');
 for(const cls of target){
  const week=await one<Row>(tx,'SELECT id FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 AND starts_on=$3',[s,cls.year_id,date]);if(!week)validation('effectiveFrom','Ngày hiệu lực phải là đầu tuần học của các lớp');
  const previous=(await tx.query<Row>('SELECT * FROM app.class_rule_periods WHERE school_id=$1 AND class_id=$2 ORDER BY starts_on FOR UPDATE',[s,cls.id])).rows;
  if(previous.length&&date<=ctx.today)validation('effectiveFrom','Chọn đầu tuần tiếp theo cho thay đổi nội quy');
  if(previous.some(r=>String(r.starts_on)>=date))throw new Problem(409,'RULE_SCHEDULE_CONFLICT');
  if((await tx.query('SELECT p.id FROM app.conduct_periods p JOIN app.school_weeks w ON w.school_id=p.school_id AND w.id=p.week_id WHERE p.school_id=$1 AND p.class_id=$2 AND w.starts_on>=$3',[s,cls.id,date])).rowCount)throw new Problem(409,'CONDUCT_RULE_VERSION_PINNED');
 }
 const issued=(await one<Row>(tx,"UPDATE app.rule_sets SET status='ISSUED',issued_at=now(),issued_by=$3 WHERE school_id=$1 AND id=$2 RETURNING *",[s,row.id,c.principal!.userId]))!;
 for(const cls of target){await tx.query('UPDATE app.class_rule_periods SET ends_on=$3 WHERE school_id=$1 AND class_id=$2 AND starts_on<$3 AND (ends_on IS NULL OR ends_on>$3)',[s,cls.id,date]);await tx.query('INSERT INTO app.class_rule_periods(school_id,class_id,rule_set_id,starts_on,ends_on) VALUES($1,$2,$3,$4,$5)',[s,cls.id,row.id,date,cls.ends_on]);await tx.query('UPDATE app.classes SET updated_at=now() WHERE school_id=$1 AND id=$2',[s,cls.id]);}
 await audit(tx,c,'ruleSet',String(row.id),{issued:true,effectiveFrom:date,appliedClasses:target.length});return {data:await view(tx,ctx,issued,await applicationHash(tx,ctx))};
}
