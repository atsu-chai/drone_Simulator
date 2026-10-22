import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aircraftDimensions,fitAircraftBounds,aircraftContactEnvelope} from '../src/aircraft-geometry.js';
import {touchesCone} from '../src/flight-safety.js';

test('different aircraft assets fit the shared envelope without distortion',()=>{
  for(const [min,max] of [[{x:-3,y:-.1,z:-3},{x:3,y:1,z:3}],[{x:-1.1,y:-.1,z:-.92},{x:1.1,y:.48,z:.92}],[{x:10,y:5,z:-4},{x:12,y:7,z:0}]]) {
    const {scale,offset}=fitAircraftBounds(min,max);
    for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z]) {
      const p={x:x*scale+offset.x,y:y*scale+offset.y,z:z*scale+offset.z};
      assert.ok(Math.hypot(p.x,p.z)<=aircraftDimensions.radius+1e-10);
      assert.ok(Math.abs(p.y)<=aircraftDimensions.halfHeight+1e-10);
    }
    assert.ok(Math.abs(min.y*scale+offset.y+aircraftDimensions.halfHeight)<1e-10);
    assert.ok(scale>0);
  }
});
test('the tilted collision envelope contains the entire swept rotor cylinder',()=>{
  for(const pitch of [-.49,0,.49])for(const roll of [-.49,0,.49]) {
    const envelope=aircraftContactEnvelope(pitch,roll);
    for(let i=0;i<360;i++)for(const y of [-.15,.15]) {
      const a=i*Math.PI/180,x=.55*Math.cos(a),z=.55*Math.sin(a);
      const rx=x*Math.cos(roll)-y*Math.sin(roll),ry=x*Math.sin(roll)+y*Math.cos(roll);
      const py=ry*Math.cos(pitch)-z*Math.sin(pitch),pz=ry*Math.sin(pitch)+z*Math.cos(pitch);
      assert.ok(Math.abs(py)<=envelope.halfHeight+1e-10);
      assert.ok(Math.hypot(rx,pz)<=envelope.radius+1e-10);
    }
  }
});
test('tilting near a cone can make contact while level flight clears it',()=>{
  assert.equal(touchesCone({x:0,y:.6,z:0,pitch:0,roll:0},{x:0,z:0}),false);
  assert.equal(touchesCone({x:0,y:.6,z:0,pitch:.49,roll:.49},{x:0,z:0}),true);
  assert.throws(()=>fitAircraftBounds({x:0,y:0,z:0},{x:0,y:0,z:0}));
});

test('the bundled animated asset only spins the identified rotor meshes around local Y',async()=>{
  const {readFile}=await import('node:fs/promises');
  const file=await readFile(new URL('../assets/models/cesium-drone.glb',import.meta.url));
  const jsonLength=file.readUInt32LE(12),gltf=JSON.parse(file.toString('utf8',20,20+jsonLength));
  const binaryOffset=20+jsonLength+8;
  const nodes=new Set();
  for(const animation of gltf.animations)for(const channel of animation.channels) {
    assert.equal(channel.target.path,'rotation');
    assert.match(gltf.nodes[channel.target.node].name,/^Prop/);
    const rotor=gltf.nodes[channel.target.node];
    assert.equal(rotor.rotation?.[0]||0,0);assert.equal(rotor.rotation?.[2]||0,0);
    nodes.add(channel.target.node);
    const accessor=gltf.accessors[animation.samplers[channel.sampler].output];
    assert.equal(accessor.type,'VEC4');assert.equal(accessor.componentType,5126);
    const view=gltf.bufferViews[accessor.bufferView];
    for(let i=0;i<accessor.count;i++) {
      const offset=binaryOffset+(view.byteOffset||0)+(accessor.byteOffset||0)+i*(view.byteStride||16);
      assert.ok(Math.abs(file.readFloatLE(offset))<1e-6);
      assert.ok(Math.abs(file.readFloatLE(offset+8))<1e-6);
    }
  }
  assert.equal(nodes.size,4);
});
