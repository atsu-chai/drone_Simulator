import * as THREE from 'three';
import {coneDimensions} from './flight-safety.js';
import { layouts, eightCenters } from './course-layout.js';
function rectangle(width,depth,x,z,color,y=0.02) {
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshBasicMaterial({color,toneMapped:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.receiveShadow=true;return mesh;
}
export function textLabel(text,{color='#e8f5f4',background='#172328',width=2.4}={}) {
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  ctx.font='bold 64px system-ui, sans-serif';
  canvas.width=Math.max(128,Math.ceil(ctx.measureText(text).width)+48);canvas.height=128;
  ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=color;
  ctx.font='bold 64px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,canvas.width/2,64);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,toneMapped:false}));sprite.scale.set(width,width*128/canvas.width,1);return sprite;
}
function line(points,color=0x88d8eb,dashed=false) {
  const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p.x,p.y||.09,p.z)));
  const material=dashed?new THREE.LineDashedMaterial({color,dashSize:.18,gapSize:.14}):new THREE.LineBasicMaterial({color});
  const path=new THREE.Line(geometry,material);path.computeLineDistances();return path;
}
function person(x,z,color,title) {
  const group=new THREE.Group(),material=new THREE.MeshStandardMaterial({color,roughness:.7});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.19,.5,6,12),material);torso.position.y=1.05;group.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.15,16,12),material);head.position.y=1.62;group.add(head);
  for(const side of [-1,1]) {const leg=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.65,10),material);leg.position.set(side*.12,.38,0);group.add(leg);const arm=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.52,10),material);arm.position.set(side*.25,1.02,-.12);arm.rotation.x=-.4;group.add(arm);}
  group.position.set(x,0,z);const label=textLabel(title,{width:1.1});label.position.set(0,2.05,0);group.add(label);return group;
}
export function createCourseScene(id,addCone) {
  const layout=layouts[id],group=new THREE.Group();group.name=`course-${id}`;
  // Logical +x is the pilot's right; Three.js views +z from the opposite x basis.
  group.scale.x=-1;
  group.add(rectangle(layout.fieldWidth,layout.fieldDepth,0,layout.centerZ,0x852d43));
  group.add(rectangle(layout.failureWidth,layout.failureDepth,0,layout.centerZ,0xecc544,.025));
  group.add(rectangle(layout.penaltyWidth,layout.penaltyDepth,0,layout.centerZ,0x526166,.03));
  if(id==='square') group.add(rectangle(10,2,0,2.5,0xecc544,.035));
  if(id==='eight') for(const center of eightCenters) {
    const exclusion=new THREE.Mesh(new THREE.CircleGeometry(1,64),new THREE.MeshBasicMaterial({color:0xecc544,toneMapped:false}));
    exclusion.rotation.x=-Math.PI/2;exclusion.position.set(center.x,.035,center.z);group.add(exclusion);
  }
  const pad=rectangle(2,2,layout.takeoff.x,layout.takeoff.z,0x2c9db1,.045);group.add(pad);
  const padLabel=textLabel('H',{width:1.2,background:'#2c9db1'});padLabel.position.set(layout.takeoff.x,.12,layout.takeoff.z);padLabel.material.depthTest=true;group.add(padLabel);
  const markerLabels=new THREE.Group();group.add(markerLabels);
  for(const point of layout.markers) {
    // Mark the course point itself; H is the separate clear landing area.
    addCone(THREE,point.x,point.z,point.label,[`${id}:${point.label}`],[id],'',group);
    const label=textLabel(point.label,{width:.75});label.position.set(point.x,coneDimensions.height+.24,point.z);markerLabels.add(label);
  }
  const guides=new THREE.Group();guides.name='learning-guides';
  let route=[];
  if(id==='eight') {
    for(let lobe=0;lobe<2;lobe++) for(let i=0;i<=128;i++) {
      const angle=(lobe===0?0:Math.PI)+(lobe===0?1:-1)*i/128*Math.PI*2;
      route.push({x:eightCenters[lobe].x+2.5*Math.cos(angle),z:2.5*Math.sin(angle)});
    }
  } else route=layout.route;
  guides.add(line(route));guides.add(line(route.map(p=>({...p,y:layout.altitude})),0xa5ebff,true));
  for(let i=1;i<route.length;i+=id==='eight'?24:1) {
    const from=route[i-1],to=route[i],direction=new THREE.Vector3(to.x-from.x,0,to.z-from.z).normalize();
    if(direction.lengthSq()) guides.add(new THREE.ArrowHelper(direction,new THREE.Vector3(to.x-direction.x*.65,.12,to.z-direction.z*.65),.65,0x8fe3f4,.25,.18));
  }
  if(id==='abnormal')guides.add(new THREE.ArrowHelper(new THREE.Vector3(-1,0,0),new THREE.Vector3(-6.5+.65,.12,0),.65,0x8fe3f4,.25,.18));
  if(id!=='eight') guides.add(line([layout.takeoff,{x:0,z:0}],0x8fe3f4,true));
  guides.add(line([{...layout.takeoff,y:.12},{...layout.takeoff,y:layout.altitude}],0x8fe3f4,true));
  const annotations=new THREE.Group();guides.add(annotations);
  const height=textLabel(`高度 ${layout.altitude.toFixed(1)}m`,{width:2.6});height.position.set(layout.routeWidth/2+2.2,layout.altitude+.35,layout.centerZ);annotations.add(height);
  const dimension=textLabel(layout.dimensions[0],{width:4.8});dimension.position.set(0,.6,layout.centerZ+layout.fieldDepth/2+.75);annotations.add(dimension);
  const distance=textLabel(layout.dimensions[1],{width:4.2});distance.position.set(0,.5,layout.pilot.z-1.1);annotations.add(distance);
  group.add(guides);
  group.add(person(-.65,layout.pilot.z,0xd75b5a,'試験員'),person(.65,layout.pilot.z,0x42c4d8,'受験者'));
  return {group,guides,annotations,markerLabels,layout};
}

