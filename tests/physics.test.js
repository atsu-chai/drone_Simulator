import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFlightPhysics,flightModel} from '../src/flight-physics.js';
import {createEnvironment} from '../src/flight-environment.js';
function harness(phase='eight') {
  const state={paused:false,running:true,phase,simulationTime:0,command:{throttle:0,forward:0,strafe:0,yaw:0},respondedPhase:null,lastPhaseChange:0,responseDelays:[],drone:{x:0,y:1.5,z:-2.49,vx:0,vy:0,vz:-1,yaw:0,yawRate:0,roll:0,pitch:0,rollRate:0,pitchRate:0,thrustNewtons:11.3},batteryPct:100,altitudeErrorSquared:0,altitudeSampleTime:0,headingErrorSquared:0,headingSampleTime:0,hardLandingSpeed:0,eightIndex:2};
  const step=createFlightPhysics({state,clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),trainingNow:()=>state.simulationTime*1000,targetAltitude:()=>phase==='eight'?1.5:3.5,currentNavigationTarget:()=>null,angleDifference:(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b))});
  return {state,step};
}
const neutral={throttle:0,forward:0,strafe:0,yaw:0};
test('gentle commanded descent reaches physical ground despite ground effect',()=>{
  const h=harness('eightLanding');h.state.drone.y=.3;h.state.drone.vz=0;
  for(let i=0;i<120*5;i++)h.step(flightModel.fixedStep,{...neutral,throttle:-.18/flightModel.maxDescentRate});
  assert.equal(h.state.drone.y,0);
  assert.ok(h.state.groundTime>.3);
  assert.equal(h.state.touchdowns.length,1);
  assert.ok(h.state.touchdowns[0].descentSpeed<.3);
});
test('sub-millimetre final descent still records the touchdown exactly once',()=>{
  const h=harness('eightLanding');Object.assign(h.state.drone,{y:.0005,vy:-.1,vz:0});h.state.hasTakenOff=true;
  for(let i=0;i<60;i++)h.step(flightModel.fixedStep,{...neutral,throttle:-.2});
  assert.equal(h.state.touchdowns.length,1);assert.equal(h.state.drone.y,0);
});
test('real physics allows legitimate eight route beyond the former invisible wall',()=>{
  const h=harness();for(let i=0;i<12;i++)h.step(flightModel.fixedStep,neutral);assert.ok(h.state.drone.z< -2.5);assert.ok(h.state.drone.vz<0);
});
test('real fixed-step physics gives the same trajectory for 30 and 60 display frames',()=>{
  function run(fps) {
    const h=harness();h.state.drone.z=0;h.state.drone.vz=0;
    for(let frame=0;frame<fps*6;frame++)for(let i=0;i<120/fps;i++)h.step(flightModel.fixedStep,{...neutral,forward:frame<fps*2?.2:0,throttle:frame<fps?.15:0});
    return h.state.drone;
  }
  assert.deepEqual(run(30),run(60));
});
test('emergency transit measures altitude loss and paused physics does not advance',()=>{
  const h=harness('emergencyTransit');h.state.drone.y=1.5;h.step(flightModel.fixedStep,neutral);assert.ok(h.state.altitudeErrorSquared>0);
  h.state.paused=true;const before=structuredClone(h.state.drone),clock=h.state.simulationTime;h.step(flightModel.fixedStep,neutral);assert.deepEqual(h.state.drone,before);assert.equal(h.state.simulationTime,clock);
});
test('a steady wind pushes an attitude-mode aircraft but GNSS leans in and holds',()=>{
  const fly=(phase,seconds)=>{
    const h=harness(phase);
    h.state.environment=createEnvironment({preset:'moderate',seed:11,windFromDeg:90});
    Object.assign(h.state.drone,{x:0,y:3.5,z:0,vz:0,thrustNewtons:11.3,motors:[2.82,2.82,2.82,2.82]});
    for(let i=0;i<seconds*120;i++)h.step(flightModel.fixedStep,neutral);
    return h.state.drone;
  };
  const gnss=fly('takeoff',30),attitude=fly('abnormal',20);
  assert.ok(Math.hypot(gnss.x,gnss.z)<1.2);
  assert.ok(Math.hypot(gnss.roll,gnss.pitch)>2*Math.PI/180);
  assert.ok(attitude.x<-15);
  assert.ok(Math.abs(gnss.y-3.5)<.4 && Math.abs(attitude.y-3.5)<.4);
});
test('GNSS hover wanders with sensor error instead of freezing, and latches its position',()=>{
  const h=harness('takeoff');Object.assign(h.state.drone,{x:0,y:3.5,z:0,vz:0,thrustNewtons:11.3,motors:[2.82,2.82,2.82,2.82]});
  let travelled=0,last=0;
  for(let i=0;i<120*60;i++){h.step(flightModel.fixedStep,neutral);travelled+=Math.abs(h.state.drone.x-last);last=h.state.drone.x;}
  assert.ok(travelled>.05);assert.ok(Math.hypot(h.state.drone.x,h.state.drone.z)<1);
  h.state.flightController.positionHold=null;
  h.step(flightModel.fixedStep,neutral);assert.ok(h.state.flightController.positionHold);
});
test('sticks pushed diagonally cannot exceed the total tilt limit',()=>{
  const h=harness('abnormal');Object.assign(h.state.drone,{y:30,vz:0,thrustNewtons:11.3,motors:[2.82,2.82,2.82,2.82]});
  let peak=0;
  for(let i=0;i<120*2;i++){h.step(flightModel.fixedStep,{...neutral,forward:1,strafe:1});peak=Math.max(peak,Math.hypot(h.state.drone.pitch,h.state.drone.roll));}
  assert.ok(peak<=flightModel.maxTilt*flightModel.attitudeModeTiltRatio*1.08);
});
test('motors lag requests and a parked aircraft is not moved by wind or sticks',()=>{
  const h=harness('takeoff');
  h.state.environment=createEnvironment({preset:'limit',seed:3,windFromDeg:0});
  Object.assign(h.state.drone,{x:0,y:0,z:0,vz:0,thrustNewtons:0,motors:[0,0,0,0]});
  for(let i=0;i<120*5;i++)h.step(flightModel.fixedStep,{...neutral,forward:1});
  assert.deepEqual([h.state.drone.x,h.state.drone.z,h.state.drone.y],[0,0,0]);
  assert.equal(h.state.drone.pitch,0);
  const air=harness('takeoff');Object.assign(air.state.drone,{y:3.5,vz:0,thrustNewtons:0,motors:[0,0,0,0]});
  air.step(flightModel.fixedStep,neutral);
  assert.ok(air.state.drone.thrustNewtons>0 && air.state.drone.thrustNewtons<flightModel.massKg*flightModel.gravity/2);
});
test('climbing hard while rolling sheds thrust before attitude authority',()=>{
  const h=harness('abnormal');Object.assign(h.state.drone,{y:30,vz:0,thrustNewtons:11.3,motors:[2.82,2.82,2.82,2.82]});
  const free=harness('abnormal');Object.assign(free.state.drone,{y:30,vz:0,thrustNewtons:11.3,motors:[2.82,2.82,2.82,2.82]});
  for(let i=0;i<120;i++){h.step(flightModel.fixedStep,{...neutral,throttle:1,strafe:1});free.step(flightModel.fixedStep,{...neutral,strafe:1});}
  assert.ok(Math.abs(h.state.drone.roll)>.9*Math.abs(free.state.drone.roll));
  assert.ok(h.state.drone.motors.every(thrust=>thrust<=flightModel.maxThrustNewtons/4+1e-9));
});
test('battery drains from electrical power, and a fast descent bounces on landing',()=>{
  const h=harness('takeoff');Object.assign(h.state.drone,{y:3.5,vz:0,thrustNewtons:11.3,motors:[2.82,2.82,2.82,2.82]});h.state.batteryPct=100;
  for(let i=0;i<120*60;i++)h.step(flightModel.fixedStep,neutral);
  assert.ok(h.state.batteryPct<97 && h.state.batteryPct>94);
  const hit=harness('eightLanding');Object.assign(hit.state.drone,{y:.01,vy:-2,vz:0});hit.state.hasTakenOff=true;
  hit.step(flightModel.fixedStep,neutral);hit.step(flightModel.fixedStep,neutral);
  assert.equal(hit.state.touchdowns.length,1);assert.ok(hit.state.drone.vy>0);
});
