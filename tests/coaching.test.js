import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFlightState} from '../src/session-rules.js';
import {expectedHeading} from '../src/course-layout.js';
import {evaluateFlightCoaching} from '../src/flight-coaching.js';
import {summarizeFlight} from '../src/flight-results.js';
const tick=(s,dt=.01)=>{s.simulationTime+=dt;return evaluateFlightCoaching(s,dt);};
function flight(subject='square') {const s=createFlightState(subject);s.running=true;s.phase=subject;s.drone.y=3.5;return s;}
test('square heading is a fixed leg direction on either side of a waypoint',()=>{
  for(const position of [{x:6,z:0},{x:7,z:0}])assert.equal(expectedHeading('square',position,1,{x:6.5,z:0}),Math.PI/2);
  assert.equal(expectedHeading('square',{x:6.5,z:4},2,null),0);
});
test('brief heading corrections reset, sustained sideways flight is recorded once per leg',()=>{
  const s=flight();s.squareIndex=1;s.drone.vx=1;s.drone.yaw=0;
  for(let i=0;i<50;i++)tick(s);assert.equal(s.evaluation.events.length,0);
  s.drone.yaw=Math.PI/2;tick(s);s.drone.yaw=0;
  for(let i=0;i<400;i++)tick(s);
  assert.deepEqual(s.evaluation.events.map(e=>e.type),['heading-warning','heading-error']);
  assert.equal(s.evaluation.events[1].expectedYaw,Math.PI/2);
  s.paused=true;const before=structuredClone(s.coaching);tick(s);assert.deepEqual(s.coaching,before);
});
test('eight heading error spans waypoint changes and requires a continuous quarter circle',()=>{
  const s=flight('eight');
  function sample(angle,wrong=true) {
    Object.assign(s.drone,{x:-2.5+2.5*Math.cos(angle),z:2.5*Math.sin(angle),vx:-Math.sin(angle),vz:Math.cos(angle)});
    s.eightIndex=Math.floor(angle/(Math.PI/2));
    s.drone.yaw=expectedHeading('eight',s.drone,s.eightIndex,null)+(wrong?Math.PI:0);tick(s);
  }
  for(let a=0;a<1.5;a+=.01)sample(a);
  assert.equal(s.evaluation.events.some(e=>e.type==='heading-error'),false);
  for(let a=1.5;a<2;a+=.01)sample(a);
  assert.equal(s.evaluation.events.filter(e=>e.type==='heading-error').length,1);
  const right=flight('eight');
  for(let a=0;a<6;a+=.01) {
    Object.assign(right.drone,{x:-2.5+2.5*Math.cos(a),z:2.5*Math.sin(a),vx:-Math.sin(a),vz:Math.cos(a)});
    right.eightIndex=Math.min(3,Math.floor(a/(Math.PI/2)));right.drone.yaw=expectedHeading('eight',right.drone,right.eightIndex,null);tick(right);
  }
  assert.deepEqual(right.evaluation.events,[]);
});
test('sideways abnormal flight keeps forward heading; reverse movement is separate from yaw',()=>{
  const s=flight('abnormal');s.abnormalIndex=1;s.drone.yaw=0;s.drone.vx=-1;
  for(let i=0;i<300;i++)tick(s);
  assert.deepEqual(s.evaluation.events.map(e=>e.type),['reverse-warning','reverse-flight']);
});
test('route completion is distinct from a settled landing in the result',()=>{
  const s=flight();s.squareIndex=6;
  let result=summarizeFlight(s);assert.equal(result.progress[0].complete,false);assert.match(result.feedback[0],/接地/);assert.match(result.status,/未完了/);
  s.completedSubjects.push('square');result=summarizeFlight(s);assert.equal(result.progress[0].complete,true);assert.match(result.status,/練習終了/);
});
test('fatal and reverse feedback leads to the affected subject without claiming a pass',()=>{
  const s=flight('full');s.squareIndex=6;s.completedSubjects.push('square');
  s.evaluation.events.push({type:'reverse-flight',points:5,phase:'eight'});
  const result=summarizeFlight(s);assert.equal(result.retrySubject,'eight');assert.match(result.feedback[0],/逆方向/);assert.ok(result.feedback.length<=3);assert.match(result.status,/未完了/);
  s.evaluation.fatal=true;s.evaluation.events.push({type:'cone-collision',fatal:true,points:0,phase:'abnormal'});
  const stopped=summarizeFlight(s);assert.equal(stopped.score,0);assert.equal(stopped.retrySubject,'abnormal');assert.match(stopped.feedback[0],/コーン/);
});
