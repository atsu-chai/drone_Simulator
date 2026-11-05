import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scoreExam,flightMinutes,matchesFlightMinutes,scoringRules} from '../src/exam-scoring.js';
test('preflight uses only the greatest issue across air, ground, flying and records',()=>{
  const r=scoreExam([{code:'pre-record',stage:'preflight'},{code:'pre-omission',stage:'air'},{code:'pre-omission',stage:'powered'},{code:'pre-minor'}]);
  assert.equal(r.deduction,10);assert.equal(r.rows.filter(r=>r.applied).length,1);
});
test('post inspection and flight record have independent maxima; desk and practical add',()=>{
  const r=scoreExam(['post-inspection','post-daily','post-minor','flight-record','flight-minor','desk-answer','desk-answer','route'].map(code=>({code})));
  assert.equal(r.deduction,30);assert.equal(r.remaining,70);assert.equal(r.meetsReference,true);
  assert.equal(scoreExam([{code:'fatal'}]).meetsReference,false);
  assert.equal(scoreExam([{code:'route',points:0}]).deduction,5);
});
test('flight durations are actual airborne intervals, not elapsed exam or planned time',()=>{
  // 01:40→02:55 and 05:00→05:45 on the form's minute clock: 1 and 0 minutes.
  const flights=[{tookOff:100,landed:175},{tookOff:300,landed:345}];
  assert.equal(flightMinutes(flights),1);assert.equal(matchesFlightMinutes('1',flights),true);assert.equal(matchesFlightMinutes('1.25',flights),false);
  assert.equal(flightMinutes(flights,50000),2);assert.equal(matchesFlightMinutes('',flights),false);assert.equal(matchesFlightMinutes(5,flights),false);
  for(const code of ['route','instruction','landing','safety-call'])assert.equal(scoringRules[code].points,5);
  for(const code of ['heading','wobble','smoothness'])assert.equal(scoringRules[code].points,1);
});
