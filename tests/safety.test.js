import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFlightState,transitionFlightPhase,landedAt} from '../src/session-rules.js';
import {evaluateFlightSafety,touchesCone} from '../src/flight-safety.js';
test('cone volume detects low contacts but clears the correct 1.5m eight flight',()=>{
  assert.equal(touchesCone({x:0,y:.25,z:0},{x:0,z:0}),true);
  assert.equal(touchesCone({x:.65,y:.05,z:.05},{x:0,z:0}),true);
  assert.equal(touchesCone({x:0,y:1.5,z:0},{x:0,z:0}),false);
});
test('cone collision terminates practice once with input and velocity evidence',()=>{
  const s=createFlightState('square');s.running=true;s.phase='square';Object.assign(s.drone,{x:6.5,z:0,y:.3});
  assert.equal(evaluateFlightSafety(s,1/120)[0].type,'cone-collision');assert.equal(s.evaluation.fatal,true);
  assert.deepEqual(evaluateFlightSafety(s,1/120),[]);assert.equal(s.evaluation.events.length,1);
});
test('landing cannot be completed while airborne or without takeoff and settled contact',()=>{
  const s=createFlightState('square'),home={x:0,z:2.5};assert.equal(landedAt(s,home),false);
  s.hasTakenOff=true;s.groundTime=1;s.drone.y=.05;assert.equal(landedAt(s,home),false);
  s.drone.y=0;assert.equal(landedAt(s,home),true);
  s.groundTime=.1;assert.equal(landedAt(s,home),false);
});
test('unexpected touchdown and incorrect landing locations cannot pass',()=>{
  for(const [phase,x,expected] of [['square',2,'unexpected-touchdown'],['squareLanding',3,'landing-outside']]) {
    const s=createFlightState('square');s.running=true;s.phase=phase;s.touchdowns.push({phase,x,z:2.5,descentSpeed:.2,horizontalSpeed:0});
    evaluateFlightSafety(s,.01);assert.ok(s.evaluation.events.some(e=>e.type===expected));assert.equal(s.evaluation.fatal,true);
  }
});
test('premature descent and sustained dangerous speed are detected once',()=>{
  const s=createFlightState('abnormal');s.running=true;s.phase='emergencyTransit';s.drone.y=2;
  for(let i=0;i<120;i++)evaluateFlightSafety(s,1/120);
  assert.equal(s.evaluation.events.filter(e=>e.type==='early-emergency-descent').length,1);
  s.drone.vx=5.5;for(let i=0;i<40;i++)evaluateFlightSafety(s,1/120);assert.equal(s.evaluation.fatal,true);
});
test('course transitions preserve grounded state and reject airborne relocation',()=>{
  const s=createFlightState('full');s.drone.y=1;assert.throws(()=>transitionFlightPhase(s,'eightTakeoff'));
  s.drone.y=0;transitionFlightPhase(s,'eightTakeoff');assert.equal(s.drone.z,0);assert.equal(s.hasTakenOff,false);
});
test('separate landings each retain their deduction without per-frame duplication',()=>{
  const s=createFlightState('full');s.running=true;s.phase='squareLanding';
  s.touchdowns.push({phase:'squareLanding',x:0,z:2.5,descentSpeed:2,horizontalSpeed:1});
  evaluateFlightSafety(s,1/120);evaluateFlightSafety(s,1/120);
  s.courseId='eight';s.phase='eightLanding';
  s.touchdowns.push({phase:'eightLanding',x:0,z:0,descentSpeed:2,horizontalSpeed:1});
  evaluateFlightSafety(s,1/120);evaluateFlightSafety(s,1/120);
  assert.equal(s.evaluation.events.filter(e=>e.type==='hard-landing').length,2);
  assert.equal(s.evaluation.events.filter(e=>e.type==='landing-slide').length,2);
});
