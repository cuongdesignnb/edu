import { Injectable } from '@nestjs/common';
import { Database,one,type Row,type Transaction } from '../../database/database';
import { dto,getResource,insertResource,updateResource,listResource,resource,type Resource } from '../../database/resources';
import { Permissions } from '../../common/permissions';
import { Commands,audit } from '../../common/commands';
import { Problem,validation } from '../../common/problem';
import { points,ruleDelta,score } from './scoring';
import Decimal from 'decimal.js';
import type { RequestContext,Result,Handler } from '../../api.router';
import {ruleWorkspace,ruleWorkspaceOperations} from './rule-workspace';
const r:Resource={table:'app.rule_sets',fields:{id:'id',version:'version',createdAt:'created_at',updatedAt:'updated_at',name:'name',revision:'revision',basePoints:'base_points',minimumPoints:'minimum_points',maximumPoints:'maximum_points',status:'status'},writeFields:['name','basePoints','minimumPoints','maximumPoints'],search:['name'],filters:{status:'status'}};
export async function loadRules(tx:Transaction,schoolId:string,id:string){return {
  rules:(await tx.query<Row>('SELECT * FROM app.conduct_rules WHERE school_id=$1 AND rule_set_id=$2 ORDER BY code,id',[schoolId,id])).rows,
  thresholds:(await tx.query<Row>('SELECT * FROM app.rule_thresholds WHERE school_id=$1 AND rule_set_id=$2 ORDER BY minimum_score DESC,id',[schoolId,id])).rows,
};}
function ruleDto(rule:Row){return {id:rule.id,code:rule.code,label:rule.label,groupName:rule.group_name,valueMode:rule.value_mode,defaultDelta:rule.default_delta,
  ...(rule.minimum_delta!==null?{minimumDelta:rule.minimum_delta}:{}),...(rule.maximum_delta!==null?{maximumDelta:rule.maximum_delta}:{}),reasonRequired:rule.reason_required,...(rule.max_occurrences_per_day!==null?{maxOccurrencesPerDay:rule.max_occurrences_per_day}:{}),...(rule.attendance_status?{attendanceStatus:rule.attendance_status}:{})};}
