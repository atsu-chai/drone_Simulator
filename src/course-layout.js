// Coordinates follow MLIT basic multirotor diagrams, physical PDF pages 17–18.
// x: lateral; z: away from the pilot. Each subject has its own local origin.
export const squarePath = [
  { label: 'A', x: 0, z: 0 }, { label: 'B', x: 6.5, z: 0 },
  { label: 'C', x: 6.5, z: 5 }, { label: 'D', x: -6.5, z: 5 },
  { label: 'E', x: -6.5, z: 0 }, { label: 'A', x: 0, z: 0 },
];
export const eightCenters = [{ x: -2.5, z: 0 }, { x: 2.5, z: 0 }];
export const figureEightLap = [
  { x: -2.5, z: 2.5 }, { x: -5, z: 0 }, { x: -2.5, z: -2.5 }, { x: 0, z: 0 },
  { x: 2.5, z: 2.5 }, { x: 5, z: 0 }, { x: 2.5, z: -2.5 }, { x: 0, z: 0 },
];
export const abnormalTargets = [
  { key: 'abnormalSetup', label: 'A', x: 0, z: 0 },
  { key: 'abnormalOut', label: 'B', x: 6.5, z: 0 },
  { key: 'abnormalAcross', label: 'E', x: -6.5, z: 0 },
  { key: 'abnormalReturn', label: 'B', x: 6.5, z: 0 },
];
export const layouts = {
  square: { id: 'square', title: 'スクエア飛行', takeoff: { x: 0, z: 2.5 }, pilot: { x: 0, z: -8.5 }, altitude: 3.5,
    centerZ: 2.5, routeWidth: 13, routeDepth: 5, penaltyWidth: 16, penaltyDepth: 8, failureWidth: 18, failureDepth: 10, fieldWidth: 21, fieldDepth: 13,
    markers: squarePath.slice(0,5), route: squarePath, dimensions: ['飛行経路 13m × 5m', '操縦者まで 8.5m'] },
  eight: { id: 'eight', title: '8の字飛行', takeoff: { x: 0, z: 0 }, pilot: { x: 0, z: -9 }, altitude: 1.5,
    centerZ: 0, routeWidth: 10, routeDepth: 5, penaltyWidth: 13, penaltyDepth: 8, failureWidth: 15, failureDepth: 10, fieldWidth: 18, fieldDepth: 13,
    markers: eightCenters.map((point,index)=>({...point,label:String(index+1)})), route: figureEightLap,
    dimensions: ['円直径 約5m / 連続2周', '最近点から操縦者まで 6.5m'] },
  abnormal: { id: 'abnormal', title: '異常事態における飛行', takeoff: { x: 0, z: 2.5 }, pilot: { x: 0, z: -8.5 }, altitude: 3.5,
    centerZ: 0, routeWidth: 13, routeDepth: 0, penaltyWidth: 16, penaltyDepth: 3, failureWidth: 18, failureDepth: 5, fieldWidth: 21, fieldDepth: 8,
    markers: [squarePath[4],squarePath[0],squarePath[1]], route: [{x:-6.5,z:0},{x:6.5,z:0}],
    dimensions: ['側方区間 13m / 1往復以上', '操縦者まで 8.5m'] },
};
export function courseIdFor(phase, subject='demo') {
  if(phase.startsWith('eight')) return 'eight';
  if(['abnormalTakeoff','abnormal','emergencyHover','emergencyTransit','landing'].includes(phase)) return 'abnormal';
  if(['preflight','result','postflight'].includes(phase)) return ['eight','abnormal'].includes(subject) ? subject : 'square';
  return 'square';
}
export function insideRectangle(point, width, depth, centerZ) {
  return Math.abs(point.x) <= width/2 && Math.abs(point.z-centerZ) <= depth/2;
}
export function fieldZone(point, id) {
  const layout=layouts[id];
  if(!insideRectangle(point,layout.failureWidth,layout.failureDepth,layout.centerZ)) return 'failure';
  if(!insideRectangle(point,layout.penaltyWidth,layout.penaltyDepth,layout.centerZ)) return 'penalty';
  // Square's central exclusion is a penalty area; the H approach is exempt by phase.
  if(id==='square' && Math.abs(point.x)<5 && point.z>1.5 && point.z<3.5) return 'penalty';
  if(id==='eight' && eightCenters.some(c=>Math.hypot(point.x-c.x,point.z-c.z)<1)) return 'penalty';
  return 'safe';
}
export function expectedHeading(phase, position, index, target) {
  if(['abnormal','emergencyHover','emergencyTransit','landing'].includes(phase)) return 0;
  if(phase==='eight') {
    const lobe=Math.floor((index%8)/4),sign=lobe===0?1:-1;
    const center=eightCenters[lobe];
    return Math.atan2(-sign*(position.z-center.z),sign*(position.x-center.x));
  }
  return target ? Math.atan2(target.x-position.x,target.z-position.z) : 0;
}
