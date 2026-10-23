import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPresentationNarrator} from '../src/presentation-narrator.js';
function setup() {
  const calls=[];
  return {calls,narrator:createPresentationNarrator({speak:text=>calls.push(text),stop:()=>calls.push('stop')})};
}
const active={enabled:true,paused:false,done:false,stepIndex:0,caption:'離陸します'};
test('paused seeking stays silent and resume reads the current instruction once',()=>{
  const {calls,narrator}=setup();narrator.update(active);narrator.update(active);
  narrator.update({...active,paused:true});
  narrator.update({...active,paused:true,stepIndex:3,caption:'Hへ戻ります'});
  assert.deepEqual(calls,['stop','離陸します','stop']);
  narrator.update({...active,stepIndex:3,caption:'Hへ戻ります'});
  narrator.update({...active,stepIndex:3,caption:'Hへ戻ります'});
  assert.deepEqual(calls,['stop','離陸します','stop','stop','Hへ戻ります']);
});
test('muting stops immediately and enabling reads the current instruction',()=>{
  const {calls,narrator}=setup();narrator.update(active);
  narrator.update({...active,enabled:false});narrator.update({...active,enabled:false});
  assert.deepEqual(calls,['stop','離陸します','stop']);
  narrator.update(active);assert.equal(calls.at(-1),'離陸します');
});
test('seek while playing replaces the instruction; reset allows a new demonstration at step zero',()=>{
  const {calls,narrator}=setup();narrator.update(active);
  narrator.update({...active,stepIndex:5,caption:'着陸します'});
  assert.deepEqual(calls,['stop','離陸します','stop','着陸します']);
  narrator.reset();narrator.update(active);assert.equal(calls.at(-1),'離陸します');
});
test('completed playback stays silent until replay starts',()=>{
  const {calls,narrator}=setup();narrator.update(active);
  narrator.update({...active,done:true});narrator.update({...active,done:true});
  assert.deepEqual(calls,['stop','離陸します','stop']);
  narrator.update(active);assert.equal(calls.at(-1),'離陸します');
});
