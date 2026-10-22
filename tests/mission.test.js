import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMission} from '../src/premium-mission.js';
import {layouts,courseIdFor,figureEightLap as lap,abnormalTargets} from '../src/course-layout.js';
import {course,createEvaluation,evaluateSample,squarePath} from '../src/training.js';
function harness(subject='full') {
  const squareTargets=squarePath;
  const figureEightTargets=[...lap,...lap];
  const state={running:true,paused:false,subject,phase:'takeoff',elapsed:0,simulationTime:0,startTime:0,taskStartTime:0,taskElapsed:0,hoverTimer:0,squareTimer:0,squareIndex:0,eightIndex:0,abnormalIndex:0,emergencyHoverTimer:0,landingDrift:0,taskTimes:{},evaluation:createEvaluation(),arc:{key:null,angle:null,travel:0},command:{},courseId:'square',drone:{x:0,z:2.5,y:0,vx:0,vy:0,vz:0}};
  const phaseMission={takeoff:'square',square:'square',squareLanding:'square',eightTakeoff:'eight',eight:'eight',eightLanding:'eight',abnormalTakeoff:'abnormal',abnormal:'abnormal',emergencyHover:'abnormal',emergencyTransit:'abnormal',landing:'abnormal'};
  const finishExam=()=>{state.running=false;state.phase='result';};
  const takeoffPoint={...layouts.square.takeoff},emergencyLandingPoint={...layouts.abnormal.takeoff};
  const setPhase=phase=>{
    if(phaseMission[phase]!==phaseMission[state.phase]) state.taskStartTime=state.simulationTime*1000;
    const id=courseIdFor(phase,subject);
    if(state.courseId!==id) {state.courseId=id;Object.assign(takeoffPoint,layouts[id].takeoff);if(state.drone.y<.1)Object.assign(state.drone,{x:takeoffPoint.x,z:takeoffPoint.z});}
    state.phase=phase;state.hoverTimer=0;
  };
  const deps={state,phaseMission,taskLimits:{square:480,eight:480,abnormal:360},trainingNow:()=>state.simulationTime*1000,recordTelemetry:()=>{},evaluateSample,finishExam,isLandedAt:p=>Math.hypot(state.drone.x-p.x,state.drone.z-p.z)<.9 && state.drone.y<.08,takeoffPoint,setPhase,squareTargets,figureEightTargets,figureEightLap:lap,course,angleDifference:(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b)),abnormalTargets,emergencyLandingPoint,ui:{examiner:{},start:{}},buildPostflightChecklist:finishExam};
  const mission=createMission(deps);
  const tick=(seconds=1/120)=>{state.simulationTime+=seconds;mission(seconds);};
  const move=(point,y)=>{const from={...state.drone},initialCourse=state.courseId;for(let i=1;i<=240;i++){state.drone.x=from.x+(point.x-from.x)*i/240;state.drone.z=from.z+(point.z-from.z)*i/240;state.drone.y=from.y+(y-from.y)*i/240;tick();if(state.courseId!==initialCourse)break;}};
  return {state,tick,move,deps};
}
test('ten ideal full runs traverse all missions and finish, not merely waypoint indices',()=>{
  for(let run=0;run<10;run++) {
    const h=harness();const {state,tick,move,deps}=h;
    move(deps.takeoffPoint,3.5);for(let i=0;i<610;i++)tick();assert.equal(state.phase,'square');
    for(const point of deps.squareTargets){move(point,3.5);for(let i=0;i<110;i++)tick();}
    assert.equal(state.phase,'squareLanding');move(deps.takeoffPoint,0);assert.equal(state.phase,'eightTakeoff');
    move({x:0,z:0},1.5);for(let i=0;i<610;i++)tick();assert.equal(state.phase,'eight');
    for(let lobe=0;lobe<4;lobe++) {
      const center=course.eightCenters[lobe%2];
      for(let i=1;i<=1200;i++){const angle=(lobe%2===0?0:Math.PI)+(lobe%2===0?1:-1)*i/1200*Math.PI*2;state.drone.x=center.x+Math.cos(angle)*2.5;state.drone.z=center.z+Math.sin(angle)*2.5;tick();}
    }
    assert.equal(state.phase,'eightLanding');move(deps.takeoffPoint,0);move(deps.takeoffPoint,3.5);for(let i=0;i<610;i++)tick();assert.equal(state.phase,'abnormal');
    for(const point of deps.abnormalTargets)move(point,3.5);
    for(let i=0;i<370;i++)tick();assert.equal(state.phase,'emergencyTransit');
    move(deps.emergencyLandingPoint,3.5);assert.equal(state.phase,'landing');
    move(deps.emergencyLandingPoint,0);assert.equal(state.phase,'result');assert.equal(state.evaluation.fatal,false);
  }
});
test('hover must be continuous, pause freezes progress, unfinished task times out',()=>{
  const {state,tick}=harness();state.drone.y=3.5;for(let i=0;i<480;i++)tick();assert.equal(state.phase,'takeoff');
  state.drone.y=2;tick();assert.equal(state.hoverTimer,0);state.paused=true;state.drone.y=3.5;tick();assert.equal(state.hoverTimer,0);
  state.paused=false;state.simulationTime=481;tick();assert.equal(state.phase,'result');assert.equal(state.timeLimitExceeded,'square');
});

test('emergency hover cannot finish after moving away; square dwell resets on departure',()=>{
  const h=harness();h.state.phase='emergencyHover';h.state.emergencyHoverPoint={x:0,z:0};Object.assign(h.state.drone,{x:2,z:0,y:3.5});for(let i=0;i<370;i++)h.tick();assert.equal(h.state.phase,'emergencyHover');assert.equal(h.state.emergencyHoverTimer,0);
  const k=harness();k.state.phase='square';k.state.squareIndex=1;Object.assign(k.state.drone,{x:6.5,z:0,y:3.5});for(let i=0;i<60;i++)k.tick();assert.ok(k.state.squareTimer>0);k.state.drone.x=5;k.tick();assert.equal(k.state.squareTimer,0);
});
