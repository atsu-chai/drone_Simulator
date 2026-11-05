import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createExam,reduceExam,tickExam,examResult} from '../src/exam-flow.js';
import {examPaper} from '../src/exam-ui.js';
import {subjects} from '../src/training.js';
import {courseIdFor,layouts} from '../src/course-layout.js';
import {createFlightState} from '../src/session-rules.js';
import {practicalLimits} from '../src/exam-practical.js';
import {createPhysicalExam} from './helpers/exam-flight.js';
const stages=['flightcheck','square','eight','abnormal'];
const parked={drone:{x:0,z:2.5,y:0,vx:0,vy:0,vz:0,yaw:0},input:{},touchdowns:[],groundTime:0,time:0};
test('each flight is a selectable subject on its own course',()=>{
  for(const stage of stages)assert.equal(subjects[`exam-${stage}`].examStage,stage);
  assert.equal(courseIdFor('preflight','exam-eight'),'eight');assert.equal(courseIdFor('preflight','exam-abnormal'),'abnormal');
  assert.deepEqual(createFlightState('exam-eight').drone.z,layouts.eight.takeoff.z);
});
test('flight-only opens straight at the flight, and the full exam still opens at reception',()=>{
  assert.equal(createExam().stage,'reception');assert.equal(createExam().flightOnly,null);
  assert.equal(createExam({flightOnly:'square'}).stage,'square');
  assert.equal(createExam({flightOnly:'flightcheck'}).practical.subject,'inspection');
  assert.throws(()=>createExam({flightOnly:'desk'}));
});
test('every flight is flown from start to result in calm and light wind',()=>{
  for(const flightOnly of stages)for(const preset of ['calm','light']) {
    const session=createPhysicalExam({flightOnly,preset});
    assert.equal(session.fly(),'result',JSON.stringify(session.exam.events));
    const r=examResult(session.exam);assert.equal(r.fatal,false,`${flightOnly}/${preset}`);
    assert.equal(session.exam.flights.length,1);assert.deepEqual(session.exam.completed,[flightOnly]);
    assert.ok(session.exam.events.every(e=>!/^(pre|post|flight-record|desk|incident)/.test(e.code)));
  }
});
test('readout limits match the exam stage limits',()=>{
  assert.deepEqual(practicalLimits,{square:480,eight:480,abnormal:360,inspection:720});
});
test('going over the limit stops the flight instead of moving on to the next stage',()=>{
  for(const [flightOnly,limit] of [['flightcheck',720],['square',480],['eight',480],['abnormal',360]]) {
    const s=tickExam(createExam({flightOnly}),limit+1,parked);
    assert.equal(s.stage,'result',flightOnly);assert.equal(examResult(s).fatal,true,flightOnly);
  }
});
test('the result covers this flight only, without the 70 point comparison, and offers a retry',()=>{
  const s=reduceExam(createExam({flightOnly:'square'}),{type:'interrupt',reason:'確認'});
  const fatal=examPaper(s);assert.match(fatal,/試験中止/);assert.match(fatal,/data-retry/);
  const clean=examPaper({...createExam({flightOnly:'eight'}),stage:'result',elapsed:125});
  assert.match(clean,/8の字の飛行のみ/);assert.match(clean,/公式の合否ではない/);assert.match(clean,/減点 0点/);assert.match(clean,/経過 2分05秒（制限 8分00秒）/);
  assert.doesNotMatch(clean,/70点|机上：|飛行記録：/);assert.match(clean,/飛行経路逸脱/);
  assert.doesNotMatch(examPaper({...createExam(),stage:'result'}),/data-retry/);
});
