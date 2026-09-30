import test from 'node:test';
import assert from 'node:assert/strict';
import { points,ruleDelta,score } from '../../dist/modules/conduct/scoring.js';
test('decimal scoring preserves fractional sums, negative penalties, explicit base, clamps and threshold boundaries',()=>{
  const set={base_points:'0.10',minimum_points:'0.00',maximum_points:'1.00'},thresholds=[{minimum_score:'0.30',label:'Đạt'},{minimum_score:'0.00',label:'Thấp'}];
  assert.deepEqual(score(set,['0.10','0.20','-0.10'],thresholds),{basePoints:'0.10',bonusPoints:'0.30',penaltyPoints:'-0.10',finalPoints:'0.30',classification:'Đạt'});
  assert.equal(score(set,['2.00'],thresholds).finalPoints,'1.00');assert.equal(score(set,['-2.00'],thresholds).finalPoints,'0.00');
  assert.throws(()=>points('99999999.999'),error=>error.status===422);
});
test('fixed deltas reject overrides and manual deltas require bounds',()=>{
  assert.equal(ruleDelta({value_mode:'FIXED',default_delta:'-5.00'}),'-5.00');
  assert.throws(()=>ruleDelta({value_mode:'FIXED',default_delta:'-5.00'},'-1.00'),error=>error.status===422);
  const manual={value_mode:'MANUAL',minimum_delta:'-2.00',maximum_delta:'2.00'};
  assert.equal(ruleDelta(manual,'0.10'),'0.10');assert.throws(()=>ruleDelta(manual,'2.01'),error=>error.status===422);assert.throws(()=>ruleDelta(manual),error=>error.status===422);
});
