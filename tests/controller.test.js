import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createControllerInput,normalizedAxis,keyboardInput,inputCentered} from '../src/controller-input.js';
const pad=(axes=[0,0,0,0],extra={})=>({id:'Test standard pad',index:0,mapping:'standard',connected:true,axes,...extra});
function fixture(saved=null,options={}) {
  let stored=saved;
  const driver=createControllerInput({load:()=>stored,save:value=>{stored=value;},now:()=> '2026-10-23T00:00:00Z',...options});
  const h={driver,device:{},get stored(){return stored;},status:null,hold(axes,seconds=.7,extra={}){for(let t=0;t<seconds;t+=1/60)h.status=driver.update([pad(axes,{...h.device,...extra})],1/60);return h.status;}};
  h.hold([0,0,0,0],.1);return h;
}
function fullCheck(h) {
  assert.equal(h.driver.begin({full:true}),true);h.hold([0,0,0,0]);
  for(const axes of [[0,-1,0,0],[0,1,0,0],[-1,0,0,0],[1,0,0,0],[0,0,0,-1],[0,0,0,1],[0,0,-1,0],[0,0,1,0]]) {
    h.hold(axes,.2);assert.equal(h.status.canFly,false);h.hold([0,0,0,0]);
  }
  assert.equal(h.status.canFly,true);return h;
}
test('standard controller needs all eight isolated directions and a stable return to neutral',()=>{
  const h=fixture();assert.equal(h.status.canFly,false);h.driver.begin();h.hold([0,0,0,0]);
  assert.equal(h.status.stage,'direction');assert.equal(h.status.step,0);
  h.hold([0,-1,0,0],.05);assert.equal(h.status.preview.throttle,1);assert.equal(h.status.input.throttle,0);
  h.hold([0,0,0,0],.1);
  h.hold([0,1,0,0]);assert.equal(h.status.step,0);
  h.hold([1,-1,0,0]);assert.equal(h.status.step,0);
  fullCheck(h);assert.equal(h.stored.verified,true);assert.deepEqual(h.stored.min,[-1,-1,-1,-1]);
  assert.deepEqual(h.status.input,{throttle:0,yaw:0,forward:0,strafe:0});
});
test('Mode 2 maps each real axis direction without combining keyboard input',()=>{
  const h=fullCheck(fixture());
  const actions=[[[0,-1,0,0],'throttle',1],[[0,1,0,0],'throttle',-1],[[-1,0,0,0],'yaw',-1],[[1,0,0,0],'yaw',1],[[0,0,0,-1],'forward',1],[[0,0,0,1],'forward',-1],[[0,0,-1,0],'strafe',-1],[[0,0,1,0],'strafe',1]];
  for(const [axes,key,value] of actions) {
    const s=h.hold(axes,.05);assert.equal(s.input[key],value);assert.equal(Object.values(s.input).filter(v=>Math.abs(v)>0).length,1);assert.equal(s.centered,false);
  }
  assert.deepEqual(keyboardInput(new Set(['KeyE','KeyS','ArrowLeft'])),{throttle:1,yaw:-1,forward:-1,strafe:0});
});
test('disconnection invalidates commands and saved settings require explicit neutral confirmation',()=>{
  const h=fullCheck(fixture());h.hold([0,-1,0,0],.1);
  const off=h.driver.update([],1/60);assert.equal(off.canFly,false);assert.equal(off.calibration,null);assert.equal(inputCentered(off.input),true);
  h.hold([0,0,0,0],1);assert.equal(h.status.canFly,false);assert.equal(h.status.hasSaved,true);
  h.driver.begin();h.hold([0,-.8,0,0],1);assert.equal(h.status.canFly,false);
  h.hold([0,0,0,0]);assert.equal(h.status.canFly,true);
});
test('partial direction checks cannot become a saved trusted setup on interruption',()=>{
  const h=fixture();h.driver.begin();h.hold([0,0,0,0]);h.hold([0,-1,0,0],.2);
  h.driver.requireConfirmation();h.driver.begin();h.hold([0,0,0,0]);assert.equal(h.status.stage,'direction');assert.equal(h.status.canFly,false);assert.equal(h.stored,null);
});
test('corrupt, obsolete or different-device profiles cannot authorize flight',()=>{
  const good=fullCheck(fixture()).stored;
  for(const saved of [{...good,version:1},{...good,id:'Other pad'},{...good,axes:[0,0,NaN,0]},{...good,min:[0,0,0,0]}]) {
    const h=fixture(saved);h.driver.begin();h.hold([0,0,0,0]);assert.equal(h.status.canFly,false);assert.equal(h.status.stage,'direction');
  }
  const h=fixture(good);h.driver.begin();h.hold([.1,0,0,0]);assert.equal(h.status.canFly,false);assert.equal(h.status.hasSaved,false);
});
test('unsupported, disconnected and malformed controllers never propagate invalid input',()=>{
  const h=fullCheck(fixture());
  for(const device of [pad([0,0],{}),pad([0,NaN,0,0]),pad([0,Infinity,0,0]),pad([0,2,0,0]),pad([0,0,0,0],{mapping:''}),pad([0,0,0,0],{connected:false})]) {
    const s=h.driver.update([device],1/60);assert.equal(s.canFly,false);assert.equal(inputCentered(s.input),true);assert.equal(Object.values(s.preview).every(Number.isFinite),true);
  }
});
test('a second device does not steal controls; switching device invalidates readiness',()=>{
  const h=fullCheck(fixture()),second=pad([0,0,0,0],{id:'Second pad',index:1});
  const same=h.driver.update([second,pad()],1/60);assert.equal(same.id,'Test standard pad');assert.equal(same.canFly,true);
  const switched=h.driver.update([second],1/60);assert.equal(switched.changed,true);assert.equal(switched.canFly,false);
});
test('slow drift cannot satisfy the stable-center measurement',()=>{
  const h=fixture();h.driver.begin();
  for(let i=0;i<120;i++)h.status=h.driver.update([pad([Math.min(.19,i*.003),0,0,0])],1/60);
  // The last stable .19 can be measured, but cannot silently become flight-ready.
  assert.equal(h.status.canFly,false);assert.notEqual(h.status.stage,'ready');
  const moving=fixture();moving.driver.begin();
  for(let i=0;i<120;i++)moving.status=moving.driver.update([pad([.15*Math.sin(i*.05),0,0,0])],1/60);
  assert.equal(moving.status.stage,'center');
});
test('calibrated endpoints remain symmetric around an offset neutral and reject nonfinite values',()=>{
  assert.equal(normalizedAxis(-.9,.1,.08,-.9,.95),-1);assert.equal(normalizedAxis(.95,.1,.08,-.9,.95),1);
  assert.equal(normalizedAxis(.1,.1,.08,-.9,.95),0);
  assert.ok(Math.abs(normalizedAxis(-.4,.1,.08,-.9,.95)+normalizedAxis(.525,.1,.08,-.9,.95))<1e-10);
  assert.equal(normalizedAxis(NaN),0);assert.equal(normalizedAxis(1,NaN),0);assert.equal(normalizedAxis(1,0,1),0);
});

