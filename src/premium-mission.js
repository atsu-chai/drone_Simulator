export function createMission(deps) {
  const {state,phaseMission,taskLimits,trainingNow,recordTelemetry,evaluateSample,finishExam,isLandedAt,takeoffPoint,setPhase,squareTargets,figureEightTargets,figureEightLap,course,angleDifference,abnormalTargets,emergencyLandingPoint,ui,buildPostflightChecklist}=deps;
  return function updateMission(dt) {
  if (!state.running || state.paused) return;
  const d = state.drone;
  state.elapsed = (trainingNow() - state.startTime) / 1000;
  const mission = phaseMission[state.phase];
  if (taskLimits[mission]) {
    state.taskElapsed = (trainingNow() - state.taskStartTime) / 1000;
    if (state.taskElapsed > taskLimits[mission] && !state.timeLimitExceeded) {
      state.timeLimitExceeded = mission;
      finishExam();
      return;
    }
  }
  recordTelemetry();
  const index = state.phase === "square" ? state.squareIndex : state.phase === "eight" ? state.eightIndex : state.abnormalIndex;
  const events = evaluateSample(state.evaluation, {phase:state.phase,index,anchor:state.emergencyHoverPoint,time:state.elapsed,position:{x:d.x,y:d.y,z:d.z},input:{...state.command},velocity:{x:d.vx,y:d.vy,z:d.vz}});
  for (const event of events) {
    if(event.type === "route-warning") ui.examiner.textContent = "経路から離れています。経路に戻ってください。";
  }
  if(state.evaluation.fatal) { finishExam(); return; }
  if(state.phase === "demoLanding" && isLandedAt(takeoffPoint)) { finishExam(); return; }

  if (state.phase === "takeoff") {
    if (Math.hypot(d.x,d.z)<.9 && Math.abs(d.y - 3.5) < 0.22 && Math.hypot(d.vx, d.vz, d.vy) < 0.45) {
      state.hoverTimer += dt;
    } else {
      state.hoverTimer = 0;
    }
    if (state.hoverTimer > 5) setPhase(state.subject === "demo" ? "demoLanding" : "square");
  }

  if (state.phase === "square") {
    const target = squareTargets[state.squareIndex];
    const distance = target ? Math.hypot(d.x - target.x, d.z - target.z) : 0;
    if (target && distance < 0.9 && Math.abs(d.y - 3.5) < 0.45) {
      state.squareTimer += dt;
    } else {
      state.squareTimer = 0;
    }
    if (state.squareTimer > 0.8) {
      state.squareIndex += 1;
      state.squareTimer = 0;
      if (state.squareIndex >= squareTargets.length) {
        setPhase("squareLanding");
      } else {
        const nextPoint = squareTargets[state.squareIndex];
        ui.examiner.textContent = `次は${nextPoint.label}点です。${state.squareIndex + 1}/${squareTargets.length}`;
      }
    }
  }

  if (state.phase === "squareLanding" && isLandedAt(takeoffPoint)) {
    if(state.subject === "square") { finishExam(); return; }
    setPhase("eightTakeoff");
  }

  if (state.phase === "eightTakeoff") {
    if (Math.hypot(d.x,d.z)<.9 && Math.abs(d.y - 1.5) < 0.2 && Math.hypot(d.vx, d.vz, d.vy) < 0.4) {
      state.hoverTimer += dt;
    } else {
      state.hoverTimer = 0;
    }
    if (state.hoverTimer > 5) setPhase("eight");
  }

  if (state.phase === "eight") {
    if(state.eightIndex>0) {
      const key=Math.floor((state.eightIndex-1)/4);
      const center=course.eightCenters[key%2];
      const angle=Math.atan2(d.z-center.z,d.x-center.x);
      if(state.arc.key!==key) state.arc={key,angle,travel:0};
      else {
        const delta=angleDifference(angle,state.arc.angle);
        state.arc.travel += delta * (key%2===0 ? 1 : -1);
        state.arc.angle=angle;
      }
    }
    const target = figureEightTargets[state.eightIndex];
    if (
      target &&
      (state.eightIndex===0 || state.arc.travel >= ((state.eightIndex-1)%4+1)*Math.PI/2 - 0.35) &&
      Math.hypot(d.x - target.x, d.z - target.z) < 1 &&
      Math.abs(d.y - 1.5) < 0.4
    ) {
      state.eightIndex += 1;
      if (state.eightIndex >= figureEightTargets.length) {
        setPhase("eightLanding");
      } else {
        const completedLaps = Math.max(0, Math.floor((state.eightIndex - 1) / figureEightLap.length));
        ui.examiner.textContent = `8の字飛行を継続してください。完了 ${completedLaps}/2周`;
      }
    }
  }

  if (state.phase === "eightLanding" && isLandedAt(takeoffPoint)) {
    if(state.subject === "eight") { finishExam(); return; }
    setPhase("abnormalTakeoff");
  }

  if (state.phase === "abnormalTakeoff") {
    if (Math.hypot(d.x,d.z)<.9 && Math.abs(d.y - 3.5) < 0.25 && Math.hypot(d.vx, d.vz, d.vy) < 0.5) {
      state.hoverTimer += dt;
    } else {
      state.hoverTimer = 0;
    }
    if (state.hoverTimer > 5) setPhase("abnormal");
  }

  if (state.phase === "abnormal") {
    const target = abnormalTargets[state.abnormalIndex];
    const distance = target ? Math.hypot(d.x - target.x, d.z - target.z) : 0;
    if (target && distance < 0.9 && Math.abs(d.y - 3.5) < 0.55) {
      state.abnormalIndex += 1;
      if (state.abnormalIndex >= abnormalTargets.length) {
        state.emergencyHoverPoint={x:d.x,z:d.z};
        setPhase("emergencyHover");
      } else {
        ui.examiner.textContent =
          state.abnormalIndex === 1
            ? "機首前向きのまま側方へ移動してください。"
            : "同じ経路を側方移動で戻ってください。";
      }
    }
  }

  if (state.phase === "emergencyHover") {
    if (Math.hypot(d.x-state.emergencyHoverPoint.x,d.z-state.emergencyHoverPoint.z)<.9 && Math.abs(d.y - 3.5) < 0.45 && Math.hypot(d.vx, d.vz, d.vy) < 0.5) {
      state.emergencyHoverTimer += dt;
    } else {
      state.emergencyHoverTimer = 0;
    }
    if (state.emergencyHoverTimer > 3) setPhase("landing");
  }

  if (state.phase === "landing") {
    if (d.y < 1.2) {
      state.landingDrift = Math.max(state.landingDrift, Math.hypot(d.vx, d.vz));
    }
    if (isLandedAt(emergencyLandingPoint)) {
      state.running = false;
      setPhase("postflight");
      buildPostflightChecklist();
      ui.start.textContent = "飛行後点検";
    }
  }
}
;
}
