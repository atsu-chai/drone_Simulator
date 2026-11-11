import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createExam,reduceExam,tickExam,examClock,examResult} from '../src/exam-flow.js';
import {mockPlan} from '../src/exam-content.js';
const at=stage=>({...createExam(),stage});
test('reception requires identity, protection and notice; reducer leaves original untouched',()=>{
  const s=createExam();assert.equal(reduceExam(s,{type:'submit',data:{name:'操縦者'}}).stage,'reception');
  const next=reduceExam(s,{type:'submit',data:{name:'操縦者',helmet:true,glasses:true,notice:true}});assert.equal(next.stage,'desk');assert.equal(s.name,'');
});
test('desk and oral deadlines score unanswered items; shared before-flight budget never resets',()=>{
  const desk=tickExam(at('desk'),300.1);assert.equal(desk.stage,'air');assert.equal(examResult(desk).deduction,20);
  const air=tickExam(at('air'),180.1);assert.equal(air.stage,'preflight');assert.equal(examResult(air).deduction,10);
  let s=at('preflight');s.stageElapsed=100;s=reduceExam(s,{type:'submit'});assert.equal(s.stageElapsed,100);assert.equal(s.stage,'powered');
  s=tickExam(s,621);assert.equal(s.stage,'square');assert.ok(s.events.some(e=>e.detail.includes('12分')));
  assert.equal(tickExam(at('incident1'),181).stage,'incident2');assert.equal(tickExam(at('incident2'),181).stage,'result');
});
test('inspection requires physical observation before a result can be written and registration is checked',()=>{
  let s=at('preflight');s=reduceExam(s,{type:'write',id:'body',value:'正常'});assert.equal(s.daily.body,undefined);
  s=reduceExam(s,{type:'observe',id:'body'});s=reduceExam(s,{type:'write',id:'body',value:'正常'});assert.equal(s.daily.body,'正常');
  const record=reduceExam(at('preRecord'),{type:'submit'});assert.ok(record.events.some(e=>e.code==='pre-record'));
});
test('power on and power off order have their own minor-issue groups',()=>{
  assert.ok(reduceExam(at('powered'),{type:'power',device:'aircraft'}).events.some(e=>e.code==='pre-minor'));
  const s=at('post');s.power={aircraft:true,transmitter:true};assert.ok(reduceExam(s,{type:'power',device:'transmitter'}).events.some(e=>e.code==='post-minor'));
});
test('postflight compares actual flight times, dates, identity and total; timeout evaluates missing record',()=>{
  let s=at('post');s.name='操縦者';s.flights=[{tookOff:60,landed:120}];
  s.observed=Object.fromEntries(['mount','exterior','heat','debris'].map(k=>['post:'+k,true]));s.postDaily=Object.fromEntries(['mount','exterior','heat','debris'].map(k=>[k,'正常']));
  s.postMetadata={registration:mockPlan.registration,date:s.date,place:mockPlan.place,name:s.name};
  const r={date:s.date,name:s.name,overview:'点検と実技',takeoffPlace:mockPlan.place,landingPlace:mockPlan.place,safety:'なし',defects:'なし',off0:examClock(s,60),on0:examClock(s,120),minutes0:'1',minutes:'1',total:'121'};
  assert.equal(examResult(reduceExam(s,{type:'submit',data:{record:r}})).deduction,0);
  assert.equal(examResult(reduceExam(s,{type:'submit',data:{record:{...r,minutes:'4'}}})).deduction,10);
  assert.equal(examResult(tickExam(s,301)).deduction,10);
});
test('unfinished written fields at the end of the shared budget are record issues, not missed flight checks',()=>{
  const s=at('preRecord');for(const id of ['communication','propulsion','automatic']){s.observed[id]=true;s.daily[id]='正常';}
  const result=tickExam(s,721);assert.equal(result.stage,'square');assert.equal(examResult(result).deduction,5);
});
test('a pause during flight is recorded without ending or failing the exam',()=>{
  const s=reduceExam(at('square'),{type:'pause',reason:'画面を離れました'});
  assert.equal(s.stage,'square');assert.equal(s.pauses,1);
  const r=examResult(s);assert.equal(r.fatal,false);assert.equal(r.pauses,1);
});
