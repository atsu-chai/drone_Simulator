import {aircraftDimensions,aircraftContactEnvelope} from './aircraft-geometry.js';
import {layouts} from './course-layout.js';
export const coneDimensions=Object.freeze({height:.5,bodyHeight:.45,bodyBottom:.05,baseWidth:.5,baseHeight:.05,baseRadius:.21,tipRadius:.034});
export const safetyLimits=Object.freeze({dangerousSpeed:5,speedHold:.25,maximumAltitude:8});
export function touchesCone(position,marker) {
  const centerY=position.y+aircraftDimensions.centerHeight;
  const envelope=aircraftContactEnvelope(position.pitch,position.roll);
  if(centerY-envelope.halfHeight>coneDimensions.height || centerY+envelope.halfHeight<0)return false;
  const dx=position.x-marker.x,dz=position.z-marker.z;
  if(centerY-envelope.halfHeight<=coneDimensions.baseHeight) {
    const nearX=Math.max(0,Math.abs(dx)-coneDimensions.baseWidth/2),nearZ=Math.max(0,Math.abs(dz)-coneDimensions.baseWidth/2);
    if(Math.hypot(nearX,nearZ)<=envelope.radius)return true;
  }
  const low=Math.max(coneDimensions.bodyBottom,centerY-envelope.halfHeight);
  const radius=coneDimensions.baseRadius-(coneDimensions.baseRadius-coneDimensions.tipRadius)*Math.min(1,(low-coneDimensions.bodyBottom)/coneDimensions.bodyHeight);
  return Math.hypot(dx,dz)<=radius+envelope.radius;
}
export function evaluateFlightSafety(state,dt) {
  if(!state.running || state.paused || state.presentation || state.evaluation.fatal)return [];
  const d=state.drone,layout=layouts[state.courseId],events=[];
  const emit=(type,points=0,fatal=false,details={},key=type)=>{
    if(state.safetyIssues[key])return;
    state.safetyIssues[key]=true;
    const event={type,points,fatal,phase:state.phase,time:Number((state.simulationTime-state.startTime/1000).toFixed(3)),position:{x:d.x,y:d.y,z:d.z},input:{...state.rawInput},velocity:{x:d.vx,y:d.vy,z:d.vz},source:'training-safety',...details};
    state.evaluation.events.push(event);events.push(event);if(fatal)state.evaluation.fatal=true;
  };
  const cone=layout.markers.find(marker=>touchesCone(d,marker));
  if(cone)emit('cone-collision',0,true,{marker:cone.label});
  state.dangerousSpeedTime=Math.hypot(d.vx,d.vz)>=safetyLimits.dangerousSpeed?(state.dangerousSpeedTime||0)+dt:0;
  if(state.dangerousSpeedTime>=safetyLimits.speedHold)emit('dangerous-speed',0,true);
  if(d.y>safetyLimits.maximumAltitude)emit('lost-altitude-control',0,true);
  const landPhases=['squareLanding','eightLanding','landing','demoLanding'];
  while(state.processedTouchdowns<state.touchdowns.length) {
    const contact=state.touchdowns[state.processedTouchdowns++];
    if(!landPhases.includes(contact.phase))emit('unexpected-touchdown',0,true,{contact});
    else if(Math.hypot(contact.x-layout.takeoff.x,contact.z-layout.takeoff.z)>=.9)emit('landing-outside',0,true,{contact});
    if(contact.descentSpeed>=3)emit('hard-impact',0,true,{contact});
    else if(contact.descentSpeed>1.5)emit('hard-landing',18,false,{contact},`hard-landing:${state.processedTouchdowns}`);
    if(contact.horizontalSpeed>.9)emit('landing-slide',18,false,{contact},`landing-slide:${state.processedTouchdowns}`);
  }
  if(['emergencyTransit','emergencyArrival'].includes(state.phase)) {
    state.transitLowTime=d.y<layout.altitude-.75?(state.transitLowTime||0)+dt:0;
    if(state.transitLowTime>.5)emit('early-emergency-descent',5);
  }
  return events;
}
export const safetyMessages={
  'cone-collision':'コーンに接触しました。高度と周囲の余裕を確認してください。',
  'dangerous-speed':'危険な水平速度に達しました。小さい入力で早めに減速してください。',
  'lost-altitude-control':'高度が練習範囲を大きく超えました。上昇入力を小さくしてください。',
  'unexpected-touchdown':'飛行課題の途中で接地しました。高度を維持して経路を完了してください。',
  'landing-outside':'H以外へ着陸しました。H上空で停止してから降下してください。',
  'hard-impact':'強い接地衝撃を記録しました。接地直前は降下を緩めてください。',
  'hard-landing':'接地時の降下速度が大きくなりました。低高度では降下を緩めてください。',
  'landing-slide':'水平速度が残ったまま接地しました。H上空で停止してから降下してください。',
  'early-emergency-descent':'H上空へ着く前に高度を下げました。高度を維持して移動してから降下してください。',
};
