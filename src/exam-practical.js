import {layouts,squarePath,abnormalTargets,eightCenters,figureEightLap,fieldZone,insideRectangle} from './course-layout.js';
import {segmentDistance} from './training.js';
import {touchesCone,safetyLimits} from './flight-safety.js';
import {examinerInstructions} from './exam-content.js';
const angle=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const speed=d=>Math.hypot(d.vx||0,d.vz||0);
export const practicalLimits=Object.freeze({square:480,eight:480,abnormal:360,inspection:720});
export function practicalPlan(subject,extraLegs=0,emergencyFraction=.5) {
  const id=subject==='inspection'?'square':subject,layout=layouts[id],h=layout.takeoff;
  const step=(kind,target,label,extra={})=>({kind,target:{...target},label,...extra});
  const plan=[step('takeoff',h,examinerInstructions.takeoff)];
  if(subject==='square')for(const target of [...squarePath,{...h,label:'H'}])plan.push(step('move',target,target.label==='H'?'左旋回で機首を着陸地点へ向け、着陸地点の上空まで前進してください。':`左旋回で機首を${target.label}地点へ向け、${target.label}地点まで前進してください。`));
  if(subject==='eight')plan.push(step('eight',h,examinerInstructions.eight));
  if(subject==='abnormal') {
    for(const target of [...abnormalTargets,...Array.from({length:extraLegs},(_,i)=>abnormalTargets[i%2?3:2])])plan.push(step('move',target,`機首は前方のまま${target.label}へ移動して停止してください。`));
    const last=plan.at(-1).target,next=last.x>0?abnormalTargets[2]:abnormalTargets[3];
    plan.push(step('move',next,`引き続き機首を前方のまま${next.label}へ側方移動してください。`,{emergencyFraction}));
    plan.push(step('emergency',h,examinerInstructions.emergency),step('transit',h,examinerInstructions.transit));
  }
  if(subject==='inspection') {
    plan.push(step('move',{x:h.x,z:h.z+1},'前進して停止してください。'),step('move',h,'後退して停止してください。'));
    plan.push(step('yaw',h,'左旋回を確認してください。',{yaw:-Math.PI/4}),step('yaw',h,'右旋回を確認してください。',{yaw:0}));
    plan.push(step('vertical',h,'上昇を確認してください。',{altitude:4}),step('vertical',h,'下降を確認してください。',{altitude:3.5}));
  }
  plan.push(step('land',h,examinerInstructions.land));return plan;
}
export function createPractical(subject,{extraLegs=0,emergencyFraction=.5}={}) {
  const id=subject==='inspection'?'square':subject;
  return {subject,courseId:id,plan:practicalPlan(subject,extraLegs,emergencyFraction),step:0,mode:'issued',wait:0,elapsed:0,started:0,hold:0,events:[],issues:{},segments:{},calls:{},previous:null,anchor:{...layouts[id].takeoff},eightIndex:0,arc:0,arcAngle:null,lobeDistance:0,flight:null,done:false,fatal:false,touchdownCount:0,speedTime:0,badHeading:0,badAltitude:0,warning:null};
}
export function practicalInstruction(p) {return p.mode==='wait'?examinerInstructions.wait:p.mode==='arrival'?'到達を確認しました。試験員へ呼称してください。':p.plan[p.step]?.label||'飛行終了';}
export function expectedCall(p) {if(p.mode==='arrival')return 'arrived';if(p.mode!=='issued')return 'move';const k=p.plan[p.step]?.kind;return k==='takeoff'?'takeoff':k==='land'?'land':k==='emergency'?'emergency':'move';}
export function practicalTarget(p) {
  if(p.mode!=='issued')return p.anchor;
  if(p.plan[p.step]?.kind==='eight')return figureEightLap[p.eightIndex%8];
  return p.plan[p.step]?.target;
}
export function practicalAltitude(p) {const s=p.plan[p.step];return s?.kind==='land'?0:s?.altitude??layouts[p.courseId].altitude;}
export function practicalPhase(p) {
  const kind=p.plan[p.step]?.kind;
  if(kind==='transit'&&p.landingOverhead)return {circle:true,failure:false,penalty:false};
  if(kind==='land')return p.subject==='abnormal'?'landing':p.subject==='eight'?'eightLanding':'squareLanding';
  if(kind==='takeoff')return p.subject==='abnormal'?'abnormalTakeoff':p.subject==='eight'?'eightTakeoff':'takeoff';
  if(kind==='emergency')return 'emergencyHover';if(kind==='transit')return 'emergencyTransit';
  return p.courseId==='abnormal'?'abnormal':p.courseId==='eight'?'eight':'square';
}
function emit(p,code,detail,key=code) {
  const scoped=`${p.step}:${key}`;if(p.issues[scoped])return;
  p.issues[scoped]=true;p.events.push({code,detail,subject:p.subject,step:p.step,time:p.elapsed});if(code==='fatal')p.fatal=true;
}
export function respondPractical(previous,call) {
  const p=structuredClone(previous);if(p.done||p.fatal)return p;
  if(call!==expectedCall(p)) {p.callNote='今の場面に合う呼称を選び直してください。';return p;}
  p.callNote=null;p.calls[`${p.step}:${call}`]=true;
  if(p.mode==='arrival') {p.mode='wait';p.wait=0;p.hold=0;}
  return p;
}
// Returns the official phase applicability; the central square exclusion is exempt on both H–A legs.
export function practicalZones(p,d) {
  const step=p.plan[p.step],kind=step?.kind;
  if(kind==='takeoff')return {circle:true,failure:false,penalty:false};
  if(kind==='transit'&&p.landingOverhead)return {circle:true,failure:false,penalty:false};
  if(kind==='land')return {circle:true,failure:false,penalty:false};
  const from=p.step===0?layouts[p.courseId].takeoff:p.plan[p.step-1].target;
  const approach=p.subject==='square'&&kind==='move'&&(p.step===1||step.target.label==='H');
  const leavingH=p.courseId==='abnormal'&&p.step===1&&segmentDistance(d,from,step.target)<1;
  return {circle:false,failure:!leavingH,penalty:kind!=='transit'&&!leavingH,approach};
}
function routeCheck(p,d,dt) {
  const s=p.plan[p.step],layout=layouts[p.courseId],rules=practicalZones(p,d);
  let zone=fieldZone(d,p.courseId);
  if(rules.approach&&insideRectangle(d,layout.penaltyWidth,layout.penaltyDepth,layout.centerZ))zone='safe';
  if(rules.failure&&zone==='failure')emit(p,'fatal','不合格区画への進入');
  // No corridor deduction after the emergency landing instruction. Circle only on final descent.
  const circleActive=rules.circle&&(s.kind!=='takeoff'||p.hold>0||p.mode!=='issued');
  // The 2 s return allowance (note 1) covers penalty areas only, not the 2 m circle.
  if(circleActive&&distance(d,layout.takeoff)>=1)emit(p,'route','ホバリング・着陸時の直径2mの円からの逸脱','circle');
  const outside=rules.penalty&&zone==='penalty';
  const seg=p.segments[p.step] ||= {inside:true,entries:0,since:0,penalized:false};
  if(outside) {
    if(seg.inside){seg.inside=false;seg.entries++;seg.since=p.elapsed;seg.penalized=false;p.warning='区画を外れました。経路へ復帰してください。';}
    if(!seg.penalized&&(seg.entries>1||p.elapsed-seg.since>2)) {emit(p,'route','減点区画への進入',`route:${seg.entries}`);seg.penalized=true;}
  } else {seg.inside=true;p.warning=null;}
  if(!['takeoff','land'].includes(s.kind)) {
    p.badAltitude=Math.abs(d.y-layout.altitude)>.85?p.badAltitude+dt:0;
    if(p.badAltitude>2)emit(p,'instruction','指示高度と異なる高度を継続');
  }
}
function expectedYaw(p,d) {
  const s=p.plan[p.step];if(s.yaw!==undefined)return s.yaw;
  if(p.subject==='inspection'||p.courseId==='abnormal')return 0;
  if(s.kind==='eight') {const lobe=Math.floor((p.eightIndex%8)/4),c=eightCenters[lobe],sign=lobe===0?1:-1;return Math.atan2(-sign*(d.z-c.z),sign*(d.x-c.x));}
  const from=p.plan[p.step-1]?.target||layouts[p.courseId].takeoff;
  return Math.atan2(s.target.x-from.x,s.target.z-from.z);
}
export function tickPractical(previous,sample,dt) {
  if(previous.done||previous.fatal||dt<=0)return previous;
  const p={...previous,events:[...previous.events],issues:{...previous.issues},segments:structuredClone(previous.segments)},d=sample.drone,s=p.plan[p.step];
  p.elapsed+=dt;const input=sample.input||{},prior=p.previous;
  p.previous={x:d.x,y:d.y,z:d.z,yaw:d.yaw,vx:d.vx||0,vz:d.vz||0};
  const moved=prior&&(distance(d,prior)>.0005||Math.abs(d.y-prior.y)>.0005||Math.abs(angle(d.yaw,prior.yaw))>.0005);
  const inputActive=Math.max(...['forward','strafe','throttle','yaw'].map(k=>Math.abs(input[k]||0)))>.12;
  if(p.mode!=='issued'&&prior) {
    const intentional=p.courseId==='abnormal'?Math.abs(input.yaw||0)>.12&&Math.abs(angle(d.yaw,prior.yaw))/dt>.08:inputActive&&moved;
    if(intentional)emit(p,'instruction','次の指示前の操縦による移動・姿勢変化','premature');
  }
  if(p.elapsed>practicalLimits[p.subject])emit(p,'fatal','制限時間超過');
  if(layouts[p.courseId].markers.some(marker=>touchesCone(d,marker)))emit(p,'fatal','コーンとの接触');
  p.speedTime=speed(d)>=safetyLimits.dangerousSpeed?p.speedTime+dt:0;
  if(p.speedTime>=safetyLimits.speedHold)emit(p,'fatal','危険な速度');
  if(d.y>safetyLimits.maximumAltitude||!['x','y','z','yaw','vx','vz','vy'].every(k=>Number.isFinite(d[k])))emit(p,'fatal','制御不能');
  const contacts=sample.touchdowns||[];
  for(const c of contacts.slice(p.touchdownCount)) {
    if(s.kind!=='land'||c.descentSpeed>=3)emit(p,'fatal','墜落・課題途中の接地');
    else {
      if(!p.calls[`${p.step}:land`])emit(p,'safety-call','着陸前の安全確認呼称なし');
      if(c.descentSpeed>1.5)emit(p,'landing','強い接地');
      if(c.horizontalSpeed>.9&&!sample.gust)emit(p,'wobble','接地時の滑り');
    }
  }
  p.touchdownCount=contacts.length;
  if(s.kind==='takeoff'&&(input.throttle>.12||d.y>.02)&&!p.calls[`${p.step}:takeoff`])emit(p,p.subject==='inspection'?'fatal':'safety-call','推進系統作動前の安全確認呼称なし');
  if(s.kind==='takeoff'&&d.y>0&&!p.flight) {
    p.flight={tookOff:sample.time,landed:null};
  }
  if(s.kind==='land'&&input.throttle<-.12&&d.y>0&&!p.calls[`${p.step}:land`])emit(p,'safety-call','着陸前の安全確認呼称なし');
  if(s.kind==='transit'&&distance(d,layouts[p.courseId].takeoff)<.9)p.landingOverhead=true;
  routeCheck(p,d,dt);
  if(p.mode==='wait') {
    p.wait+=dt;
    if(p.wait>=1.5) {
      p.step++;p.mode='issued';p.hold=0;p.badHeading=0;p.badAltitude=0;
      if(!p.plan[p.step]){p.done=true;return p;}
      if(p.plan[p.step].kind==='emergency') {p.anchor={x:d.x,z:d.z};p.plan=p.plan.map((step,i)=>i===p.step?{...step,target:{...p.anchor}}:step);}
    }
    return p;
  }

  if(p.mode!=='issued'||p.fatal)return p;
  if(speed(d)>.3&&['move','eight','transit'].includes(s.kind)) {
    const error=Math.abs(angle(expectedYaw(p,d),d.yaw));p.badHeading=error>.65?p.badHeading+dt:0;
    if(p.badHeading>.6)emit(p,'heading','一時的な機首違い',`heading:${s.kind==='eight'?p.eightIndex:0}`);
    if(s.kind==='eight') {
      const c=eightCenters[Math.floor((p.eightIndex%8)/4)];
      const travel=prior?Math.abs(angle(Math.atan2(d.z-c.z,d.x-c.x),Math.atan2(prior.z-c.z,prior.x-c.x))):0;
      p.badHeadingArc=error>.65?(p.badHeadingArc||0)+travel:0;
      if(p.badHeadingArc>=Math.PI/2){emit(p,'instruction','四分円にわたり機首方向が不一致',`heading-major:${p.eightIndex}`);p.badHeadingArc=0;}
    } else if(p.badHeading>2)emit(p,'instruction','機首方向の不一致を継続','heading-major');
  }
  if(prior&&!sample.gust&&d.y>.5) {
    const acceleration=Math.hypot((d.vx-prior.vx)/dt,(d.vz-prior.vz)/dt);
    if(acceleration>4)emit(p,'smoothness','急加減速');
    if(Math.abs(d.roll||0)>.32&&Math.abs(d.rollRate||0)>1.2)emit(p,'wobble','大きなふらつき');
  }
  if(s.emergencyFraction&&distance(d,p.plan[p.step-1].target)>=distance(p.plan[p.step-1].target,s.target)*s.emergencyFraction) {
    p.step++;p.mode='issued';p.hold=0;p.anchor={x:d.x,z:d.z};p.plan=p.plan.map((step,i)=>i===p.step?{...step,target:{...p.anchor}}:step);return p;
  }
  if(s.kind==='transit') {p.badPath=segmentDistance(d,p.anchor,layouts[p.courseId].takeoff)>1.5?(p.badPath||0)+dt:0;if(p.badPath>2)emit(p,'instruction','緊急着陸の最短経路から逸脱');}
  if(s.kind==='eight') {
    const lobe=Math.floor((p.eightIndex%8)/4),center=eightCenters[lobe],sign=lobe===0?1:-1;
    const a=Math.atan2(d.z-center.z,d.x-center.x);
    if(p.arcAngle!==null)p.arc+=sign*angle(a,p.arcAngle);p.arcAngle=a;
    if(p.arc<-.4)emit(p,'instruction','指示と逆向きの周回',`direction:${Math.floor(p.eightIndex/4)}`);
    if(prior)p.lobeDistance+=distance(d,prior);
    const quarter=p.eightIndex%4+1;
    if(p.arc>=quarter*Math.PI/2-.015) {
      p.eightIndex++;
      if(p.eightIndex%4===0) {p.arc=0;p.arcAngle=null;p.lobeDistance=0;}
    }
    // A closed excursion returning to the crossing without winding around the required centre.
    if(p.lobeDistance>3&&distance(d,layouts.eight.takeoff)<.35&&p.arc<5.7)emit(p,'fatal','8の字の中心を含まない周回');
    if(p.eightIndex>=16) {p.mode='arrival';p.anchor={...layouts.eight.takeoff};}
    return p;
  }
  const altitude=s.kind==='land'?0:s.altitude??layouts[p.courseId].altitude;
  const reached=distance(d,s.target)<.65&&Math.abs(d.y-altitude)<.25&&speed(d)<.45&&Math.abs(d.vy||0)<.4&&(s.yaw===undefined||Math.abs(angle(d.yaw,s.yaw))<.15);
  p.hold=reached?p.hold+dt:0;
  if(s.kind==='land'&&p.flight&&d.y<=.001&&sample.groundTime>=.3) {
    const contact=contacts.at(-1);
    p.flight={...p.flight,landed:contact&&sample.simulationTime!==undefined?sample.time-(sample.simulationTime-contact.time):contact?.time??sample.time};p.done=true;return p;
  }
  if(s.kind!=='land'&&p.hold>=(s.kind==='takeoff'?5:s.kind==='emergency'?2:.35)) {p.mode='arrival';p.anchor={x:d.x,z:d.z};}
  return p;
}
