import * as THREE from 'three';

// Fit actual course geometry into the stage area left clear by the teaching HUD.
export function fitCourseCamera(camera,group,rect,width,height,view) {
  const bounds=new THREE.Box3().setFromObject(group).expandByScalar(.45);
  const target=bounds.getCenter(new THREE.Vector3());
  const direction=view==='top'?new THREE.Vector3(0,1,-.0003):new THREE.Vector3(12,15.5,-19).normalize();
  const probe=camera.clone();probe.clearViewOffset();probe.aspect=width/height;
  const offset={x:width/2-(rect.left+rect.right)/2,y:height/2-(rect.top+rect.bottom)/2};
  probe.setViewOffset(width,height,offset.x,offset.y,width,height);
  probe.position.copy(target).add(direction);probe.lookAt(target);probe.updateMatrixWorld(true);
  const right=new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld,0);
  const up=new THREE.Vector3().setFromMatrixColumn(probe.matrixWorld,1);
  const corners=[];
  group.traverse(object=>{
    if(object.isSprite) {
      const center=object.getWorldPosition(new THREE.Vector3()),scale=object.getWorldScale(new THREE.Vector3());
      for(const x of [-object.center.x,1-object.center.x])for(const y of [-object.center.y,1-object.center.y])corners.push(center.clone().addScaledVector(right,x*Math.abs(scale.x)).addScaledVector(up,y*Math.abs(scale.y)));
    } else if(object.isMesh || object.isLine) {
      const box=new THREE.Box3().setFromObject(object).expandByScalar(object.isLine?1:.15);
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new THREE.Vector3(x,y,z));
    }
  });
  function fits(distance) {
    probe.position.copy(target).addScaledVector(direction,distance);probe.lookAt(target);probe.updateMatrixWorld(true);
    return corners.every(corner=>{
      const point=corner.clone().project(probe),x=(point.x+1)*width/2,y=(1-point.y)*height/2;
      return point.z>=-1 && point.z<=1 && x>=rect.left && x<=rect.right && y>=rect.top && y<=rect.bottom;
    });
  }
  probe.far=2000;probe.updateProjectionMatrix();
  let low=1,high=32;
  while(high<1024 && !fits(high))high*=2;
  if(!fits(high))return null;
  for(let i=0;i<18;i++) {const distance=(low+high)/2;if(fits(distance))high=distance;else low=distance;}
  return {position:target.clone().addScaledVector(direction,high),target,offset,far:Math.max(120,high+bounds.getSize(new THREE.Vector3()).length()+10)};
}
