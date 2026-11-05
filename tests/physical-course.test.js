import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flyPhysicalCourse,createPhysicalSession} from './helpers/physical-flight.js';
import {createEvaluation,evaluateSample} from '../src/training.js';
import {advanceFlightFrame} from '../src/flight-frame.js';

for(const subject of ['square','eight','abnormal','full']) {
  test(`${subject}: normalized sticks and production physics complete every task and physically land`,()=>{
    const run=flyPhysicalCourse(subject);
    assert.equal(run.outcome,'completed');
    assert.ok(run.result.progress.every(task=>task.complete));
    assert.equal(run.result.score,100);
    assert.equal(run.final.y,0);
    assert.equal(run.touchdowns.length,subject==='full'?3:1);
    assert.equal(run.events.some(e=>e.fatal || e.type==='failure-zone' || e.points>0),false);
    assert.ok(run.altitudeRms<.1);
    if(['square','full'].includes(subject))assert.equal(run.squareIndex,6);
    if(['eight','full'].includes(subject))assert.equal(run.eightIndex,16);
    if(['abnormal','full'].includes(subject)) {
      assert.equal(run.abnormalIndex,4);
      const arrival=run.phases.find(p=>p.phase==='emergencyArrival');
      const landing=run.phases.find(p=>p.phase==='landing');
      assert.ok(landing.time-arrival.time>=.5);
      assert.ok(run.samples.filter(p=>p.phase==='emergencyTransit').every(p=>Math.abs(p.y-3.5)<.4));
    }
    assert.ok(run.samples.every(s=>Object.values(s.input).every(v=>Number.isFinite(v)&&Math.abs(v)<=1)));
  });
}
test('ten full runs use production frame accumulation and frame-rate input sampling',()=>{
  const references={30:flyPhysicalCourse('full',{fps:30}),60:flyPhysicalCourse('full',{fps:60})};
  assert.ok(Math.abs(references[30].duration-references[60].duration)<3);
  for(let i=0;i<10;i++) {
    const fps=i%2?30:60,run=flyPhysicalCourse('full',{fps});
    assert.equal(run.outcome,'completed');
    assert.ok(run.result.progress.every(task=>task.complete));
    assert.equal(run.result.score,100);assert.equal(run.touchdowns.length,3);
    assert.deepEqual(run,references[fps]);
  }
});
test('production frame clock drops background catch-up and paused time',()=>{
  const state={physicsAccumulator:0,paused:false};let steps=0;
  const physics=()=>steps++,mission=()=>{};
  advanceFlightFrame(state,60,{},physics,mission);assert.ok(steps<=12);
  const before=steps;state.paused=true;advanceFlightFrame(state,1,{},physics,mission);assert.equal(steps,before);assert.equal(state.physicsAccumulator,0);
  state.paused=false;advanceFlightFrame(state,1/60,{},physics,mission);assert.equal(steps,before+2);
});
test('neutral sticks cannot bypass takeoff and eventually time out',()=>{
  const session=createPhysicalSession('square');
  for(let i=0;i<120*482 && session.state.running;i++)session.step({throttle:0,yaw:0,forward:0,strafe:0});
  assert.equal(session.outcome,'timeout');assert.equal(session.state.squareIndex,0);assert.equal(session.state.touchdowns.length,0);
});
test('small drift over H on the abnormal failure line is not an instant failure',()=>{
  const near=createEvaluation();
  evaluateSample(near,{phase:'abnormal',index:0,time:0,position:{x:0,y:3.5,z:2.52}});
  evaluateSample(near,{phase:'abnormal',index:0,time:3,position:{x:.3,y:3.5,z:2.52}});
  assert.equal(near.fatal,false);assert.equal(near.events.length,0);
  const away=createEvaluation();
  evaluateSample(away,{phase:'abnormal',index:0,time:0,position:{x:3,y:3.5,z:2.6}});
  assert.equal(away.fatal,true);
});
test('H arrival exemption does not disable the boundary on the preceding transit',()=>{
  const e=createEvaluation();
  evaluateSample(e,{phase:'emergencyTransit',time:0,anchor:{x:6.5,z:0},position:{x:3,y:3.5,z:2.6}});
  assert.equal(e.fatal,true);
  const arrival=createEvaluation();
  evaluateSample(arrival,{phase:'emergencyArrival',time:0,position:{x:0,y:3.5,z:2.6}});
  assert.equal(arrival.fatal,false);assert.equal(arrival.events.length,0);
  evaluateSample(arrival,{phase:'emergencyArrival',time:1,position:{x:1.1,y:3.5,z:2.4}});
  evaluateSample(arrival,{phase:'emergencyArrival',time:3,position:{x:1.1,y:3.5,z:2.4}});
  assert.equal(arrival.events.at(-1).type,'route-penalty');
  evaluateSample(arrival,{phase:'emergencyArrival',time:4,position:{x:30,y:3.5,z:30}});
  assert.equal(arrival.fatal,true);
});
for(const preset of ['light','moderate','limit']) {
  test(`${preset} wind: every subject stays flyable through production physics`,()=>{
    for(const subject of ['square','eight','abnormal'])for(const seed of [1,2]) {
      const run=flyPhysicalCourse(subject,{environment:{preset,seed}});
      assert.equal(run.outcome,'completed');assert.ok(run.result.progress.every(task=>task.complete));
      assert.equal(run.final.y,0);
    }
  });
}
test('the same seed replays the same windy flight; another seed does not',()=>{
  const fly=seed=>flyPhysicalCourse('abnormal',{environment:{preset:'moderate',seed}});
  assert.deepEqual(fly(5),fly(5));assert.notDeepEqual(fly(5).samples,fly(6).samples);
});