@Injectable()
export class RulesService {
  constructor(private readonly db:Database,private readonly policy:Permissions,private readonly commands:Commands){}
  handlers():Record<string,Handler>{return Object.fromEntries(['listRuleSets','createRuleSet','getRuleSet','updateRuleSet','issueRuleSet','simulateRules','getClassRules','applyClassRules',...ruleWorkspaceOperations].map(id=>[id,(c:RequestContext)=>this.handle(c)]));}
  private async activeRuleSet(tx:Transaction,schoolId:string,id:string,lock=false){const row=await one<Row>(tx,`SELECT * FROM app.rule_sets WHERE school_id=$1 AND id=$2 AND discarded_at IS NULL${lock?' FOR UPDATE':''}`,[schoolId,id]);if(!row)throw new Problem(404,'RESOURCE_NOT_FOUND');return row;}
  private async detail(tx:Transaction,schoolId:string,id:string){const row=await this.activeRuleSet(tx,schoolId,id),items=await loadRules(tx,schoolId,id);
    return {...dto(r,row),rules:items.rules.map(ruleDto),thresholds:items.thresholds.map(t=>({label:t.label,minimumScore:t.minimum_score}))};}
  private async readable(tx:Transaction,c:RequestContext,id?:string){
    const schoolId=c.params.schoolId!,allowed=await this.policy.collection(tx,c.principal!,'rules.read',schoolId,true);
    if(allowed.all)return undefined;
    const ids=(await tx.query<{rule_set_id:string}>(`SELECT DISTINCT rule_set_id FROM app.class_rule_periods WHERE school_id=$1 AND class_id=ANY($2::uuid[])
      AND starts_on<=$3 AND (ends_on IS NULL OR ends_on>$3)`,[schoolId,allowed.classIds,allowed.today])).rows.map(row=>row.rule_set_id);
    if(id&&!ids.includes(id))throw new Problem(404,'RESOURCE_NOT_FOUND');return ids;
  }
  private limits(row:Row){for(const key of ['base_points','minimum_points','maximum_points'])if(row[key]!==null&&row[key]!==undefined)points(String(row[key]));
    if(row.minimum_points!==null&&row.maximum_points!==null&&row.minimum_points!==undefined&&row.maximum_points!==undefined&&new Decimal(String(row.minimum_points)).gt(String(row.maximum_points)))validation('maximumPoints','Giới hạn lớn nhất thấp hơn nhỏ nhất');}
  private async handle(c:RequestContext):Promise<Result>{
    const schoolId=c.params.schoolId!,op=c.operation.id;
    if(ruleWorkspaceOperations.includes(op)){
      const authorize=(tx:Transaction)=>c.operation.method==='GET'?this.policy.collection(tx,c.principal!,'rules.read',schoolId,true):this.policy.require(tx,c.principal!,c.operation.permission,{schoolId});
      const work=(tx:Transaction)=>ruleWorkspace(tx,this.policy,c);
      return c.operation.method==='GET'?this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId}):this.commands.execute(c,authorize,work);
    }
    const authorize=async(tx:Transaction)=>{
      if(['listRuleSets','getRuleSet','simulateRules'].includes(op))return this.readable(tx,c,op==='listRuleSets'?undefined:c.params.ruleSetId??String(c.body.ruleSetId));
      return this.policy.require(tx,c.principal!,c.operation.permission,{schoolId,classId:c.params.classId,allowSubject:op==='getClassRules'});
    };
    const work=async(tx:Transaction):Promise<Result>=>{
      if(op==='listRuleSets'){
        const ids=await this.readable(tx,c);return listResource(tx,r,schoolId,c.query,ids?{sql:"t.id=ANY($1::uuid[]) AND t.status<>'DRAFT' AND t.discarded_at IS NULL",values:[ids]}:{sql:'t.discarded_at IS NULL',values:[]},c.principal!.userId);
      }
      if(op==='getRuleSet')return {data:await this.detail(tx,schoolId,c.params.ruleSetId!)};
      if(op==='getClassRules'){
        const allowed=await this.policy.require(tx,c.principal!,'rules.read',{schoolId,classId:c.params.classId!,allowSubject:true});
        const period=await one<Row>(tx,'SELECT rule_set_id FROM app.class_rule_periods WHERE school_id=$1 AND class_id=$2 AND starts_on<=$3 AND (ends_on IS NULL OR ends_on>$3)',[schoolId,c.params.classId,allowed.today]);
        if(!period)throw new Problem(404,'RULE_SET_NOT_APPLIED');return {data:await this.detail(tx,schoolId,String(period.rule_set_id))};
      }
      if(op==='simulateRules'){
        const rs=await this.activeRuleSet(tx,schoolId,String(c.body.ruleSetId)),items=await loadRules(tx,schoolId,String(rs.id));
        const deltas=(c.body.events as {ruleId:string;manualDelta?:string}[]).map(event=>{const rule=items.rules.find(rule=>rule.id===event.ruleId);if(!rule)validation('ruleId','Quy tắc không thuộc bản nội quy');return ruleDelta(rule,event.manualDelta);});
        return {data:{...score(rs,deltas,items.thresholds),appliedRuleCount:deltas.length}};
      }
      await tx.query('SELECT app.lock_school()');
      if(op==='applyClassRules'){
        const classId=c.params.classId!,cls=await getResource(tx,resource('class'),schoolId,classId,true),year=await getResource(tx,resource('year'),schoolId,String(cls.year_id));
        if(cls.version!==c.body.expectedClassVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(cls.version));
        if(cls.status==='ARCHIVED'||year.status==='ARCHIVED')throw new Problem(409,'YEAR_ARCHIVED');
        const ruleSet=await this.activeRuleSet(tx,schoolId,String(c.body.ruleSetId));if(ruleSet.status!=='ISSUED')throw new Problem(422,'RULE_SET_NOT_ISSUED');
        const start=String(c.body.startsOn),end=c.body.endsOn??year.ends_on;
        if(ruleSet.effective_from&&start<String(ruleSet.effective_from))validation('startsOn','Trước ngày hiệu lực đã ban hành');
        if(start<String(year.starts_on)||String(end)>String(year.ends_on)||start>=String(end))validation('startsOn','Ngoài năm học');
        const week=await one<Row>(tx,'SELECT id FROM app.school_weeks WHERE school_id=$1 AND year_id=$2 AND starts_on=$3',[schoolId,year.id,start]);if(!week)validation('startsOn','Chỉ thay nội quy ở đầu tuần');
        const today=(await this.policy.require(tx,c.principal!,'rules.apply',{schoolId,classId})).today;
        const previous=(await tx.query<Row>('SELECT * FROM app.class_rule_periods WHERE school_id=$1 AND class_id=$2 ORDER BY starts_on FOR UPDATE',[schoolId,classId])).rows;
        if(previous.length&&start<=today)validation('startsOn','Chọn đầu tuần tiếp theo cho thay đổi nội quy');
        if((await tx.query('SELECT p.id FROM app.conduct_periods p JOIN app.school_weeks w ON w.school_id=p.school_id AND w.id=p.week_id WHERE p.school_id=$1 AND p.class_id=$2 AND w.starts_on>=$3',[schoolId,classId,start])).rowCount)throw new Problem(409,'CONDUCT_RULE_VERSION_PINNED');
        if(previous.some(row=>String(row.starts_on)>=start))throw new Problem(409,'RULE_SCHEDULE_CONFLICT');
        const overlapping=previous.find(row=>!row.ends_on||String(row.ends_on)>start);
        if(overlapping)await tx.query('UPDATE app.class_rule_periods SET ends_on=$3 WHERE school_id=$1 AND id=$2',[schoolId,overlapping.id,start]);
        const saved=await one<Row>(tx,'INSERT INTO app.class_rule_periods(school_id,class_id,rule_set_id,starts_on,ends_on) VALUES($1,$2,$3,$4,$5) RETURNING *',[schoolId,classId,ruleSet.id,start,end]);
        await tx.query('UPDATE app.classes SET updated_at=now() WHERE school_id=$1 AND id=$2',[schoolId,classId]);await audit(tx,c,'classRules',String(saved!.id),{ruleSetId:ruleSet.id,startsOn:start});return {data:{id:saved!.id,status:'APPLIED'}};
      }
      if(op==='createRuleSet'){
        this.limits({base_points:c.body.basePoints,minimum_points:c.body.minimumPoints,maximum_points:c.body.maximumPoints});
        const revision=await one<{next:number}>(tx,'SELECT coalesce(max(revision),0)+1 AS next FROM app.rule_sets WHERE school_id=$1',[schoolId]);
        const data=await insertResource(tx,r,schoolId,c.body,{revision:revision!.next});await audit(tx,c,'ruleSet',String(data.id));return {data:await this.detail(tx,schoolId,String(data.id)),status:201};
      }
      const current=await this.activeRuleSet(tx,schoolId,c.params.ruleSetId!,true);
      if(current.version!==c.body.expectedVersion)throw new Problem(409,'VERSION_CONFLICT',undefined,Number(current.version));
      if(current.status!=='DRAFT')throw new Problem(409,'RULE_SET_IMMUTABLE');
      if(op==='issueRuleSet'){
        const items=await loadRules(tx,schoolId,String(current.id));if(!items.thresholds.length)validation('thresholds','Thiếu mốc xếp loại');
        for(const rule of items.rules)if(rule.value_mode==='MANUAL'&&(rule.minimum_delta===null||rule.maximum_delta===null))validation('rules','Quy tắc thủ công cần giới hạn');
        await tx.query("UPDATE app.rule_sets SET status='ISSUED',issued_at=now(),issued_by=$3 WHERE school_id=$1 AND id=$2",[schoolId,current.id,c.principal!.userId]);
      }else{
        this.limits({...current,...Object.fromEntries(['basePoints','minimumPoints','maximumPoints'].filter(field=>Object.hasOwn(c.body,field)).map(field=>[r.fields[field],c.body[field]]))});
        if(c.body.rules){const rules=c.body.rules as {id:string;code:string;label:string;groupName:string;valueMode:string;defaultDelta:string;minimumDelta?:string;maximumDelta?:string;reasonRequired:boolean;maxOccurrencesPerDay?:number;attendanceStatus?:string}[];
          if(rules.length>200||new Set(rules.map(rule=>rule.id)).size!==rules.length||new Set(rules.map(rule=>rule.code)).size!==rules.length)validation('rules','Quy tắc trùng hoặc quá giới hạn');
          for(const rule of rules){points(rule.defaultDelta);if(rule.minimumDelta!==undefined)points(rule.minimumDelta);if(rule.maximumDelta!==undefined)points(rule.maximumDelta);
            if(rule.attendanceStatus&&rule.valueMode!=='FIXED')validation('rules','Điểm danh chỉ liên kết quy tắc điểm cố định');
            if(rule.valueMode==='MANUAL'&&(rule.minimumDelta===undefined||rule.maximumDelta===undefined||new Decimal(rule.minimumDelta).gt(rule.maximumDelta)||new Decimal(rule.defaultDelta).lt(rule.minimumDelta)||new Decimal(rule.defaultDelta).gt(rule.maximumDelta)))validation('rules','Điểm thủ công thiếu hoặc vượt giới hạn');}
          await tx.query('DELETE FROM app.conduct_rules WHERE school_id=$1 AND rule_set_id=$2',[schoolId,current.id]);
          for(const rule of rules)await tx.query(`INSERT INTO app.conduct_rules(id,school_id,rule_set_id,code,label,group_name,value_mode,default_delta,minimum_delta,maximum_delta,reason_required,max_occurrences_per_day,attendance_status)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[rule.id,schoolId,current.id,rule.code,rule.label,rule.groupName,rule.valueMode,rule.defaultDelta,rule.minimumDelta??null,rule.maximumDelta??null,rule.reasonRequired,rule.maxOccurrencesPerDay??null,rule.attendanceStatus??null]);
        }
        if(c.body.thresholds){const thresholds=c.body.thresholds as {label:string;minimumScore:string}[];if(thresholds.length>50||new Set(thresholds.map(t=>points(t.minimumScore))).size!==thresholds.length)validation('thresholds','Mốc xếp loại trùng hoặc quá giới hạn');
          await tx.query('DELETE FROM app.rule_thresholds WHERE school_id=$1 AND rule_set_id=$2',[schoolId,current.id]);
          for(let index=0;index<thresholds.length;index++){const t=thresholds[index]!;await tx.query('INSERT INTO app.rule_thresholds(school_id,rule_set_id,label,minimum_score,sort_order) VALUES($1,$2,$3,$4,$5)',[schoolId,current.id,t.label,t.minimumScore,index]);}}
        await updateResource(tx,r,schoolId,String(current.id),c.body,{updated_at:new Date()});
      }
      await audit(tx,c,'ruleSet',String(current.id),{status:op==='issueRuleSet'?'ISSUED':'DRAFT'});return {data:await this.detail(tx,schoolId,String(current.id))};
    };
    if(c.operation.method==='GET')return this.db.transaction(async tx=>{await authorize(tx);return work(tx);},{schoolId});
    return this.commands.execute(c,authorize,work);
  }
}
