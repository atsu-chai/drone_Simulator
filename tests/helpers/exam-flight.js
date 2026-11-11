// Integration harness: the exam reducer reads the same physical state as the app.
import {createExam,reduceExam,tickExam,isExamFlight} from '../../src/exam-flow.js';
import {practicalPhase,practicalTarget,practicalAltitude,expectedCall} from '../../src/exam-practical.js';
import {createFlightState,transitionFlightPhase} from '../../src/session-rules.js';
import {createFlightPhysics} from '../../src/flight-physics.js';
import {advanceFlightFrame} from '../../src/flight-frame.js';
import {createVerificationPilot} from './physical-flight.js';
export function createPhysicalExam({seed=7,preset='calm',fps=60,flightOnly=null}={}) {
  let exam=createExam({seed,flightOnly}),active=null;
  const state=createFlightState(flightOnly?`exam-${flightOnly}`:'exam',{preset,seed}),pilot=createVerificationPilot();
  const sync=()=>{
    state.running=isExamFlight(exam);
    if(!state.running)return;
    const phase=practicalPhase(exam.practical);
    if(active!==exam.stage){transitionFlightPhase(state,phase);state.touchdowns=[];state.hasTakenOff=false;state.groundTime=0;active=exam.stage;}
    state.phase=phase;state.squareIndex=Math.max(0,exam.practical.step-1);state.eightIndex=exam.practical.eightIndex;state.abnormalIndex=Math.min(3,Math.max(0,exam.practical.step-1));
  };
  const physics=createFlightPhysics({state,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),trainingNow:()=>state.simulationTime*1000,targetAltitude:()=>practicalAltitude(exam.practical),currentNavigationTarget:()=>practicalTarget(exam.practical),angleDifference:(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b))});
  const send=event=>{exam=reduceExam(exam,event);sync();};
  sync();
  return {state,get exam(){return exam;},send,
    advance(seconds){exam=tickExam(exam,seconds);sync();},
    fly(){
      const starting=exam.stage;let frames=0;
      while(exam.stage===starting&&isExamFlight(exam)&&frames<600*fps) {
        let p=exam.practical;
        if(p.mode==='issued'&&!p.calls[`${p.step}:${expectedCall(p)}`])send({type:'call',call:expectedCall(p)});
        if(p.mode==='arrival')send({type:'call',call:'arrived'});
        p=exam.practical;sync();
        const step=p.plan[p.step],target=practicalTarget(p),override={altitude:practicalAltitude(p)};
        if(step.kind!=='eight'||p.mode!=='issued')override.target=target;
        if(p.mode!=='issued')override.yaw=state.drone.yaw;
        else if(p.subject==='inspection')override.yaw=step.yaw??0;
        else if(p.subject==='square'&&step.kind==='move'){const from=p.plan[p.step-1].target;override.yaw=Math.atan2(target.x-from.x,target.z-from.z);}
        const input=pilot(state,override);
        advanceFlightFrame(state,1/fps,input,physics,(dt,stick)=>{
          if(!isExamFlight(exam))return;
          exam=tickExam(exam,dt,{drone:state.drone,input:stick,gust:state.environment.gust,time:state.simulationTime,simulationTime:state.simulationTime,touchdowns:state.touchdowns,groundTime:state.groundTime});sync();
        });frames++;
      }
      return exam.stage;
    }
  };
}
