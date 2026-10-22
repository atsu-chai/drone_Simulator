import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFlightPhysics,flightModel} from '../src/flight-physics.js';
function harness(phase='eight') {
  const state={paused:false,running:true,phase,simulationTime:0,command:{throttle:0,forward:0,strafe:0,yaw:0},respondedPhase:null,lastPhaseChange:0,responseDelays:[],drone:{x:0,y:1.5,z:-2.49,vx:0,vy:0,vz:-1,yaw:0,yawRate:0,roll:0,pitch:0,rollRate:0,pitchRate:0,thrustNewtons:11.3},batteryPct:100,altitudeErrorSquared:0,altitudeSampleTime:0,headingErrorSquared:0,headingSampleTime:0,hardLandingSpeed:0,eightIndex:2};
  const step=createFlightPhysics({state,clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),trainingNow:()=>state.simulationTime*1000,targetAltitude:()=>phase==='eight'?1.5:3.5,currentNavigationTarget:()=>null,angleDifference:(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b))});
  return {state,step};
}
const neutral={throttle:0,forward:0,strafe:0,yaw:0};
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
