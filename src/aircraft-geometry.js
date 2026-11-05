// Assumed 350 mm wheelbase plus rotor sweep, matching the mass in flightModel.
// A training envelope, not a claim about a particular certified aircraft.
export const aircraftDimensions=Object.freeze({radius:.3,halfHeight:.1,centerHeight:.12});

// Keep both model variants inside the same collision envelope, including rotor sweep.
export function fitAircraftBounds(min,max) {
  const center={x:(min.x+max.x)/2,z:(min.z+max.z)/2};
  const radius=Math.hypot((max.x-min.x)/2,(max.z-min.z)/2);
  const height=max.y-min.y;
  if(!Number.isFinite(radius+height+center.x+center.z) || max.x<min.x || max.z<min.z || radius<=0 || height<=0)throw new Error('Invalid aircraft bounds');
  const scale=Math.min(aircraftDimensions.radius/radius,2*aircraftDimensions.halfHeight/height);
  return {scale,offset:{x:-center.x*scale,y:-min.y*scale-aircraftDimensions.halfHeight,z:-center.z*scale}};
}

// Axis-aligned conservative envelope of a tilted cylinder: rotor sweep plus body height.
export function aircraftContactEnvelope(pitch=0,roll=0) {
  const cosine=Math.max(-1,Math.min(1,Math.cos(pitch)*Math.cos(roll)));
  const sine=Math.sqrt(Math.max(0,1-cosine*cosine));
  return {radius:aircraftDimensions.radius+aircraftDimensions.halfHeight*sine,
    halfHeight:aircraftDimensions.halfHeight*Math.abs(cosine)+aircraftDimensions.radius*sine};
}