test('standard gamepad values drive the production physics through all three tasks',async()=>{
  const {createPhysicalSession,createVerificationPilot}=await import('./helpers/physical-flight.js');
  const h=fullCheck(fixture()),session=createPhysicalSession('full'),pilot=createVerificationPilot();
  const raw=value=>value===0?0:Math.sign(value)*(.08+.92*Math.abs(value));
  session.state.sessionCalibration=structuredClone(h.status.calibration);
  for(let frame=0;frame<60*900 && session.state.running;frame++) {
    const wanted=pilot(session.state);
    const axes=[wanted.yaw,-wanted.throttle,wanted.strafe,-wanted.forward].map(raw);
    const status=h.driver.update([pad(axes)],1/60);
    assert.equal(status.canFly,true);
    session.frame(1/60,status.input);
  }
  assert.equal(session.outcome,'completed');assert.equal(session.state.touchdowns.length,3);
  assert.deepEqual(session.state.completedSubjects,['square','eight','abnormal']);
  assert.equal(session.state.evaluation.events.some(e=>e.fatal||e.points>0),false);
  assert.equal(session.state.sessionCalibration.verified,true);
});
test('disconnect freezes physical position, clock and evaluation until checked neutral and explicit resume',async()=>{
  const {createPhysicalSession,createVerificationPilot}=await import('./helpers/physical-flight.js');
  const {pauseFlight}=await import('../src/session-rules.js');
  const h=fullCheck(fixture()),session=createPhysicalSession('square'),pilot=createVerificationPilot();
  for(let i=0;i<240;i++)session.frame(1/60,pilot(session.state));
  assert.ok(session.state.drone.y>1);
  const savedCalibration=structuredClone(h.status.calibration);session.state.sessionCalibration=savedCalibration;
  const disconnected=h.driver.update([],1/60);assert.equal(disconnected.canFly,false);
  session.state.keys=new Set(['KeyE']);pauseFlight(session.state);
  assert.equal(inputCentered(session.state.command),true);assert.equal(session.state.keys.size,0);
  const before=structuredClone({drone:session.state.drone,clock:session.state.simulationTime,events:session.state.evaluation.events});
  for(let i=0;i<120;i++)session.frame(1/60,{throttle:1,yaw:1,forward:1,strafe:1});
  assert.deepEqual({drone:session.state.drone,clock:session.state.simulationTime,events:session.state.evaluation.events},before);
  h.hold([0,0,0,0],1);assert.equal(h.status.canFly,false);h.driver.begin();h.hold([0,0,0,0]);assert.equal(h.status.centered,true);
  assert.equal(session.state.paused,true);assert.deepEqual(session.state.sessionCalibration,savedCalibration);
  session.state.paused=false;session.frame(1/60,h.status.input);assert.ok(session.state.simulationTime>before.clock);
});
test('failure to persist calibration does not imply it was saved',()=>{
  let fail=true;
  const h=fixture(null,{save:()=>{if(fail)throw Error('storage full');}});
  fullCheck(h);assert.equal(h.status.canFly,true);assert.equal(h.status.saveFailed,true);
  fail=false;fullCheck(h);assert.equal(h.status.saveFailed,false);
});
test('device and calibration changes are timestamped without overwriting the initial setup',async()=>{
  const {createFlightState,recordSessionInput,pauseFlight}=await import('../src/session-rules.js');
  const h=fullCheck(fixture()),state=createFlightState('full');state.running=true;state.phase='square';
  recordSessionInput(state,h.status.calibration);const first=structuredClone(state.sessionCalibration);
  state.simulationTime=20;pauseFlight(state);h.driver.update([],1/60);
  h.device={id:'Second standard pad',index:1};h.hold([0,0,0,0],.1);fullCheck(h);
  recordSessionInput(state,h.status.calibration);recordSessionInput(state,h.status.calibration);
  const exported=JSON.parse(JSON.stringify({calibration:state.sessionCalibration,inputConfigurations:state.inputConfigurations}));
  assert.deepEqual(exported.calibration,first);assert.equal(exported.inputConfigurations.length,2);
  assert.equal(exported.inputConfigurations[1].time,20);assert.equal(exported.inputConfigurations[1].calibration.id,'Second standard pad');
  assert.equal(exported.inputConfigurations[0].calibration.id,'Test standard pad');
});
test('endpoint peaks are retained while the user returns a stick to center',()=>{
  const h=fixture();h.driver.begin();h.hold([0,0,0,0]);
  h.hold([0,-.75,0,0],.2);assert.equal(h.status.stage,'return');
  h.hold([0,-1,0,0],.2);h.hold([0,0,0,0]);
  for(const axes of [[0,1,0,0],[-1,0,0,0],[1,0,0,0],[0,0,0,-1],[0,0,0,1],[0,0,-1,0],[0,0,1,0]]){h.hold(axes,.2);h.hold([0,0,0,0]);}
  assert.equal(h.status.canFly,true);assert.equal(h.status.calibration.min[1],-1);
});
