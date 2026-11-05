import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEnvironment,stepEnvironment,windBearingLabel,windPresets,windSpeedCap,windReferenceHeight} from '../src/flight-environment.js';
import {motorAudioParameters} from '../src/motor-audio.js';
test('calm air has no wind; wind blows away from its reported bearing',()=>{
  const calm=createEnvironment({preset:'calm',seed:4});
  for(let i=0;i<1200;i++)assert.equal(stepEnvironment(calm,1/120,3.5).speed,0);
  const env=createEnvironment({preset:'moderate',seed:4,windFromDeg:90});
  let sumX=0,sumZ=0;const samples=120*120;
  for(let i=0;i<samples;i++){const w=stepEnvironment(env,1/120,windReferenceHeight);sumX+=w.x;sumZ+=w.z;}
  assert.ok(sumX/samples<-2.2);assert.ok(Math.abs(sumZ/samples)<1.2);
});
test('wind varies, stays below the test limit, and weakens near the ground',()=>{
  const env=createEnvironment({preset:'limit',seed:9});
  let low=99,high=0;
  for(let i=0;i<120*300;i++){const {speed}=stepEnvironment(env,1/120,windReferenceHeight);low=Math.min(low,speed);high=Math.max(high,speed);}
  assert.ok(high<=windSpeedCap);assert.ok(high-low>1);
  const mean=height=>{const e=createEnvironment({preset:'moderate',seed:2,windFromDeg:0});let sum=0;for(let i=0;i<7200;i++)sum+=stepEnvironment(e,1/120,height).speed;return sum/7200;};
  assert.ok(mean(.3)<mean(3.5)*.75);
});
test('environment is deterministic plain data that survives cloning',()=>{
  const a=createEnvironment({preset:'light',seed:12}),b=createEnvironment({preset:'light',seed:12}),c=createEnvironment({preset:'light',seed:13});
  for(let i=0;i<500;i++){stepEnvironment(a,.01,2);stepEnvironment(b,.01,2);stepEnvironment(c,.01,2);}
  assert.deepEqual(a,b);assert.notDeepEqual(a,c);assert.deepEqual(structuredClone(a),a);
  assert.throws(()=>createEnvironment({preset:'hurricane'}));
});
test('stating a logged bearing replays the same flight as the seed alone',()=>{
  const original=createEnvironment({preset:'moderate',seed:1}),replay=createEnvironment({preset:'moderate',seed:1,windFromDeg:original.windFromDeg});
  assert.deepEqual(replay,original);
});
test('wind presets and bearing labels read from the pilot position',()=>{
  assert.deepEqual(Object.keys(windPresets),['calm','light','moderate','limit']);
  assert.equal(windBearingLabel(0),'前方');assert.equal(windBearingLabel(90),'右');assert.equal(windBearingLabel(-90),'左');assert.equal(windBearingLabel(359),'前方');
});
test('rotor sound rises with thrust and fades with distance',()=>{
  const near=motorAudioParameters([2,2,2,2],5.6,{distance:8.5}),hard=motorAudioParameters([4,4,4,4],5.6,{distance:8.5}),far=motorAudioParameters([2,2,2,2],5.6,{distance:20});
  assert.ok(hard.frequencies[0]>near.frequencies[0]);assert.ok(far.gain<near.gain);
  assert.equal(motorAudioParameters([0,0,0,0],5.6).gain,0);
  assert.ok(motorAudioParameters([2,2,2,2],5.6,{distance:8,lateral:4}).pan>0);
});
