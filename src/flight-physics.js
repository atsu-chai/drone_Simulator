import {expectedHeading} from './course-layout.js';
import {createEnvironment,stepEnvironment} from './flight-environment.js';
import {createFlightController,motorLayout,stepFlightController} from './flight-controller.js';
// Assumed 350 mm class GNSS multirotor. These are training assumptions, not the
// measured values of a certified aircraft; see docs/physics-model.md.
export const flightModel = {
  fixedStep: 1 / 120,
  massKg: 1.15,
  gravity: 9.81,
  maxTilt: 28 * Math.PI / 180,
  attitudeModeTiltRatio: 0.8,
  maxGroundSpeed: 6,
  maxYawRate: 100 * Math.PI / 180,
  maxClimbRate: 2.2,
  maxDescentRate: 1.6,
  maxThrustNewtons: 22.4,
  idleMotorThrust: 0.12,
  motorRiseTime: 0.05,
  motorFallTime: 0.09,
  armLength: 0.124,
  yawTorquePerThrust: 0.016,
  tiltInertia: 0.016,
  yawInertia: 0.028,
  attitudeGain: 7,
  rateGain: 20,
  yawRateGain: 7,
  maxTiltRate: 3.2,
  horizontalLinearDrag: 0.12,
  horizontalQuadraticDrag: 0.055,
  verticalDrag: 0.18,
  rotorFlapTorque: 0.016,
  windTurbulenceTorque: 0.0035,
  groundWashTorque: 0.012,
  groundWashHeight: 0.6,
  bounceSpeed: 0.9,
  bounceRestitution: 0.22,
  rotorDiscArea: 0.0452,
  airDensity: 1.2,
  propulsiveEfficiency: 0.55,
  batteryJoules: 144000,
};
const attitudeModePhases=["abnormalTakeoff","abnormal","emergencyHover","emergencyTransit","emergencyArrival","landing"];
export function usesPositionHold(phase){return !attitudeModePhases.includes(phase);}
function electricalPower(motors) {
  const inducedPower=motors.reduce((sum,thrust)=>sum+Math.pow(Math.max(0,thrust),1.5),0)/Math.sqrt(2*flightModel.airDensity*flightModel.rotorDiscArea);
  return inducedPower/flightModel.propulsiveEfficiency;
}
export function createFlightPhysics({state,clamp,trainingNow,targetAltitude,currentNavigationTarget,angleDifference}) {
  return function updatePhysics(dt, rawInput) {
  const d = state.drone;
  state.rawInput={...rawInput};
  if (state.paused) return;
  if (state.running) state.simulationTime += dt;
  state.environment ||= createEnvironment();
  state.flightController ||= createFlightController();
  d.motors ||= [0,0,0,0];
  const commandResponse = 1 - Math.exp(-dt * 10);
  const throttleTarget = state.running ? rawInput.throttle : 0;
  const forwardTarget = state.running ? rawInput.forward : 0;
  const strafeTarget = state.running ? rawInput.strafe : 0;
  const yawTarget = state.running ? rawInput.yaw : 0;
  state.command.throttle += (throttleTarget - state.command.throttle) * commandResponse;
  state.command.forward += (forwardTarget - state.command.forward) * commandResponse;
  state.command.strafe += (strafeTarget - state.command.strafe) * commandResponse;
  state.command.yaw += (yawTarget - state.command.yaw) * commandResponse;

  const input = state.command;
  const hasPilotInput =
    Math.abs(rawInput.throttle) +
    Math.abs(rawInput.forward) +
    Math.abs(rawInput.strafe) +
    Math.abs(rawInput.yaw) > 0.12;
  if (state.running && hasPilotInput && state.respondedPhase !== state.phase) {
    state.responseDelays.push((trainingNow() - state.lastPhaseChange) / 1000);
    state.respondedPhase = state.phase;
  }

  if (!state.running) {
    const settle = Math.exp(-dt * 8);
    d.roll *= settle;
    d.pitch *= settle;
    d.rollRate *= settle;
    d.pitchRate *= settle;
    d.yawRate *= settle;
    d.motors=d.motors.map(thrust=>thrust*Math.exp(-dt*5));
    d.thrustNewtons *= Math.exp(-dt * 5);
    return;
  }

  const environment=state.environment;
  const wind=stepEnvironment(environment,dt,d.y);
  const positionHold = usesPositionHold(state.phase);
  const cosYaw = Math.cos(d.yaw);
  const sinYaw = Math.sin(d.yaw);
  const grounded = d.y <= 0.001 && d.vy <= 0;
  const stateOfCharge=clamp(state.batteryPct/100,0,1);
  const voltageFactor=.86+.14*stateOfCharge;
  const estimate={
    x:d.x+environment.gnssX,z:d.z+environment.gnssZ,vx:d.vx,vz:d.vz,
    altitude:d.y+environment.baro,vy:d.vy,yaw:d.yaw,yawRate:d.yawRate,
    roll:d.roll+environment.imuBias.roll,pitch:d.pitch+environment.imuBias.pitch,
    rollRate:d.rollRate,pitchRate:d.pitchRate,
  };
  const output=stepFlightController(state.flightController,{model:flightModel,dt,input,estimate,positionHold,grounded,voltageFactor});
  d.motors=d.motors.map((thrust,index)=>{
    const request=output.motors[index];
    return thrust+(request-thrust)*(1-Math.exp(-dt/(request>thrust?flightModel.motorRiseTime:flightModel.motorFallTime)));
  });
  d.thrustNewtons=d.motors.reduce((sum,thrust)=>sum+thrust,0);
  state.altimeter=Math.max(0,d.y+environment.baro);

  const airX=d.vx-wind.x,airZ=d.vz-wind.z;
  const airRight=airX*cosYaw-airZ*sinYaw,airForward=airX*sinYaw+airZ*cosYaw;
  const groundEffect =
    d.y > 0 && d.y < 0.65
      ? 1 + 0.1 * Math.pow(1 - d.y / 0.65, 2)
      : 1;
  // Torques come from the motors that actually spun up, so saturation and lag are felt.
  let rollTorque=0,pitchTorque=0,yawTorque=0;
  motorLayout.forEach((motor,index)=>{
    rollTorque+=motor.right*d.motors[index]*flightModel.armLength;
    pitchTorque-=motor.forward*d.motors[index]*flightModel.armLength;
    yawTorque+=motor.spin*d.motors[index]*flightModel.yawTorquePerThrust;
  });
  if(!grounded) {
    const wash=d.y<flightModel.groundWashHeight?1-d.y/flightModel.groundWashHeight:0;
    const roughness=flightModel.windTurbulenceTorque*wind.speed+flightModel.groundWashTorque*wash*d.thrustNewtons/flightModel.maxThrustNewtons*2;
    // Advancing rotors flap the aircraft away from the relative wind.
    pitchTorque+=-airForward*flightModel.rotorFlapTorque+environment.turbulencePitch*roughness;
    rollTorque+=airRight*flightModel.rotorFlapTorque+environment.turbulenceRoll*roughness;
    d.pitchRate+=pitchTorque/flightModel.tiltInertia*dt;
    d.rollRate+=rollTorque/flightModel.tiltInertia*dt;
    d.pitch+=d.pitchRate*dt;
    d.roll+=d.rollRate*dt;
    d.yawRate+=yawTorque/flightModel.yawInertia*dt;
  } else {
    // The landing gear holds the airframe level and stops it pivoting on the spot.
    const level=Math.exp(-dt*14);
    d.roll*=level;d.pitch*=level;d.rollRate=0;d.pitchRate=0;d.yawRate*=Math.exp(-dt*12);
  }
  d.yaw += d.yawRate * dt;
  if (d.yaw > Math.PI) d.yaw -= Math.PI * 2;
  if (d.yaw < -Math.PI) d.yaw += Math.PI * 2;

  const tiltCosine = Math.cos(d.roll) * Math.cos(d.pitch);
  const effectiveThrustAcceleration = d.thrustNewtons / flightModel.massKg * groundEffect;
  const localRightAcceleration = -Math.sin(d.roll) * effectiveThrustAcceleration;
  const localForwardAcceleration =
    Math.sin(d.pitch) * Math.cos(d.roll) * effectiveThrustAcceleration;
  const verticalAcceleration =
    tiltCosine * effectiveThrustAcceleration -
    flightModel.gravity -
    d.vy * flightModel.verticalDrag;

  // Drag acts on motion through the air, so a parked aircraft is pushed by wind.
  const accelerationX =
    localRightAcceleration * cosYaw +
    localForwardAcceleration * sinYaw -
    flightModel.horizontalLinearDrag * airX -
    flightModel.horizontalQuadraticDrag * Math.abs(airX) * airX;
  const accelerationZ =
    localForwardAcceleration * cosYaw -
    localRightAcceleration * sinYaw -
    flightModel.horizontalLinearDrag * airZ -
    flightModel.horizontalQuadraticDrag * Math.abs(airZ) * airZ;

  const heldByGear=grounded && effectiveThrustAcceleration*tiltCosine<flightModel.gravity;
  if(!heldByGear) {
    d.vx += accelerationX * dt;
    d.vz += accelerationZ * dt;
  }
  d.vy += verticalAcceleration * dt;

  const nextX = d.x + d.vx * dt;
  const nextZ = d.z + d.vz * dt;
  const nextY = d.y + d.vy * dt;
  // Trial-area departure is evaluated by the current course, not invisible walls.
  d.x = nextX;
  d.z = nextZ;
  if(d.y>.15)state.hasTakenOff=true;
  if (nextY <= 0) {
    state.groundTime=(state.groundTime||0)+dt;
    const impactSpeed=Math.max(0,-d.vy);
    if(d.y>0 && state.hasTakenOff) {
      (state.touchdowns ||= []).push({phase:state.phase,time:state.simulationTime,x:nextX,z:nextZ,descentSpeed:impactSpeed,horizontalSpeed:Math.hypot(d.vx,d.vz)});
    }
    if (d.y > 0) {
      state.hardLandingSpeed = Math.max(state.hardLandingSpeed, impactSpeed);
    }
    d.y = 0;
    d.vy = impactSpeed>flightModel.bounceSpeed?impactSpeed*flightModel.bounceRestitution:0;
    const groundFriction = Math.exp(-dt * 7);
    d.vx *= groundFriction;
    d.vz *= groundFriction;
    if(heldByGear && Math.hypot(d.vx,d.vz)<.03){d.vx=0;d.vz=0;}
  } else {
    state.groundTime=0;
    d.y = nextY;
  }

  state.batteryPct = Math.max(0, state.batteryPct - electricalPower(d.motors) * dt / flightModel.batteryJoules * 100);
  const jitter = Math.abs(d.y - targetAltitude());
  const altitudeCanBeScored =
    (["takeoff", "abnormalTakeoff"].includes(state.phase) && d.y > 3) ||
    (state.phase === "eightTakeoff" && d.y > 1.2) ||
    ["square", "eight", "abnormal", "emergencyHover", "emergencyTransit", "emergencyArrival"].includes(state.phase);
  if (altitudeCanBeScored) {
    state.altitudeErrorSquared += jitter * jitter * dt;
    state.altitudeSampleTime += dt;
  }

  const navigationTarget = currentNavigationTarget();
  const horizontalSpeed = Math.hypot(d.vx, d.vz);
  if (navigationTarget && ['square','eight','abnormal'].includes(state.phase) && horizontalSpeed > 0.25) {
    const expectedYaw = expectedHeading(state.phase, d, state.phase==='square'?state.squareIndex:state.eightIndex, navigationTarget);
    const headingError = angleDifference(d.yaw, expectedYaw);
    state.headingErrorSquared += headingError * headingError * dt;
    state.headingSampleTime += dt;
  }
}
;
}
