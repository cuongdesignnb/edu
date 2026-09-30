import Decimal from 'decimal.js';
import type { Row } from '../../database/database';
import { validation } from '../../common/problem';
export function points(value:Decimal.Value){const decimal=new Decimal(value);if(!decimal.isFinite()||decimal.decimalPlaces()>2||decimal.abs().gte(100_000_000))validation('points','Điểm ngoài phạm vi số thập phân của contract');return decimal.toFixed(2);}
export function ruleDelta(rule:Row,manual?:string){
  if(rule.value_mode==='FIXED'){if(manual!==undefined)validation('manualDelta','Quy tắc cố định không nhận điểm ghi đè');return points(String(rule.default_delta));}
  if(manual===undefined||rule.minimum_delta===null||rule.maximum_delta===null)validation('manualDelta','Quy tắc thủ công cần điểm và giới hạn đã ban hành');
  const value=new Decimal(manual);if(value.lt(String(rule.minimum_delta))||value.gt(String(rule.maximum_delta)))validation('manualDelta','Điểm vượt giới hạn nội quy');return points(value);
}
export function score(ruleSet:Row,deltas:string[],thresholds:Row[]){
  let bonus=new Decimal(0),penalty=new Decimal(0);for(const delta of deltas){const n=new Decimal(delta);if(n.isNegative())penalty=penalty.plus(n);else bonus=bonus.plus(n);}
  let final=new Decimal(String(ruleSet.base_points)).plus(bonus).plus(penalty);
  if(ruleSet.minimum_points!==null&&ruleSet.minimum_points!==undefined)final=Decimal.max(final,String(ruleSet.minimum_points));
  if(ruleSet.maximum_points!==null&&ruleSet.maximum_points!==undefined)final=Decimal.min(final,String(ruleSet.maximum_points));
  const threshold=[...thresholds].sort((a,b)=>new Decimal(String(b.minimum_score)).cmp(String(a.minimum_score))).find(t=>final.gte(String(t.minimum_score)));
  return {basePoints:points(String(ruleSet.base_points)),bonusPoints:points(bonus),penaltyPoints:points(penalty),finalPoints:points(final),classification:threshold?.label??null};
}
