import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPractical,tickPractical,respondPractical,practicalZones,expectedCall,practicalPhase,practicalAltitude,practicalTarget} from '../src/exam-practical.js';
import {layouts} from '../src/course-layout.js';
import {createFlightState} from '../src/session-rules.js';
import {createFlightPhysics} from '../src/flight-physics.js';
import {advanceFlightFrame} from '../src/flight-frame.js';
import {createVerificationPilot} from './helpers/physical-flight.js';
const zero={throttle:0,forward:0,strafe:0,yaw:0};
const sample=(d={},input={})=>({drone:{x:0,z:2.5,y:3.5,vx:0,vz:0,vy:0,yaw:0,...d},input:{...zero,...input},time:10,groundTime:0,touchdowns:[]});
const moveState=(subject='square')=>({...createPractical(subject),step:2});
test('missing takeoff and landing calls deduct; unsafe inspection propulsion is fatal',()=>{
  const p=tickPractical(createPractical('square'),sample({y:.1}),.01);assert.ok(p.events.some(e=>e.code==='safety-call'));
  const i=tickPractical(createPractical('inspection'),sample({y:.1}),.01);assert.equal(i.fatal,true);
  let l=createPractical('square');l.step=l.plan.length-1;
  l=tickPractical(l,sample({y:2},{throttle:-.5}),.01);assert.ok(l.events.some(e=>e.code==='safety-call'));
});
test('waiting records pilot input plus motion; wind drift alone and abnormal lateral correction do not count',()=>{
  let p={...moveState(),mode:'wait',previous:sample().drone};
  const drift=tickPractical(p,sample({x:.02}),.02);assert.ok(!drift.events.some(e=>e.detail.includes('指示前')));
  const input=tickPractical(p,sample({x:.02},{strafe:.5}),.02);assert.ok(input.events.some(e=>e.detail.includes('指示前')));
  p={...moveState('abnormal'),mode:'wait',previous:sample().drone};
  assert.ok(!tickPractical(p,sample({x:.02},{strafe:.5}),.02).events.some(e=>e.detail.includes('指示前')));
  assert.ok(tickPractical(p,sample({yaw:.02},{yaw:.5}),.02).events.some(e=>e.detail.includes('指示前')));
});
test('initial zone entry is forgiven within two seconds; repeat entry and slow return deduct',()=>{
  const outside=sample({x:8.2,z:2.5}),inside=sample({x:6,z:0});let p=moveState();
  p=tickPractical(p,outside,.1);assert.ok(p.warning);p=tickPractical(p,inside,1.9);assert.equal(p.events.filter(e=>e.code==='route').length,0);
  p=tickPractical(p,outside,.1);assert.equal(p.events.filter(e=>e.code==='route').length,1);
  p=moveState();p=tickPractical(p,outside,.1);p=tickPractical(p,outside,2.01);assert.equal(p.events.filter(e=>e.code==='route').length,1);
});
test('emergency declaration and landing command are separate; landing transit excludes penalty areas',()=>{
  const p=createPractical('abnormal');const emergency=p.plan.findIndex(s=>s.kind==='emergency'),transit=p.plan.findIndex(s=>s.kind==='transit');assert.equal(transit,emergency+1);
  const inPenalty={x:0,z:1.8,y:3.5};
  assert.equal(practicalZones({...p,step:emergency},inPenalty).penalty,true);
  assert.equal(practicalZones({...p,step:transit},inPenalty).penalty,false);
  const t=tickPractical({...p,step:transit},sample(inPenalty),2.1);assert.ok(!t.events.some(e=>e.code==='route'));
  assert.equal(tickPractical({...p,step:transit},sample({x:20}),.1).fatal,true);
});
test('square H–A both directions exempt the inner rectangle; hover and landing only use circle',()=>{
  const p=createPractical('square');for(const step of [1,p.plan.length-2])assert.equal(practicalZones({...p,step},{x:0,z:2.5}).approach,true);
  assert.equal(practicalZones(p,sample().drone).failure,false);assert.equal(practicalZones({...p,step:p.plan.length-1},sample().drone).penalty,false);
});
test('gust excludes wobble and smoothness, but dangerous speed and deadlines still stop the exam',()=>{
  const p=moveState();p.previous={...sample().drone,vx:0,vz:0};
  const s=sample({x:2,z:0,vx:2,roll:.4,rollRate:2},{strafe:.5});
  assert.ok(tickPractical(p,s,.1).events.some(e=>e.code==='smoothness'));
  assert.ok(!tickPractical(p,{...s,gust:{strength:1}},.1).events.some(e=>['smoothness','wobble'].includes(e.code)));
  assert.equal(tickPractical({...p,elapsed:480},sample(),.1).fatal,true);
  assert.equal(tickPractical(p,sample({vx:5.2}),.3).fatal,true);
});
test('centre-free closed figure-eight excursion is fatal',()=>{
  const p=createPractical('eight');p.step=1;p.lobeDistance=9;p.arc=1;p.previous={...sample({z:0,y:1.5}).drone};
  assert.equal(tickPractical(p,sample({z:0,y:1.5}),.01).fatal,true);
});
export function flyExamPractical(subject,{preset='calm',fps=60}={}) {
  const state=createFlightState(subject==='inspection'?'square':subject,{preset,seed:7}),pilot=createVerificationPilot();let p=createPractical(subject),frames=0;
  state.running=true;
  const physics=createFlightPhysics({state,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),trainingNow:()=>state.simulationTime*1000,targetAltitude:()=>practicalAltitude(p),currentNavigationTarget:()=>practicalTarget(p),angleDifference:(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b))});
  while(!p.done&&!p.fatal&&frames<600*fps) {
    if(p.mode==='issued'&&!p.calls[`${p.step}:${expectedCall(p)}`])p=respondPractical(p,expectedCall(p));
    if(p.mode==='arrival')p=respondPractical(p,'arrived');
    state.phase=practicalPhase(p);state.squareIndex=Math.max(0,p.step-1);state.eightIndex=p.eightIndex;state.abnormalIndex=Math.min(3,Math.max(0,p.step-1));
    const step=p.plan[p.step],target=practicalTarget(p),override={altitude:practicalAltitude(p)};
    if(step.kind!=='eight'||p.mode!=='issued')override.target=target;
    if(p.mode!=='issued')override.yaw=state.drone.yaw;
    else if(subject==='inspection')override.yaw=step.yaw??0;
    else if(subject==='square'&&step.kind==='move') {const from=p.plan[p.step-1].target;override.yaw=Math.atan2(target.x-from.x,target.z-from.z);}
    const input=pilot(state,override);
    assert.ok(Object.values(input).every(v=>Number.isFinite(v)&&Math.abs(v)<=1));
    advanceFlightFrame(state,1/fps,input,physics,(dt,stick)=>{
      if(p.done||p.fatal)return;
      p=tickPractical(p,{drone:state.drone,input:stick,gust:state.environment.gust,time:state.simulationTime,simulationTime:state.simulationTime,touchdowns:state.touchdowns,groundTime:state.groundTime},dt);
    });frames++;
  }
  return {p,state,frames};
}
test('verification pilot completes all three instructed subjects using normalized sticks and real frame physics',()=>{
  for(const subject of ['square','eight','abnormal','inspection']) {
    const {p,state}=flyExamPractical(subject);assert.equal(p.fatal,false,`${subject} ${JSON.stringify(p.events)} step=${p.step} d=${JSON.stringify(state.drone)} over=${p.landingOverhead}`);assert.equal(p.done,true,`${subject} step=${p.step} mode=${p.mode} ${JSON.stringify(state.drone)} eight=${p.eightIndex}`);
    assert.ok(p.flight.landed>p.flight.tookOff);assert.ok(state.touchdowns.length>=1);assert.equal(state.drone.y,0);
    if(subject==='eight')assert.equal(p.eightIndex,16);
    assert.ok(!p.events.some(e=>['safety-call'].includes(e.code)));
  }
});
test('a geometrically closed orbit which excludes the commanded centre is stopped',()=>{
  let p=createPractical('eight');p.step=1;p=respondPractical(p,'move');
  for(let i=0;i<=100&&!p.fatal;i++){
    const a=Math.PI+Math.PI*2*i/100;
    p=tickPractical(p,sample({x:2+2*Math.cos(a),z:2*Math.sin(a),y:1.5}),.1);
  }
  assert.equal(p.fatal,true);assert.ok(p.events.some(e=>e.detail.includes('中心を含まない')));
});
test('practical reads frozen aircraft samples without moving the aircraft or mutating prior exam state',()=>{
  const previous=createPractical('square'),before=structuredClone(previous),s=sample({y:.5},{throttle:.3});
  Object.freeze(s.drone);Object.freeze(s.input);Object.freeze(s);
  tickPractical(previous,s,.01);assert.deepEqual(previous,before);assert.equal(s.drone.y,.5);
});
test('official table: no 2 m circle at the emergency hover, where an unstabilised aircraft drifts',()=>{
  const p=createPractical('abnormal'),step=p.plan.findIndex(s=>s.kind==='emergency');
  assert.equal(practicalZones({...p,step},{x:3,z:0}).circle,false);
  assert.equal(practicalZones({...p,step},{x:3,z:0}).penalty,true);
});
test('leaving the 2 m landing circle costs 5 points at once and does not fail the exam',()=>{
  const p=createPractical('square'),step=p.plan.findIndex(s=>s.kind==='land');
  const next=tickPractical({...p,step,calls:{[`${step}:land`]:true},flight:{tookOff:1,landed:null}},sample({x:1.2,y:1,z:2.5}),1/120);
  assert.deepEqual(next.events.map(e=>e.code),['route']);assert.equal(next.fatal,false);
});
test('a wrong or missing routine call guides the pilot without an unofficial deduction',()=>{
  const p=moveState(),wrong=respondPractical(p,'land');
  assert.equal(wrong.events.length,0);assert.ok(wrong.callNote);
  const flown=tickPractical(p,sample({x:.2},{forward:.5}),1/120);
  assert.equal(flown.events.filter(e=>e.code==='instruction').length,0);
});
test('square instructions name the turn and destination, ending over the landing point',()=>{
  const labels=createPractical('square').plan.filter(s=>s.kind==='move').map(s=>s.label);
  assert.equal(labels.length,7);assert.ok(labels.every(text=>text.startsWith('左旋回で機首を')));
  assert.match(labels[0],/A地点/);assert.match(labels.at(-1),/着陸地点/);
});
