import {expectedHeading} from './course-layout.js';
export const flightModel = {
  fixedStep: 1 / 120,
  massKg: 1.15,
  gravity: 9.81,
  maxTilt: 28 * Math.PI / 180,
  maxYawRate: 100 * Math.PI / 180,
  maxClimbRate: 2.2,
  maxDescentRate: 1.6,
  maxThrustNewtons: 22.4,
  motorTimeConstant: 0.16,
  attitudeKp: 30,
  attitudeKd: 9,
  yawKp: 11,
  horizontalLinearDrag: 0.12,
  horizontalQuadraticDrag: 0.055,
  verticalDrag: 0.18,
};
export function createFlightPhysics({state,clamp,trainingNow,targetAltitude,currentNavigationTarget,angleDifference}) {
  return function updatePhysics(dt, rawInput) {
  const d = state.drone;
  if (state.paused) return;
  if (state.running) state.simulationTime += dt;
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
    d.thrustNewtons *= Math.exp(-dt * 5);
    return;
  }

  const positionHold = !["abnormalTakeoff", "abnormal", "emergencyHover", "emergencyTransit", "landing"].includes(state.phase);
  const cosYaw = Math.cos(d.yaw);
  const sinYaw = Math.sin(d.yaw);
  const localRightVelocity = d.vx * cosYaw - d.vz * sinYaw;
  const localForwardVelocity = d.vx * sinYaw + d.vz * cosYaw;
  const tiltLimit = positionHold ? flightModel.maxTilt : flightModel.maxTilt * 0.8;

  let desiredPitch = input.forward * tiltLimit;
  let desiredRoll = -input.strafe * tiltLimit;
  if (positionHold) {
    const forwardBrake = Math.abs(input.forward) < 0.08 ? 0.115 : 0.035;
    const rightBrake = Math.abs(input.strafe) < 0.08 ? 0.115 : 0.035;
    desiredPitch -= localForwardVelocity * forwardBrake;
    desiredRoll += localRightVelocity * rightBrake;
  } else {
    const trim = 0.012;
    desiredPitch += Math.sin(state.simulationTime / 2.3) * trim;
    desiredRoll += Math.cos(state.simulationTime / 1.9) * trim;
  }
  desiredPitch = clamp(desiredPitch, -tiltLimit, tiltLimit);
  desiredRoll = clamp(desiredRoll, -tiltLimit, tiltLimit);

  const pitchAcceleration =
    flightModel.attitudeKp * (desiredPitch - d.pitch) -
    flightModel.attitudeKd * d.pitchRate;
  const rollAcceleration =
    flightModel.attitudeKp * (desiredRoll - d.roll) -
    flightModel.attitudeKd * d.rollRate;
  d.pitchRate += pitchAcceleration * dt;
  d.rollRate += rollAcceleration * dt;
  d.pitch += d.pitchRate * dt;
  d.roll += d.rollRate * dt;

  const desiredYawRate = input.yaw * flightModel.maxYawRate;
  d.yawRate += (desiredYawRate - d.yawRate) * flightModel.yawKp * dt;
  d.yaw += d.yawRate * dt;
  if (d.yaw > Math.PI) d.yaw -= Math.PI * 2;
  if (d.yaw < -Math.PI) d.yaw += Math.PI * 2;

  const desiredVerticalVelocity =
    input.throttle >= 0
      ? input.throttle * flightModel.maxClimbRate
      : input.throttle * flightModel.maxDescentRate;
  const tiltCosine = Math.max(0.64, Math.cos(d.roll) * Math.cos(d.pitch));
  const verticalControl = clamp((desiredVerticalVelocity - d.vy) * 4.4, -6.8, 7.5);
  const grounded = d.y <= 0.001 && d.vy <= 0;
  let targetThrustNewtons =
    grounded && input.throttle <= 0.02
      ? 0
      : flightModel.massKg * (flightModel.gravity + verticalControl) / tiltCosine;
  targetThrustNewtons = clamp(
    targetThrustNewtons,
    0,
    flightModel.maxThrustNewtons
  );
  const motorResponse = 1 - Math.exp(-dt / flightModel.motorTimeConstant);
  d.thrustNewtons +=
    (targetThrustNewtons - d.thrustNewtons) * motorResponse;

  const groundEffect =
    d.y > 0 && d.y < 0.65
      ? 1 + 0.1 * Math.pow(1 - d.y / 0.65, 2)
      : 1;
  const thrustAcceleration = d.thrustNewtons / flightModel.massKg;
  const effectiveThrustAcceleration = thrustAcceleration * groundEffect;
  const localRightAcceleration = -Math.sin(d.roll) * effectiveThrustAcceleration;
  const localForwardAcceleration =
    Math.sin(d.pitch) * Math.cos(d.roll) * effectiveThrustAcceleration;
  const verticalAcceleration =
    tiltCosine * effectiveThrustAcceleration -
    flightModel.gravity -
    d.vy * flightModel.verticalDrag;

  const accelerationX =
    localRightAcceleration * cosYaw +
    localForwardAcceleration * sinYaw -
    flightModel.horizontalLinearDrag * d.vx -
    flightModel.horizontalQuadraticDrag * Math.abs(d.vx) * d.vx;
  const accelerationZ =
    localForwardAcceleration * cosYaw -
    localRightAcceleration * sinYaw -
    flightModel.horizontalLinearDrag * d.vz -
    flightModel.horizontalQuadraticDrag * Math.abs(d.vz) * d.vz;

  d.vx += accelerationX * dt;
  d.vz += accelerationZ * dt;
  d.vy += verticalAcceleration * dt;

  const nextX = d.x + d.vx * dt;
  const nextZ = d.z + d.vz * dt;
  const nextY = d.y + d.vy * dt;
  // Trial-area departure is evaluated by the current course, not invisible walls.
  d.x = nextX;
  d.z = nextZ;
  if (nextY <= 0) {
    if (d.y > 0.01) {
      state.hardLandingSpeed = Math.max(state.hardLandingSpeed, Math.max(0, -d.vy));
    }
    d.y = 0;
    d.vy = 0;
    const groundFriction = Math.exp(-dt * 7);
    d.vx *= groundFriction;
    d.vz *= groundFriction;
  } else {
    d.y = Math.min(nextY, 6);
    if (d.y >= 6) d.vy = Math.min(0, d.vy);
  }

  state.batteryPct = Math.max(0, state.batteryPct - dt * 0.045);
  const jitter = Math.abs(d.y - targetAltitude());
  const altitudeCanBeScored =
    (["takeoff", "abnormalTakeoff"].includes(state.phase) && d.y > 3) ||
    (state.phase === "eightTakeoff" && d.y > 1.2) ||
    ["square", "eight", "abnormal", "emergencyHover", "emergencyTransit"].includes(state.phase);
  if (altitudeCanBeScored) {
    state.altitudeErrorSquared += jitter * jitter * dt;
    state.altitudeSampleTime += dt;
  }

  const navigationTarget = currentNavigationTarget();
  const horizontalSpeed = Math.hypot(d.vx, d.vz);
  if (navigationTarget && horizontalSpeed > 0.25) {
    const expectedYaw = expectedHeading(state.phase, d, state.eightIndex, navigationTarget);
    const headingError = angleDifference(d.yaw, expectedYaw);
    state.headingErrorSquared += headingError * headingError * dt;
    state.headingSampleTime += dt;
  }
}
;
}
