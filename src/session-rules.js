import {layouts,courseIdFor,squarePath,figureEightLap,abnormalTargets} from './course-layout.js';
import {createEvaluation} from './training.js';
export const phaseMission={preflight:'preflight',takeoff:'square',square:'square',squareLanding:'square',eightTakeoff:'eight',eight:'eight',eightLanding:'eight',abnormalTakeoff:'abnormal',abnormal:'abnormal',emergencyHover:'abnormal',emergencyTransit:'abnormal',emergencyArrival:'abnormal',landing:'abnormal',postflight:'postflight',demoLanding:'square',result:'result'};
export const taskLimits={square:480,eight:480,abnormal:360};
export const squareTargets=squarePath.map((p,i)=>({...p,key:`square${p.label}${i}`}));
export const figureEightTargets=[...figureEightLap,...figureEightLap];
export function createFlightState(subject='demo') {
  const courseId=courseIdFor('preflight',subject),home=layouts[courseId].takeoff;
  return {subject,courseId,phase:'preflight',running:false,paused:false,interrupted:false,evaluation:createEvaluation(),
    checklistIndex:0,postflightIndex:0,checklistMistakes:0,startTime:0,elapsed:0,hoverTimer:0,squareTimer:0,squareIndex:0,eightIndex:0,abnormalIndex:0,emergencyHoverTimer:0,emergencyHoverPoint:null,
    taskStartTime:0,taskElapsed:0,taskTimes:{},timeLimitExceeded:null,landingDrift:0,altitudeErrorSquared:0,altitudeSampleTime:0,headingErrorSquared:0,headingSampleTime:0,hardLandingSpeed:0,boundaryViolations:0,
    responseDelays:[],respondedPhase:null,lastPhaseChange:0,physicsAccumulator:0,simulationTime:0,batteryPct:100,flightRecords:[],lastLogSecond:-1,hasTakenOff:false,groundTime:0,touchdowns:[],processedTouchdowns:0,safetyIssues:{},arc:{key:null,angle:null,travel:0},
    arrivalTimer:0,transitLowTime:0,dangerousSpeedTime:0,coaching:{},completedSubjects:[],sessionCalibration:null,inputConfigurations:[],
    rawInput:{throttle:0,forward:0,strafe:0,yaw:0},command:{throttle:0,forward:0,strafe:0,yaw:0},
    drone:{x:home.x,z:home.z,y:0,vx:0,vz:0,vy:0,yaw:0,yawRate:0,roll:0,pitch:0,rollRate:0,pitchRate:0,thrustNewtons:0}};
}
export function transitionFlightPhase(state,phase) {
  const previous=phaseMission[state.phase],next=phaseMission[phase];
  if(previous!==next) {
    if(taskLimits[previous])state.taskTimes[previous]=state.taskElapsed;
    if(taskLimits[next]){state.taskStartTime=state.simulationTime*1000;state.taskElapsed=0;}
  }
  if(!['result','postflight'].includes(phase)) {
    const nextCourse=courseIdFor(phase,state.subject);
    if(state.courseId!==nextCourse) {
      if(state.drone.y>.001)throw new Error('コース変更は接地後に行ってください。');
      state.courseId=nextCourse;
      Object.assign(state.drone,{x:layouts[nextCourse].takeoff.x,z:layouts[nextCourse].takeoff.z,vx:0,vz:0,vy:0,yaw:0,roll:0,pitch:0,rollRate:0,pitchRate:0,yawRate:0,thrustNewtons:0});
      state.command={throttle:0,forward:0,strafe:0,yaw:0};state.hasTakenOff=false;state.groundTime=0;
    }
  }
  state.phase=phase;
  if(['takeoff','eightTakeoff','abnormalTakeoff'].includes(phase))state.hoverTimer=0;
  state.lastPhaseChange=state.simulationTime*1000;state.respondedPhase=null;
}
export function navigationTarget(state) {
  if(state.phase==='square')return squareTargets[state.squareIndex]||null;
  if(state.phase==='eight')return figureEightTargets[state.eightIndex]||null;
  if(state.phase==='abnormal')return abnormalTargets[state.abnormalIndex]||null;
  if(state.phase==='emergencyHover')return state.emergencyHoverPoint;
  if(['squareLanding','eightLanding','demoLanding','landing','emergencyTransit','emergencyArrival'].includes(state.phase))return layouts[state.courseId].takeoff;
  return null;
}
export function desiredAltitude(state) {
  if(['squareLanding','eightLanding','demoLanding','landing'].includes(state.phase))return 0;
  if(['preflight','postflight','result'].includes(state.phase))return state.drone.y;
  return layouts[state.courseId].altitude;
}
export function landedAt(state,point) {
  const d=state.drone;
  return state.hasTakenOff && state.groundTime>=.3 && d.y<=.001 && Math.hypot(d.x-point.x,d.z-point.z)<.9 && Math.hypot(d.vx,d.vz)<.55;
}
export function pauseFlight(state) {
  if(!state.running || state.paused)return false;
  state.paused=true;state.interrupted=true;state.physicsAccumulator=0;
  state.keys?.clear();
  state.command={throttle:0,forward:0,strafe:0,yaw:0};
  state.rawInput={throttle:0,forward:0,strafe:0,yaw:0};
  return true;
}
export function recordSessionInput(state,calibration,source='controller') {
  const previous=state.inputConfigurations.at(-1);
  if(previous?.source===source && JSON.stringify(previous.calibration)===JSON.stringify(calibration))return;
  const config=calibration?structuredClone(calibration):null;
  if(state.inputConfigurations.length===0)state.sessionCalibration=config;
  state.inputConfigurations.push({time:Number((state.simulationTime-state.startTime/1000).toFixed(3)),phase:state.phase,source,calibration:config});
}
