import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layouts,fieldZone,courseIdFor} from '../src/course-layout.js';
import {createDemonstration} from '../src/demonstration.js';
test('H is separate from square A; eight starts at the intersection and pilot is 6.5m from near arc',()=>{
  assert.deepEqual(layouts.square.takeoff,{x:0,z:2.5});assert.deepEqual(layouts.square.route[0],{label:'A',x:0,z:0});
  assert.deepEqual(layouts.eight.takeoff,{x:0,z:0});assert.equal(-2.5-layouts.eight.pilot.z,6.5);
  assert.equal(layouts.abnormal.route[1].x-layouts.abnormal.route[0].x,13);
  assert.equal(courseIdFor('emergencyTransit'),'abnormal');
});
test('whole course failure zone differs from active leg; inner exclusions are penalties',()=>{
  assert.equal(fieldZone({x:0,z:2.6},'square'),'penalty');
  assert.equal(fieldZone({x:9.01,z:0},'square'),'failure');
  assert.equal(fieldZone({x:8.5,z:0},'square'),'penalty');
  assert.equal(fieldZone({x:-2.5,z:0},'eight'),'penalty');
});
test('all narrated demonstrations finish at H and preserve emergency transit altitude',()=>{
  for(const id of ['square','eight','abnormal','full']) {
    const player=createDemonstration(id);assert.ok(player.duration>30);assert.equal(player.sample(0).y,0);
    const last=player.sample(player.duration);assert.equal(last.done,true);assert.equal(last.y,0);assert.deepEqual({x:last.x,z:last.z},layouts[last.courseId].takeoff);
    let previous=null;
    for(let time=0;time<player.duration;time+=1/60) {
      const sample=player.sample(time);assert.ok(Number.isFinite(sample.yaw));
      if(sample.phase==='emergencyTransit')assert.equal(sample.y,3.5);
      if(previous && previous.courseId===sample.courseId) assert.ok(Math.hypot(sample.x-previous.x,sample.y-previous.y,sample.z-previous.z)<.1);
      previous=sample;
    }
  }
});
test('eight demonstration performs two full figure eights, following tangent headings',()=>{
  const player=createDemonstration('eight'),arcs=player.steps.filter(step=>step.arc);
  assert.equal(arcs.length,4);
  for(const step of arcs) {const sample=player.sample((step.start+step.end)/2);const center=step.arc.center;assert.ok(Math.abs(Math.hypot(sample.x-center.x,sample.z-center.z)-2.5)<1e-9);assert.equal(sample.y,1.5);}
});
test('ideal arc heading is tangent and emergency return retains forward heading',async()=>{
  const {expectedHeading}=await import('../src/course-layout.js');
  for(const [point,index,yaw] of [[{x:0,z:0},0,0],[{x:-2.5,z:2.5},1,-Math.PI/2],[{x:0,z:0},4,0]]) {
    const actual=expectedHeading('eight',point,index,{x:0,z:0});assert.ok(Math.abs(Math.atan2(Math.sin(actual-yaw),Math.cos(actual-yaw)))<1e-8);
  }
  assert.equal(expectedHeading('emergencyTransit',{x:6,z:0},0,{x:0,z:2.5}),0);
});
