import {expectedHeading,eightCenters,abnormalTargets,layouts} from './course-layout.js';
// Explicit training thresholds; these events are not an official pass/fail score.
export const coachingLimits=Object.freeze({headingError:Math.PI/4,headingWarningTime:.6,headingErrorTime:1.5,reverseWarningTime:.8,reverseErrorTime:2,minimumSpeed:.25});
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function evaluateFlightCoaching(state,dt) {
  if(!state.running || state.paused || state.presentation || state.evaluation.fatal)return [];
  const {phase,drone:d}=state;
  if(!['square','eight','abnormal'].includes(phase))return [];
  const index=phase==='square'?state.squareIndex:phase==='eight'?state.eightIndex:state.abnormalIndex;
  const key=phase==='eight'?Math.floor(index/4):index;
  const segment=state.coaching[`${phase}:${key}`] ||= {wrongTime:0,wrongArc:0,reverseTime:0,emitted:{},angle:null};
  const heading=expectedHeading(phase,d,index,null);
  const error=angleDifference(d.yaw,heading),moving=Math.hypot(d.vx,d.vz)>coachingLimits.minimumSpeed;
  let travelHeading=heading,arcDelta=0;
  if(phase==='eight') {
    const center=eightCenters[Math.floor((index%8)/4)];
    const angle=Math.atan2(d.z-center.z,d.x-center.x);
    if(segment.angle!==null)arcDelta=Math.abs(angleDifference(angle,segment.angle));
    segment.angle=angle;
  } else if(phase==='abnormal') {
    const from=index===0?layouts.abnormal.takeoff:abnormalTargets[index-1],to=abnormalTargets[index];
    if(!to)return [];
    travelHeading=Math.atan2(to.x-from.x,to.z-from.z);
  }
  const wrong=moving && Math.abs(error)>coachingLimits.headingError;
  segment.wrongTime=wrong?segment.wrongTime+dt:0;
  segment.wrongArc=wrong?segment.wrongArc+arcDelta:0;
  const along=d.vx*Math.sin(travelHeading)+d.vz*Math.cos(travelHeading);
  segment.reverseTime=moving && along<-coachingLimits.minimumSpeed?segment.reverseTime+dt:0;
  const events=[];
  const emit=(type,points)=>{
    if(segment.emitted[type])return;
    segment.emitted[type]=true;
    const event={type,points,phase,index,time:Number((state.simulationTime-state.startTime/1000).toFixed(3)),position:{x:d.x,y:d.y,z:d.z},input:{...state.rawInput},velocity:{x:d.vx,y:d.vy,z:d.vz},yaw:d.yaw,expectedYaw:heading,headingError:error,source:'training-coaching'};
    state.evaluation.events.push(event);events.push(event);
  };
  if(segment.wrongTime>=coachingLimits.headingWarningTime)emit('heading-warning',0);
  // For an eight, a brief correction is distinct from a whole quarter-circle
  // flown with the wrong heading. Each circle gets at most one deduction.
  if(phase==='eight'?segment.wrongArc>=Math.PI/2:segment.wrongTime>=coachingLimits.headingErrorTime)emit('heading-error',5);
  if(segment.reverseTime>=coachingLimits.reverseWarningTime)emit('reverse-warning',0);
  if(segment.reverseTime>=coachingLimits.reverseErrorTime)emit('reverse-flight',5);
  return events;
}
export const coachingMessages={
  'heading-warning':'機首の向きが指定方向から離れています。向きを合わせてから移動してください。',
  'heading-error':'指定と異なる機首方向で飛行を続けました。向きを合わせてから小さく前進する練習をしてください。',
  'reverse-warning':'指定経路と逆方向に移動しています。一度減速し、次の通過点を確認してください。',
  'reverse-flight':'指定経路の逆方向へ飛行を続けました。次の通過点と進行方向を確認して再練習してください。',
};
