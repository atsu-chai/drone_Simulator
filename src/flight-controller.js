// Autopilot only: it sees sensor estimates (never the true position) and sticks,
// and outputs one thrust request per motor. The rigid body lives in flight-physics.js.
const limit=(value,low,high)=>Math.max(low,Math.min(high,value));
export const motorLayout=Object.freeze([
  Object.freeze({right:1,forward:1,spin:1}),
  Object.freeze({right:-1,forward:1,spin:-1}),
  Object.freeze({right:-1,forward:-1,spin:1}),
  Object.freeze({right:1,forward:-1,spin:-1}),
]);
export function createFlightController() {
  return {altitudeHold:null,climbIntegral:0,positionHold:null,integralX:0,integralZ:0,mode:null};
}
export function resetFlightController(fc) {
  Object.assign(fc,createFlightController());
}
function collectiveThrust(fc,model,dt,input,estimate) {
  let desiredClimb=input.throttle>=0?input.throttle*model.maxClimbRate:input.throttle*model.maxDescentRate;
  if(Math.abs(input.throttle)<.03) {
    fc.altitudeHold??=estimate.altitude;
    desiredClimb=limit((fc.altitudeHold-estimate.altitude)*1.4,-.8,.8);
  } else fc.altitudeHold=null;
  const error=desiredClimb-estimate.vy;
  fc.climbIntegral=limit(fc.climbIntegral+error*1.5*dt,-4,4);
  const acceleration=limit(error*4.4+fc.climbIntegral,-6.8,7.5);
  const tilt=Math.max(.5,Math.cos(estimate.roll)*Math.cos(estimate.pitch));
  return model.massKg*(model.gravity+acceleration)/tilt;
}
// GNSS: sticks ask for a velocity; released sticks brake, then latch the estimated position.
function positionHoldTilt(fc,model,dt,input,estimate) {
  const sin=Math.sin(estimate.yaw),cos=Math.cos(estimate.yaw);
  const centered=Math.abs(input.forward)<.03 && Math.abs(input.strafe)<.03;
  let wantX=(input.strafe*cos+input.forward*sin)*model.maxGroundSpeed;
  let wantZ=(input.forward*cos-input.strafe*sin)*model.maxGroundSpeed;
  if(centered) {
    if(!fc.positionHold && Math.hypot(estimate.vx,estimate.vz)<.3)fc.positionHold={x:estimate.x,z:estimate.z};
    if(fc.positionHold) {
      wantX=limit((fc.positionHold.x-estimate.x)*1.1,-1,1);
      wantZ=limit((fc.positionHold.z-estimate.z)*1.1,-1,1);
    }
  } else fc.positionHold=null;
  const errorX=wantX-estimate.vx,errorZ=wantZ-estimate.vz;
  // The integral is what lets a GNSS aircraft lean into a steady wind.
  fc.integralX=limit(fc.integralX+errorX*.55*dt,-3.5,3.5);
  fc.integralZ=limit(fc.integralZ+errorZ*.55*dt,-3.5,3.5);
  const accelX=errorX*1.9+fc.integralX,accelZ=errorZ*1.9+fc.integralZ;
  const accelRight=accelX*cos-accelZ*sin,accelForward=accelX*sin+accelZ*cos;
  return limitTotalTilt({pitch:Math.atan2(accelForward,model.gravity),roll:-Math.atan2(accelRight,model.gravity)},model.maxTilt);
}
// Horizontal stabilisation off: sticks set a lean angle. Nothing resists wind or
// inertia except the pilot. Altitude hold stays, as only horizontal aids are removed.
function attitudeTilt(model,input) {
  const tilt=model.maxTilt*model.attitudeModeTiltRatio;
  return limitTotalTilt({pitch:input.forward*tilt,roll:-input.strafe*tilt},tilt);
}
// Limits the lean of the thrust axis, so diagonal sticks cannot exceed the tilt limit.
function limitTotalTilt(tilt,maximum) {
  const total=Math.hypot(tilt.pitch,tilt.roll);
  return total>maximum?{pitch:tilt.pitch*maximum/total,roll:tilt.roll*maximum/total}:tilt;
}
export function stepFlightController(fc,{model,dt,input,estimate,positionHold,grounded,voltageFactor}) {
  const mode=positionHold?'gnss':'attitude';
  if(fc.mode!==mode) {
    // A changed aid never inherits another mode's wind correction.
    fc.mode=mode;fc.positionHold=null;fc.integralX=0;fc.integralZ=0;
  }
  const motorMax=model.maxThrustNewtons/4*voltageFactor;
  if(grounded && input.throttle<=.02) {
    resetFlightController(fc);fc.mode=mode;
    return {motors:motorLayout.map(()=>model.idleMotorThrust),tilt:{pitch:0,roll:0}};
  }
  const thrust=collectiveThrust(fc,model,dt,input,estimate);
  const tilt=grounded?{pitch:0,roll:0}:positionHold?positionHoldTilt(fc,model,dt,input,estimate):attitudeTilt(model,input);
  const pitchRateTarget=limit((tilt.pitch-estimate.pitch)*model.attitudeGain,-model.maxTiltRate,model.maxTiltRate);
  const rollRateTarget=limit((tilt.roll-estimate.roll)*model.attitudeGain,-model.maxTiltRate,model.maxTiltRate);
  const pitchTorque=model.tiltInertia*(pitchRateTarget-estimate.pitchRate)*model.rateGain;
  const rollTorque=model.tiltInertia*(rollRateTarget-estimate.rollRate)*model.rateGain;
  const yawTorque=model.yawInertia*(input.yaw*model.maxYawRate-estimate.yawRate)*model.yawRateGain;
  const requests=motorLayout.map(motor=>
    +motor.right*rollTorque/(4*model.armLength)
    -motor.forward*pitchTorque/(4*model.armLength)
    +motor.spin*yawTorque/(4*model.yawTorquePerThrust));
  // Attitude wins over climb: when a motor saturates, shed collective first.
  const high=Math.max(...requests),low=Math.min(...requests);
  const collective=limit(thrust/4,Math.min(model.idleMotorThrust-low,motorMax-high),Math.max(model.idleMotorThrust-low,motorMax-high));
  return {motors:requests.map(request=>limit(request+collective,model.idleMotorThrust,motorMax)),tilt};
}