// Physical markers for the full exam. The lesson overlay remains available independently.
export function addExamField(field) {
  const {group,layout}=field,exam=new THREE.Group();exam.name='exam-field';
  const outline=(w,h,c=layout.centerZ)=>exam.add(line([{x:-w/2,z:c-h/2},{x:w/2,z:c-h/2},{x:w/2,z:c+h/2},{x:-w/2,z:c+h/2},{x:-w/2,z:c-h/2}],0xf8f4e6));
  outline(layout.failureWidth,layout.failureDepth);outline(layout.penaltyWidth,layout.penaltyDepth);
  if(layout.id==='square') {outline(13,5);outline(10,2);}
  if(layout.id==='eight')for(const c of eightCenters)exam.add(line(Array.from({length:65},(_,i)=>({x:c.x+Math.cos(i/64*Math.PI*2),z:c.z+Math.sin(i/64*Math.PI*2)})),0xf8f4e6));
  const pad=new THREE.Mesh(new THREE.CircleGeometry(1,64),new THREE.MeshStandardMaterial({color:0xb32b28,roughness:.9}));pad.rotation.x=-Math.PI/2;pad.position.set(layout.takeoff.x,.06,layout.takeoff.z);exam.add(pad);
  // Painted on the pad, so it stays flat and foreshortens from the pilot's position.
  for(const [x,z,width,depth] of [[-.32,0,.16,1],[.32,0,.16,1],[0,0,.5,.16]]) {
    const stroke=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),new THREE.MeshStandardMaterial({color:0xf5f1e6,roughness:.9}));
    stroke.rotation.x=-Math.PI/2;stroke.position.set(layout.takeoff.x+x,.07,layout.takeoff.z+z);exam.add(stroke);
  }
  for(const side of [-1,1])for(let i=0;i<5;i++) {
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.6,6),new THREE.MeshStandardMaterial({color:0xddddcf}));pole.position.set(side*layout.failureWidth/2,.3,layout.centerZ-layout.failureDepth/2+i*layout.failureDepth/4);exam.add(pole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(.28,.18),new THREE.MeshStandardMaterial({color:0x186fc3,side:THREE.DoubleSide}));flag.position.copy(pole.position).add(new THREE.Vector3(.14,.18,0));exam.add(flag);
  }
  // Fold-out table, helmet, glasses and intervention transmitter next to the pilot.
  const table=new THREE.Mesh(new THREE.BoxGeometry(1.6,.08,.7),new THREE.MeshStandardMaterial({color:0xc2c4b9}));table.position.set(-.7,.78,layout.pilot.z+.7);exam.add(table);
  for(const x of [-1.3,-.1])for(const z of [.45,.95]) {const leg=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.78,8),new THREE.MeshStandardMaterial({color:0x7a8589}));leg.position.set(x,.39,layout.pilot.z+z);leg.rotation.z=x<-.5?.2:-.2;exam.add(leg);}
  for(const x of [-.65,.65]) {
    const helmet=new THREE.Mesh(new THREE.SphereGeometry(.18,16,12,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0xf5e6a9}));helmet.position.set(x,1.65,layout.pilot.z);exam.add(helmet);
    const glasses=new THREE.Mesh(new THREE.BoxGeometry(.27,.08,.1),new THREE.MeshStandardMaterial({color:0x618e9d,transparent:true,opacity:.7}));glasses.position.set(x,1.63,layout.pilot.z+.13);exam.add(glasses);
    const controller=new THREE.Mesh(new THREE.BoxGeometry(.24,.11,.18),new THREE.MeshStandardMaterial({color:0x323d42}));controller.position.set(x,1.1,layout.pilot.z+.3);exam.add(controller);
  }
  field.lessonSurfaces=group.children.filter(child=>child.isMesh||child.isSprite);
  group.add(exam);exam.visible=false;field.exam=exam;
}
export function setExamField(field,enabled) {
  field.exam.visible=enabled;
  if(enabled&&!field.exam.parent)field.group.add(field.exam);
  else if(!enabled&&field.exam.parent)field.group.remove(field.exam);
  for(const mesh of field.lessonSurfaces)mesh.visible=!enabled;
  if(enabled){field.guides.visible=false;field.annotations.visible=false;field.markerLabels.visible=false;}
}
