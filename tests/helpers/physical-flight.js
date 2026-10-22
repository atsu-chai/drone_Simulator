import {advanceFlightFrame} from '../../src/flight-frame.js';
import {createFlightState,transitionFlightPhase,navigationTarget,desiredAltitude,landedAt,phaseMission,taskLimits,squareTargets,figureEightTargets} from '../../src/session-rules.js';
import {layouts,figureEightLap,abnormalTargets,eightCenters,expectedHeading} from '../../src/course-layout.js';
import {createFlightPhysics,flightModel} from '../../src/flight-physics.js';
import {evaluateFlightSafety} from '../../src/flight-safety.js';
import {course,evaluateSample,subjects} from '../../src/training.js';
import {createMission} from '../../src/premium-mission.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function createPhysicalSession(subject='full') {
  const state=createFlightState(subject),home={...layouts[state.courseId].takeoff};
  const phases=[],samples=[];let outcome=null;
  const setPhase=phase=>{transitionFlightPhase(state,phase);Object.assign(home,layouts[state.courseId].takeoff);phases.push({phase,time:state.simulationTime,courseId:state.courseId});};
  const finishExam=()=>{outcome=state.evaluation.fatal?'failed':state.timeLimitExceeded?'timeout':'completed';state.running=false;setPhase('result');};
  const deps={state,phaseMission,taskLimits,trainingNow:()=>state.simulationTime*1000,recordTelemetry:()=>{},evaluateSample,finishExam,isLandedAt:point=>landedAt(state,point),takeoffPoint:home,setPhase,squareTargets,figureEightTargets,figureEightLap,course,angleDifference,abnormalTargets,emergencyLandingPoint:layouts.abnormal.takeoff,ui:{examiner:{},start:{}},buildPostflightChecklist:()=>{outcome='completed';}};
  const physics=createFlightPhysics({state,clamp,trainingNow:deps.trainingNow,targetAltitude:()=>desiredAltitude(state),currentNavigationTarget:()=>navigationTarget(state),angleDifference});
  const mission=createMission(deps);
  state.running=true;setPhase(subjects[subject].phase);
  const afterPhysics=(dt,input)=>{
    evaluateFlightSafety(state,dt);
    if(state.evaluation.fatal)finishExam();else mission(dt);
    if(Math.round(state.simulationTime*120)%12===0)samples.push({t:state.simulationTime,phase:state.phase,courseId:state.courseId,x:state.drone.x,y:state.drone.y,z:state.drone.z,yaw:state.drone.yaw,input:{...input},velocity:{x:state.drone.vx,y:state.drone.vy,z:state.drone.vz}});
  };
  return {state,phases,samples,get outcome(){return outcome;},
    step(input,dt=flightModel.fixedStep){if(state.running){physics(dt,input);afterPhysics(dt,input);}},
    frame(dt,input){advanceFlightFrame(state,dt,input,physics,(step,stick)=>{if(state.running)afterPhysics(step,stick);});}
  };
}
// Verification-only feedback controller. It writes normalized sticks; never aircraft coordinates.
export function createVerificationPilot() {
  let previousYaw=0;
  return state=>{
    const d=state.drone,layout=layouts[state.courseId];
    let target=navigationTarget(state)||layout.takeoff;
    const landing=['squareLanding','eightLanding','landing'].includes(state.phase);
    let desiredYaw=previousYaw;
    if(state.phase==='eight') {
      const lobe=Math.floor((state.eightIndex%8)/4),center=eightCenters[lobe],sign=lobe===0?1:-1;
      const angle=Math.atan2(d.z-center.z,d.x-center.x)+sign*.42;
      target={x:center.x+2.5*Math.cos(angle),z:center.z+2.5*Math.sin(angle)};
      desiredYaw=expectedHeading(state.phase,d,state.eightIndex,target);
    } else if(state.phase==='square') {
      if(Math.hypot(target.x-d.x,target.z-d.z)>.35)desiredYaw=expectedHeading(state.phase,d,0,target);
    } else desiredYaw=0;
    previousYaw=desiredYaw;
    let vx=(target.x-d.x)*1.4,vz=(target.z-d.z)*1.4;
    const maxSpeed=state.phase==='eight'?1.05:1.1;
    const speed=Math.hypot(vx,vz);if(speed>maxSpeed){vx*=maxSpeed/speed;vz*=maxSpeed/speed;}
    if(state.phase==='square' && Math.abs(angleDifference(d.yaw,desiredYaw))>.35){vx=0;vz=0;}
    const ax=(vx-d.vx)*2.4,az=(vz-d.vz)*2.4;
    const cos=Math.cos(d.yaw),sin=Math.sin(d.yaw);
    const rightA=ax*cos-az*sin,forwardA=ax*sin+az*cos;
    const rightV=d.vx*cos-d.vz*sin,forwardV=d.vx*sin+d.vz*cos;
    const hold=!['abnormalTakeoff','abnormal','emergencyHover','emergencyTransit','emergencyArrival','landing'].includes(state.phase);
    const limit=flightModel.maxTilt*(hold?1:.8);
    const forward=clamp((forwardA/9.81+(hold?forwardV*.035:0))/limit,-.6,.6);
    const strafe=clamp((rightA/9.81+(hold?rightV*.035:0))/limit,-.6,.6);
    let desiredVy=clamp((desiredAltitude(state)-d.y)*.9-d.vy*.35,-.65,.85);
    if(landing && d.y<.22)desiredVy=-.18;
    const throttle=desiredVy/(desiredVy>=0?flightModel.maxClimbRate:flightModel.maxDescentRate);
    return {forward,strafe,throttle,yaw:clamp(angleDifference(desiredYaw,d.yaw)*2.8/flightModel.maxYawRate,-.8,.8)};
  };
}
export function flyPhysicalCourse(subject='full',{fps=60,maxSeconds=900}={}) {
  const session=createPhysicalSession(subject),pilot=createVerificationPilot();
  let frames=0;
  while(session.state.running && frames<maxSeconds*fps) {
    session.frame(1/fps,pilot(session.state));frames++;
  }
  return {outcome:session.outcome||'stalled',duration:session.state.simulationTime,phases:session.phases,events:session.state.evaluation.events,samples:session.samples,final:{...session.state.drone},squareIndex:session.state.squareIndex,eightIndex:session.state.eightIndex,abnormalIndex:session.state.abnormalIndex,touchdowns:session.state.touchdowns,altitudeRms:Math.sqrt(session.state.altitudeErrorSquared/Math.max(.001,session.state.altitudeSampleTime)),headingRms:Math.sqrt(session.state.headingErrorSquared/Math.max(.001,session.state.headingSampleTime))};
}
