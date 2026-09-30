import {one,type Row,type Transaction} from '../../database/database';
import {Problem,validation} from '../../common/problem';
import {audit} from '../../common/commands';
import type {RequestContext} from '../../api.router';

type TermInput={code:string;name:string;startsOn:string;endsOn:string;openingDate?:string|null};
type HolidayInput={title:string;startsOn:string;endsOn:string};
export function addDateDays(date:string,days:number){const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
function interval(start:string,end:string,lo:string,hi:string,path:string){
  if(start>=end)validation(`${path}.endsOn`,'Ngày kết thúc phải sau ngày bắt đầu');
  if(start<lo||end>hi)validation(`${path}.startsOn`,'Mốc phải nằm trong năm học');
}
/** Inputs and all generated child records belong to the same school command. */
export async function createYearSetup(tx:Transaction,c:RequestContext,yearId:string){
  const schoolId=c.params.schoolId!,lo=String(c.body.startsOn),hi=String(c.body.endsOn);
  const terms=c.body.terms as TermInput[]|undefined,holidays=c.body.holidays as HolidayInput[]|undefined;
  if((holidays||c.body.copyRules)&&!terms)validation('terms','Tạo lịch hoặc sao chép nội quy cần khai báo học kỳ');
  if(!terms)return;
  if((Date.parse(hi)-Date.parse(lo))/86400000>730)validation('endsOn','Năm học không vượt quá 730 ngày');
  const ordered=terms.map((term,index)=>({...term,index})).sort((a,b)=>a.startsOn.localeCompare(b.startsOn));
  if(new Set(terms.map(t=>t.code)).size!==terms.length)validation('terms','Mã học kỳ bị trùng');
  for(let index=0;index<ordered.length;index++){
    const term=ordered[index]!,path=`terms.${term.index}`;
    interval(term.startsOn,term.endsOn,lo,hi,path);
    if(index&&ordered[index-1]!.endsOn>term.startsOn)validation(`${path}.startsOn`,'Học kỳ chồng thời gian');
    if(term.openingDate&&(term.openingDate<term.startsOn||term.openingDate>=term.endsOn))validation(`${path}.openingDate`,'Ngày khai giảng phải nằm trong học kỳ');
  }
  for(let index=0;index<(holidays?.length??0);index++){const holiday=holidays![index]!;interval(holiday.startsOn,holiday.endsOn,lo,hi,`holidays.${index}`);}
  let weekNumber=0;
  for(const term of ordered){
    const saved=await one<{id:string}>(tx,`INSERT INTO app.terms(school_id,year_id,code,name,starts_on,ends_on,opening_date) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[schoolId,yearId,term.code,term.name,term.startsOn,term.endsOn,term.openingDate??null]);
    // Preserve Monday/Sunday weeks, including a bounded first/last partial week.
    for(let start=term.startsOn;start<term.endsOn;){
      const weekday=new Date(`${start}T00:00:00Z`).getUTCDay()||7,nextMonday=addDateDays(start,weekday===1?7:8-weekday),end=nextMonday<term.endsOn?nextMonday:term.endsOn;
      weekNumber++;
      await tx.query(`INSERT INTO app.school_weeks(school_id,year_id,term_id,week_number,starts_on,ends_on,input_deadline)
        SELECT $1,$2,$3,$4,$5,$6,($6::date::timestamp+interval '1 day'-interval '1 millisecond') AT TIME ZONE timezone FROM platform.schools WHERE id=$1`,[schoolId,yearId,saved!.id,weekNumber,start,end]);
      start=end;
    }
  }
  for(const holiday of holidays??[])await tx.query(`INSERT INTO app.calendar_events(school_id,year_id,title,kind,starts_on,ends_on,status) VALUES($1,$2,$3,'HOLIDAY',$4,$5,'PUBLISHED')`,[schoolId,yearId,holiday.title,holiday.startsOn,holiday.endsOn]);
  let copiedRuleSetId:string|undefined;
  if(c.body.copyRules){
    const source=await one<Row>(tx,`SELECT r.* FROM app.rule_sets r WHERE r.school_id=$1 AND r.status='ISSUED' AND EXISTS(
      SELECT 1 FROM app.class_rule_periods p JOIN platform.schools s ON s.id=p.school_id WHERE p.school_id=r.school_id AND p.rule_set_id=r.id
      AND p.starts_on<=(now() AT TIME ZONE s.timezone)::date AND (p.ends_on IS NULL OR p.ends_on>(now() AT TIME ZONE s.timezone)::date)) ORDER BY r.revision DESC,r.id LIMIT 1`,[schoolId]);
    if(source){
      const revision=await one<{next:number}>(tx,'SELECT coalesce(max(revision),0)+1 AS next FROM app.rule_sets WHERE school_id=$1',[schoolId]);
      const copied=await one<{id:string}>(tx,`INSERT INTO app.rule_sets(school_id,name,revision,base_points,minimum_points,maximum_points) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[schoolId,`${String(source.name).slice(0,120)} — ${String(c.body.name).slice(0,70)}`,revision!.next,source.base_points,source.minimum_points,source.maximum_points]);
      copiedRuleSetId=copied!.id;
      await tx.query(`INSERT INTO app.conduct_rules(school_id,rule_set_id,code,label,group_name,value_mode,default_delta,minimum_delta,maximum_delta,max_occurrences_per_day,reason_required,attendance_status)
        SELECT school_id,$3,code,label,group_name,value_mode,default_delta,minimum_delta,maximum_delta,max_occurrences_per_day,reason_required,attendance_status FROM app.conduct_rules WHERE school_id=$1 AND rule_set_id=$2`,[schoolId,source.id,copiedRuleSetId]);
      await tx.query(`INSERT INTO app.rule_thresholds(school_id,rule_set_id,label,minimum_score,sort_order) SELECT school_id,$3,label,minimum_score,sort_order FROM app.rule_thresholds WHERE school_id=$1 AND rule_set_id=$2`,[schoolId,source.id,copiedRuleSetId]);
      await audit(tx,c,'ruleSet',copiedRuleSetId,{status:'DRAFT',revision:revision!.next});
    }
  }
  return {termCount:terms.length,weekCount:weekNumber,holidayCount:holidays?.length??0,...(copiedRuleSetId?{copiedRuleSetId}:{})};
}
export async function ensureYearRange(tx:Transaction,schoolId:string,start:string,end:string,id?:string){
  if(start>=end)validation('endsOn','Ngày kết thúc phải sau ngày bắt đầu');
  const overlap=await one(tx,`SELECT id FROM app.academic_years WHERE school_id=$1 AND ($4::uuid IS NULL OR id<>$4) AND daterange(starts_on,ends_on,'[)') && daterange($2::date,$3::date,'[)') LIMIT 1`,[schoolId,start,end,id??null]);
  if(overlap)throw new Problem(422,'YEAR_RANGE_OVERLAP',[{path:'startsOn',code:'OVERLAP',message:'Trùng khoảng thời gian với năm học đã có'}]);
}
