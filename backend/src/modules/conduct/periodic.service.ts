import {Injectable} from '@nestjs/common';
import Decimal from 'decimal.js';
import {Database,one,iso,type Row,type Transaction} from '../../database/database';
import {Permissions,grantAllows} from '../../common/permissions';
import {Commands,audit} from '../../common/commands';
import {Problem,notFound,validation} from '../../common/problem';
import {PublicationsService} from '../publications/publications.service';
import {loadRules} from './rules.service';
import {points} from './scoring';
import {publicationPolicy} from './school-policy';
import {id,text,expected} from '../classroom/notebook-common';
import type {Handler,RequestContext,Result} from '../../api.router';
export function rankPeriodic(results:Row[]){return [...results].sort((a,b)=>new Decimal(String(b.score)).cmp(String(a.score))||Number(a.penaltyCount)-Number(b.penaltyCount)||String(a.studentCode||a.fullName).localeCompare(String(b.studentCode||b.fullName),'vi',{numeric:true})||String(a.studentId).localeCompare(String(b.studentId))).map((r,i)=>({...r,rank:i+1}));}
@Injectable()
export class PeriodicService{
 constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands,private readonly publications:PublicationsService){}
 handlers():Record<string,Handler>{return Object.fromEntries(['getClassPeriodicOptions','listClassPeriodicConduct','calculateClassPeriodicConduct','overrideClassPeriodicConduct','reviewClassPeriodicConduct','finalizeClassPeriodicConduct','publishClassPeriodicConduct'].map(op=>[op,(c:RequestContext)=>this.handle(c)]));}
 private async range(tx:Transaction,c:RequestContext){
  const cls=await one<Row>(tx,'SELECT * FROM app.classes WHERE school_id=$1 AND id=$2',[c.params.schoolId,c.params.classId]);if(!cls)notFound();
  const year=await one<Row>(tx,'SELECT * FROM app.academic_years WHERE school_id=$1 AND id=$2',[c.params.schoolId,cls.year_id]);if(!year||year.status==='ARCHIVED'||cls.status==='ARCHIVED')throw new Problem(409,'YEAR_ARCHIVED');
  const kind=String(c.body.periodType),key=text(c.body.periodKey,'periodKey',1,40);let from=String(year.starts_on),to=String(year.ends_on),label=String(year.name);
  if(kind==='MONTH'){
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(key))validation('periodKey','Tháng YYYY-MM');from=key+'-01';to=new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5)),1)).toISOString().slice(0,10);label='Tháng '+key.slice(5)+'/'+key.slice(0,4);
  }else if(kind==='TERM'){
   const term=await one<Row>(tx,'SELECT * FROM app.terms WHERE school_id=$1 AND year_id=$2 AND id=$3',[c.params.schoolId,year.id,id(key)]);if(!term)notFound();from=String(term.starts_on);to=String(term.ends_on);label=String(term.name);
  }else if(kind==='YEAR'){if(key!==String(year.id))validation('periodKey','Chọn năm học của lớp');}
  else validation('periodType','MONTH, TERM hoặc YEAR');
  from=from<String(year.starts_on)?String(year.starts_on):from;to=to>String(year.ends_on)?String(year.ends_on):to;if(from>=to)validation('periodKey','Kỳ không giao với năm học');
  return {cls,year,kind,key,from,to,label};
 }
 private async calculate(tx:Transaction,c:RequestContext){
  const scope=await this.range(tx,c),schoolId=c.params.schoolId!,classId=c.params.classId!;
  await this.policy.require(tx,c.principal!,'conduct.review',{schoolId,classId,date:scope.from});
  await this.policy.require(tx,c.principal!,'conduct.review',{schoolId,classId,date:new Date(Date.parse(scope.to)-86400000).toISOString().slice(0,10)});
  const existing=await one<Row>(tx,'SELECT * FROM app.periodic_conduct WHERE school_id=$1 AND class_id=$2 AND period_type=$3 AND period_key=$4 FOR UPDATE',[schoolId,classId,scope.kind,scope.key]);
  if(existing){expected(existing,c.body.expectedVersion);if(['FINALIZED','PUBLISHED'].includes(String(existing.status)))throw new Problem(409,'PERIOD_FINALIZED');}
  const aggregation=String(c.body.aggregation);if(!['AVERAGE','SUM'].includes(aggregation))validation('aggregation','Chọn chính sách tính điểm TB hoặc tổng');
  const sources=(await tx.query<Row>(`SELECT p.id,p.staff_snapshot,cp.rule_set_id,w.week_number,w.starts_on,w.ends_on
   FROM app.publication_revisions p JOIN app.conduct_periods cp ON cp.school_id=p.school_id AND cp.id=p.conduct_period_id AND cp.status='LOCKED'
   JOIN app.school_weeks w ON w.school_id=cp.school_id AND w.id=cp.week_id
   WHERE p.school_id=$1 AND p.class_id=$2 AND p.year_id=$3 AND p.kind='CONDUCT' AND p.status='PUBLISHED'
   AND daterange(w.starts_on,w.ends_on,'[)')&&daterange($4,$5,'[)') ORDER BY w.starts_on,p.id`,[schoolId,classId,scope.year.id,scope.from,scope.to])).rows;
  if(!sources.length)throw new Problem(422,'NO_PUBLISHED_WEEKLY_SOURCE');
  const last=sources.at(-1)!,ruleSet=(await one<Row>(tx,'SELECT id,name,revision FROM app.rule_sets WHERE school_id=$1 AND id=$2',[schoolId,last.rule_set_id]))!;
  const config=await loadRules(tx,schoolId,String(last.rule_set_id));if(!config.thresholds.length)throw new Problem(422,'CLASSIFICATION_POLICY_REQUIRED');
  const settings=(await one<Row>(tx,'SELECT settings FROM platform.schools WHERE id=$1',[schoolId]))!.settings as Row;
  const configured=(scope.cls.notebook_settings as Row)?.periodicClassificationPolicy as Row|undefined??settings.periodicClassificationPolicy as Row|undefined;
  const thresholds=Array.isArray(configured?.thresholds)?configured!.thresholds as Row[]:config.thresholds.map(t=>({label:t.label,minimum_score:t.minimum_score}));
  const policy={aggregation,thresholds,weeklyRuleSetId:ruleSet.id,weeklyRuleSetRevision:ruleSet.revision,policyVersion:configured?.version??ruleSet.revision,label:'Gợi ý theo chính sách đang áp dụng'};
  const items=(await tx.query<Row>(`SELECT i.student_id,i.publication_id,i.payload,s.student_code FROM app.parent_publication_items i JOIN app.students s ON s.school_id=i.school_id AND s.id=i.student_id WHERE i.school_id=$1 AND i.publication_id=ANY($2::uuid[]) AND i.section='conduct'`,[schoolId,sources.map(s=>s.id)])).rows;
  const results=[];for(const studentId of [...new Set(items.map(i=>String(i.student_id)))]){
   const studentItems=items.filter(i=>i.student_id===studentId),snapshots=studentItems.map(i=>i.payload as Row),total=snapshots.reduce((sum,p)=>sum.plus(String(p.finalPoints)),new Decimal(0));
   const score=aggregation==='AVERAGE'?total.div(studentItems.length):total,suggestion=[...thresholds].sort((a,b)=>new Decimal(String(b.minimum_score)).cmp(String(a.minimum_score))).find(t=>score.gte(String(t.minimum_score)))?.label??null;
   const lastSnapshot=sources.flatMap(s=>((s.staff_snapshot as Row)?.conduct as Row)?.students as Row[]??[]).filter(s=>s.studentId===studentId).at(-1);
   results.push({studentId,studentCode:String(studentItems[0]!.student_code??''),fullName:String(lastSnapshot?.fullName??'Học sinh'),weekCount:studentItems.length,totalScore:points(total),score:points(score),suggestedClassification:suggestion,finalClassification:suggestion,overrideReason:null,
    bonusPoints:points(snapshots.reduce((sum,p)=>sum.plus(String(p.bonusPoints)),new Decimal(0))),penaltyPoints:points(snapshots.reduce((sum,p)=>sum.plus(String(p.penaltyPoints)),new Decimal(0))),
    penaltyCount:snapshots.reduce((sum,p)=>sum+(Array.isArray(p.lines)?(p.lines as Row[]).filter(l=>Number(l.delta)<0).length:0),0),sourcePublicationIds:studentItems.map(i=>i.publication_id)});
  }
  const saved=existing?await one<Row>(tx,"UPDATE app.periodic_conduct SET status='DRAFT',policy_snapshot=$3,source_publication_ids=$4,results=$5 WHERE school_id=$1 AND id=$2 RETURNING *",[schoolId,existing.id,policy,sources.map(s=>s.id),JSON.stringify(results)]):
   await one<Row>(tx,`INSERT INTO app.periodic_conduct(school_id,class_id,year_id,period_type,period_key,period_label,starts_on,ends_on,policy_snapshot,source_publication_ids,results) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[schoolId,classId,scope.year.id,scope.kind,scope.key,scope.label,scope.from,scope.to,policy,sources.map(s=>s.id),JSON.stringify(results)]);
  await audit(tx,c,'periodic-conduct',String(saved!.id),{sourceCount:sources.length,policy});return saved!;
 }
 private async handle(c:RequestContext):Promise<Result>{
  const schoolId=c.params.schoolId!,classId=c.params.classId!,action=c.operation.method==='GET'?'conduct.read':c.operation.id==='publishClassPeriodicConduct'?'conduct.publish':c.operation.id==='finalizeClassPeriodicConduct'?'conduct.lock':'conduct.review';
  const authorize=(tx:Transaction)=>this.policy.require(tx,c.principal!,action,{schoolId,classId});
  const work=async(tx:Transaction):Promise<Result>=>{
   if(c.operation.id==='getClassPeriodicOptions'){
    const cls=await one<Row>(tx,'SELECT year_id,version,notebook_settings FROM app.classes WHERE school_id=$1 AND id=$2',[schoolId,classId]);if(!cls)notFound();const terms=(await tx.query<Row>('SELECT id,name FROM app.terms WHERE school_id=$1 AND year_id=$2 ORDER BY starts_on',[schoolId,cls.year_id])).rows;
    const applied=await one<Row>(tx,'SELECT rule_set_id FROM app.class_rule_periods WHERE school_id=$1 AND class_id=$2 ORDER BY starts_on DESC LIMIT 1',[schoolId,classId]);const rules=applied?await loadRules(tx,schoolId,String(applied.rule_set_id)):null;
    return {data:{...cls,terms,thresholds:rules?.thresholds.map(t=>({label:t.label,minimum_score:t.minimum_score}))??[]}};
   }
   if(c.operation.id==='listClassPeriodicConduct'){
    const access=await authorize(tx),rows=(await tx.query<Row>('SELECT * FROM app.periodic_conduct WHERE school_id=$1 AND class_id=$2 ORDER BY starts_on DESC,id',[schoolId,classId])).rows;
    return {data:rows.filter(row=>[String(row.starts_on),new Date(Date.parse(String(row.ends_on))-86400000).toISOString().slice(0,10)].every(date=>access.grants.some(g=>grantAllows(g,'conduct.read',{schoolId,classId,date},access.today)))).map(row=>({...row,ranking:rankPeriodic(row.results as Row[])}))};
   }
   if(c.operation.id==='calculateClassPeriodicConduct')return {data:await this.calculate(tx,c)};
   const row=await one<Row>(tx,'SELECT * FROM app.periodic_conduct WHERE school_id=$1 AND class_id=$2 AND id=$3 FOR UPDATE',[schoolId,classId,id(c.body.periodId)]);if(!row)notFound();expected(row,c.body.expectedVersion);
   const access=await this.policy.require(tx,c.principal!,action,{schoolId,classId,date:String(row.starts_on)});
   await this.policy.require(tx,c.principal!,action,{schoolId,classId,date:new Date(Date.parse(String(row.ends_on))-86400000).toISOString().slice(0,10)});
   if(['conduct.lock','conduct.publish'].includes(action)){
    const settings=publicationPolicy(schoolId,(await one<Row>(tx,'SELECT settings,version FROM platform.schools WHERE id=$1',[schoolId]))!);
    const leader=action==='conduct.lock'?settings.lockBy==='school_leader':settings.publishBy==='school_leader'||settings.requireLeaderApproval===true;
    if(leader&&!access.grants.some(g=>g.scope_type==='SCHOOL'&&grantAllows(g,action,{schoolId,classId},access.today)))notFound();
   }
   const results=row.results as Row[];
   if(c.operation.id==='overrideClassPeriodicConduct'){
    if(!['DRAFT','REVIEW'].includes(String(row.status)))throw new Problem(409,'PERIOD_FINALIZED');const student=results.find(r=>r.studentId===c.body.studentId);if(!student)notFound();
    const next=text(c.body.classification,'classification',1,100),labels=((row.policy_snapshot as Row).thresholds as Row[]).map(t=>t.label);if(!labels.includes(next))validation('classification','Chọn nhãn trong chính sách đã lưu');
    const reason=next!==student.suggestedClassification?text(c.body.reason,'reason',5,1000):null,before=student.finalClassification;
    student.finalClassification=next;student.overrideReason=reason;await tx.query('UPDATE app.periodic_conduct SET results=$3 WHERE school_id=$1 AND id=$2',[schoolId,row.id,JSON.stringify(results)]);await audit(tx,c,'periodic-conduct',String(row.id),{studentId:student.studentId,before,after:next,reason});
   }else if(c.operation.id==='reviewClassPeriodicConduct'){
    if(row.status!=='DRAFT')throw new Problem(409,'INVALID_STATE');await tx.query("UPDATE app.periodic_conduct SET status='REVIEW' WHERE school_id=$1 AND id=$2",[schoolId,row.id]);
   }else if(c.operation.id==='finalizeClassPeriodicConduct'){
    if(row.status!=='REVIEW'||results.some(r=>!r.finalClassification||r.finalClassification!==r.suggestedClassification&&!r.overrideReason))throw new Problem(422,'REVIEW_REQUIRED');
    const valid=(await tx.query('SELECT id FROM app.publication_revisions WHERE school_id=$1 AND id=ANY($2::uuid[]) AND status=\'PUBLISHED\' AND kind=\'CONDUCT\'',[schoolId,row.source_publication_ids])).rows;if(valid.length!==(row.source_publication_ids as string[]).length)throw new Problem(409,'PERIOD_SOURCE_CHANGED');
    await tx.query("UPDATE app.periodic_conduct SET status='FINALIZED',finalized_by=$3,finalized_at=now() WHERE school_id=$1 AND id=$2",[schoolId,row.id,c.principal!.userId]);
   }else if(c.operation.id==='publishClassPeriodicConduct'){
    if(row.status!=='FINALIZED')throw new Problem(409,'PERIOD_NOT_FINALIZED');const at=new Date().toISOString();
    await this.publications.create(tx,c,{kind:'PERIODIC_CONDUCT',id:String(row.id),schoolId,classId,yearId:String(row.year_id),version:Number(row.version)},
     {periodic:{periodType:row.period_type,periodKey:row.period_key,periodLabel:row.period_label,policySnapshot:row.policy_snapshot,sourcePublicationIds:row.source_publication_ids,results}},
     results.map(r=>({studentId:String(r.studentId),section:'conduct',schema:'ParentConduct',payload:{periodId:row.id,periodLabel:row.period_label,periodType:row.period_type,periodKey:row.period_key,revision:1,basePoints:'0.00',bonusPoints:r.bonusPoints,penaltyPoints:r.penaltyPoints,finalPoints:r.score,classification:r.finalClassification,lines:[],publishedAt:at,adjusted:false}})),true);
    await tx.query("UPDATE app.periodic_conduct SET status='PUBLISHED' WHERE school_id=$1 AND id=$2",[schoolId,row.id]);
   }
   if(c.operation.id!=='overrideClassPeriodicConduct')await audit(tx,c,'periodic-conduct',String(row.id),{action:c.operation.id});
   const saved=(await one<Row>(tx,'SELECT * FROM app.periodic_conduct WHERE school_id=$1 AND id=$2',[schoolId,row.id]))!;return {data:{...saved,finalized_at:saved.finalized_at?iso(saved.finalized_at as Date):null}};
  };
  if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId,userId:c.principal!.userId});
  return this.commands.execute(c,authorize,work);
 }
}
