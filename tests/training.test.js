import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentDistance,routeDistance,createEvaluation,evaluateSample,normalizedAxis,calibrationValid,historyStore } from '../src/training.js';
test('segment checks the whole route and clamps beyond endpoints',()=>{
  assert.equal(segmentDistance({x:3,z:2},{x:0,z:0},{x:6,z:0}),2);
  assert.equal(routeDistance({x:6.5,z:4},'square',1),4);
  assert.equal(routeDistance({x:6.5,z:4},'square',2),0);
  assert.equal(routeDistance({x:0,z:0},'eight',0),0);
});
const sample=(e,time,x,z=1.5)=>evaluateSample(e,{phase:'square',index:1,time,position:{x,y:3.5,z}});
test('warning, timely return, reentry and no per-frame duplicate deductions',()=>{
  const e=createEvaluation();sample(e,0,2);sample(e,1,2,0);assert.equal(e.events.filter(e=>e.points).length,0);
  sample(e,2,2);for(let t=2;t<4;t+=.01) sample(e,t,2);
  assert.equal(e.events.filter(e=>e.type==='route-penalty').length,1);
  assert.equal(e.events.filter(e=>e.type==='route-warning').length,2);
});
test('grace boundary and fatal boundary are deterministic',()=>{
  const run=()=>{const e=createEvaluation();sample(e,0,2);sample(e,1.999,2);assert.equal(e.events.length,1);sample(e,2,2);sample(e,3,2,-2.51);return e;};
  assert.deepEqual(run(),run());assert.equal(run().fatal,true);
});
test('circle middle cannot be mistaken for its circular route',()=>assert.equal(routeDistance({x:-2.5,z:0},'eight',2),2.5));
test('calibration rejects off-center sticks and normalizes deadzone',()=>{
  assert.equal(calibrationValid([0,0,.3,0]),false);assert.equal(calibrationValid([0,0,0,0]),true);
  assert.equal(normalizedAxis(.1,.1),0);assert.equal(normalizedAxis(1,0),1);assert.equal(normalizedAxis(-1,0),-1);
});
test('history survives new store, bounds data and tolerates corrupt contents',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const first=historyStore(storage);for(let i=0;i<105;i++)first.append({id:i});assert.equal(historyStore(storage).read().length,100);assert.equal(first.read()[0].id,104);
  data.set('drone.history.v2','bad');assert.deepEqual(first.read(),[]);
});
