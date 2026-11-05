import {summarizeFlight} from '../../src/flight-results.js';
import {advanceFlightFrame} from '../../src/flight-frame.js';
import {evaluateFlightCoaching} from '../../src/flight-coaching.js';
import {createFlightState,transitionFlightPhase,navigationTarget,desiredAltitude,landedAt,phaseMission,taskLimits,squareTargets,figureEightTargets} from '../../src/session-rules.js';
import {layouts,figureEightLap,abnormalTargets,eightCenters,expectedHeading} from '../../src/course-layout.js';
import {createFlightPhysics,flightModel,usesPositionHold} from '../../src/flight-physics.js';
import {evaluateFlightSafety} from '../../src/flight-safety.js';
import {course,evaluateSample,subjects} from '../../src/training.js';
import {createMission} from '../../src/premium-mission.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function createPhysicalSession(subject='full',environment={}) {
  const state=createFlightState(subject,environment),home={...layouts[state.courseId].takeoff};
  const phases=[],samples=[];let outcome=null;
  const setPhase=phase=>{transitionFlightPhase(state,phase);Object.assign(home,layouts[state.courseId].takeoff);phases.push({phase,time:state.simulationTime,courseId:state.courseId});};
  const finishExam=()=>{outcome=state.evaluation.fatal?'failed':state.timeLimitExceeded?'timeout':'completed';state.running=false;setPhase('result');};
  const deps={state,phaseMission,taskLimits,trainingNow:()=>state.simulationTime*1000,recordTelemetry:()=>{},evaluateSample,finishExam,isLandedAt:point=>landedAt(state,point),takeoffPoint:home,setPhase,squareTargets,figureEightTargets,figureEightLap,course,angleDifference,abnormalTargets,emergencyLandingPoint:layouts.abnormal.takeoff,ui:{examiner:{},start:{}},buildPostflightChecklist:()=>{outcome='completed';}};
  const physics=createFlightPhysics({state,clamp,trainingNow:deps.trainingNow,targetAltitude:()=>desiredAltitude(state),currentNavigationTarget:()=>navigationTarget(state),angleDifference});
  const mission=createMission(deps);
  state.running=true;setPhase(subjects[subject].phase);
  const afterPhysics=(dt,input)=>{
    evaluateFlightSafety(state,dt);
    evaluateFlightCoaching(state,dt);
    if(state.evaluation.fatal)finishExam();else mission(dt);
    if(Math.round(state.simulationTime*120)%12===0)samples.push({t:state.simulationTime,phase:state.phase,courseId:state.courseId,x:state.drone.x,y:state.drone.y,z:state.drone.z,yaw:state.drone.yaw,input:{...input},velocity:{x:state.drone.vx,y:state.drone.vy,z:state.drone.vz}});
  };
  return {state,phases,samples,get outcome(){return outcome;},
    step(input,dt=flightModel.fixedStep){if(state.running){physics(dt,input);afterPhysics(dt,input);}},
    frame(dt,input){advanceFlightFrame(state,dt,input,physics,(step,stick)=>{if(state.running)afterPhysics(step,stick);});}
  };
}
// Verification-only feedback pilot. It writes normalized sticks, never aircraft coordinates,
// and like a person it must hold off wind itself once horizontal stabilisation is off.
export function createVerificationPilot() {
  let previousYaw=0,trimRight=0,trimForward=0,lastTime=0,lastMode=null;
  return (state,override={})=>{
    const d=state.drone,layout=layouts[state.courseId];
    const dt=Math.max(0,state.simulationTime-lastTime);lastTime=state.simulationTime;
    let target=navigationTarget(state)||layout.takeoff;
    const landing=['squareLanding','eightLanding','landing'].includes(state.phase);
    let desiredYaw=previousYaw;
    if(state.phase==='eight') {
      const lobe=Math.floor((state.eightIndex%8)/4),center=eightCenters[lobe],sign=lobe===0?1:-1;
      const angle=Math.atan2(d.z-center.z,d.x-center.x)+sign*.42;
      target={x:center.x+2.5*Math.cos(angle),z:center.z+2.5*Math.sin(angle)};
      desiredYaw=expectedHeading(state.phase,d,state.eightIndex,target);
    } else if(state.phase==='square') {
      desiredYaw=expectedHeading(state.phase,d,state.squareIndex,target);
    } else desiredYaw=0;
    if(override.target)target=override.target;
    if(override.yaw!==undefined)desiredYaw=override.yaw;
    previousYaw=desiredYaw;
    let vx=(target.x-d.x)*1.4,vz=(target.z-d.z)*1.4;
    const maxSpeed=state.phase==='eight'?1.05:1.1;
    const speed=Math.hypot(vx,vz);if(speed>maxSpeed){vx*=maxSpeed/speed;vz*=maxSpeed/speed;}
    if(state.phase==='square' && Math.abs(angleDifference(d.yaw,desiredYaw))>.35){vx=0;vz=0;}
    const cos=Math.cos(d.yaw),sin=Math.sin(d.yaw);
    const hold=usesPositionHold(state.phase);
    if(lastMode!==hold){trimRight=0;trimForward=0;lastMode=hold;}
    let forward,strafe;
    if(hold) {
      forward=(vx*sin+vz*cos)/flightModel.maxGroundSpeed;
      strafe=(vx*cos-vz*sin)/flightModel.maxGroundSpeed;
    } else {
      const ax=(vx-d.vx)*2.2,az=(vz-d.vz)*2.2;
      const limit=flightModel.maxTilt*flightModel.attitudeModeTiltRatio;
      const rightA=ax*cos-az*sin,forwardA=ax*sin+az*cos;
      const flying=d.y>.2?1:0;
      trimRight=clamp(trimRight+rightA*.6*dt*flying,-3,3);trimForward=clamp(trimForward+forwardA*.6*dt*flying,-3,3);
      forward=(forwardA+trimForward)/flightModel.gravity/limit;
      strafe=(rightA+trimRight)/flightModel.gravity/limit;
    }
    let desiredVy=clamp(((override.altitude??desiredAltitude(state))-d.y)*.9-d.vy*.35,-.65,.85);
    if(landing && d.y<.22)desiredVy=-.18;
    const throttle=desiredVy/(desiredVy>=0?flightModel.maxClimbRate:flightModel.maxDescentRate);
    return {forward:clamp(forward,-1,1),strafe:clamp(strafe,-1,1),throttle,yaw:clamp(angleDifference(desiredYaw,d.yaw)*2.8/flightModel.maxYawRate,-.8,.8)};
  };
}
export function flyPhysicalCourse(subject='full',{fps=60,maxSeconds=900,environment={}}={}) {
  const session=createPhysicalSession(subject,environment),pilot=createVerificationPilot();
  let frames=0;
  while(session.state.running && frames<maxSeconds*fps) {
    session.frame(1/fps,pilot(session.state));frames++;
  }
  return {result:summarizeFlight(session.state),outcome:session.outcome||'stalled',duration:session.state.simulationTime,phases:session.phases,events:session.state.evaluation.events,samples:session.samples,final:{...session.state.drone},squareIndex:session.state.squareIndex,eightIndex:session.state.eightIndex,abnormalIndex:session.state.abnormalIndex,touchdowns:session.state.touchdowns,altitudeRms:Math.sqrt(session.state.altitudeErrorSquared/Math.max(.001,session.state.altitudeSampleTime)),headingRms:Math.sqrt(session.state.headingErrorSquared/Math.max(.001,session.state.headingSampleTime))};
}
