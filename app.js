const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  modeBadge: document.getElementById("modeBadge"),
  phaseTitle: document.getElementById("phaseTitle"),
  phaseHint: document.getElementById("phaseHint"),
  altitude: document.getElementById("altitudeReadout"),
  speed: document.getElementById("speedReadout"),
  time: document.getElementById("timeReadout"),
  examiner: document.getElementById("examinerLine"),
  checklist: document.getElementById("checklist"),
  start: document.getElementById("startButton"),
  reset: document.getElementById("resetButton"),
  preset: document.getElementById("presetSelect"),
  controller: document.getElementById("controllerStatus"),
  keyboardDemo: document.getElementById("keyboardDemoButton"),
  missions: [...document.querySelectorAll("#missionList li")],
  resultPanel: document.getElementById("resultPanel"),
  passFail: document.getElementById("passFail"),
  score: document.getElementById("scoreValue"),
  finalTime: document.getElementById("finalTime"),
  feedback: document.getElementById("feedbackList"),
  modeButtons: [...document.querySelectorAll("[data-mode]")],
};

const checklistItems = [
  "機体外観、プロペラ、アームの損傷確認",
  "バッテリー残量と固定状態の確認",
  "送信機と機体の接続確認",
  "飛行エリアと安全距離の確認",
  "コンパス、GNSS、フェールセーフ状態の確認",
  "試験官への準備完了申告",
];

const phases = {
  preflight: {
    title: "飛行前点検",
    hint: "点検項目を正しい順序で進めてください。",
    line: "飛行前点検を開始してください。",
  },
  takeoff: {
    title: "離陸",
    hint: "高度1.5mまで上昇し、3秒間ホバリングしてください。",
    line: "離陸してください。高度を安定させてください。",
  },
  move: {
    title: "移動",
    hint: "前方の停止位置へ移動し、姿勢と高度を保ってください。",
    line: "前方の停止位置まで移動してください。",
  },
  eight: {
    title: "8の字",
    hint: "2本の標識を回り、中央へ戻ってください。",
    line: "8の字飛行を開始してください。",
  },
  landing: {
    title: "着陸",
    hint: "着陸地点へ戻り、流れを抑えて接地してください。",
    line: "着陸地点へ移動し、着陸してください。",
  },
  result: {
    title: "結果",
    hint: "試験結果を確認してください。",
    line: "試験を終了します。",
  },
};

const state = {
  mode: "practice",
  phase: "preflight",
  running: false,
  keyboardDemo: false,
  checklistIndex: 0,
  checklistMistakes: 0,
  startTime: 0,
  elapsed: 0,
  phaseStart: 0,
  hoverTimer: 0,
  moveTimer: 0,
  eightProgress: 0,
  landingDrift: 0,
  maxAltitudeJitter: 0,
  responseDelays: [],
  lastPhaseChange: performance.now(),
  drone: {
    x: 0,
    z: 0,
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw: 0,
  },
  keys: new Set(),
  inputReady: false,
};

function buildChecklist() {
  ui.checklist.innerHTML = "";
  checklistItems.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = index === 0 ? "" : "locked";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item;
    button.addEventListener("click", () => confirmChecklist(index));
    li.appendChild(button);
    ui.checklist.appendChild(li);
  });
}

function confirmChecklist(index) {
  if (state.phase !== "preflight") return;
  if (index !== state.checklistIndex) {
    state.checklistMistakes += 1;
    ui.examiner.textContent = "点検順序が違います。正しい手順に戻ってください。";
    return;
  }
  const items = [...ui.checklist.children];
  items[index].className = "done";
  state.checklistIndex += 1;
  if (items[state.checklistIndex]) items[state.checklistIndex].className = "";
  if (state.checklistIndex === checklistItems.length) {
    ui.examiner.textContent = "点検完了。試験を開始できます。";
    ui.start.disabled = false;
  }
}

function setMode(mode) {
  state.mode = mode;
  ui.modeBadge.textContent = mode === "practice" ? "練習モード" : "本番モード";
  ui.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
}

function setPhase(phase) {
  state.phase = phase;
  state.phaseStart = performance.now();
  state.lastPhaseChange = state.phaseStart;
  const copy = phases[phase];
  ui.phaseTitle.textContent = copy.title;
  ui.phaseHint.textContent = copy.hint;
  ui.examiner.textContent = copy.line;
  ui.missions.forEach((item) => {
    item.classList.toggle("current", item.dataset.phase === phase);
    item.classList.toggle("done", phaseOrder.indexOf(item.dataset.phase) < phaseOrder.indexOf(phase));
  });
}

const phaseOrder = ["preflight", "takeoff", "move", "eight", "landing", "result"];

function reset() {
  state.phase = "preflight";
  state.running = false;
  state.checklistIndex = 0;
  state.checklistMistakes = 0;
  state.elapsed = 0;
  state.hoverTimer = 0;
  state.moveTimer = 0;
  state.eightProgress = 0;
  state.landingDrift = 0;
  state.maxAltitudeJitter = 0;
  state.responseDelays = [];
  Object.assign(state.drone, { x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, yaw: 0 });
  ui.resultPanel.hidden = true;
  ui.start.disabled = true;
  ui.start.textContent = "試験を開始";
  buildChecklist();
  setPhase("preflight");
}

function startExam() {
  if (state.checklistIndex < checklistItems.length) {
    ui.examiner.textContent = "飛行前点検が完了していません。";
    return;
  }
  if (!state.inputReady) {
    ui.examiner.textContent = "外部コントローラーを接続してください。プロトタイプ確認時のみキーボード入力を利用できます。";
    return;
  }
  state.running = true;
  state.startTime = performance.now();
  state.responseDelays = [];
  ui.start.textContent = "試験中";
  ui.start.disabled = true;
  setPhase("takeoff");
}

function getGamepad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
  return pads.find(Boolean);
}

function updateControllerStatus() {
  const pad = getGamepad();
  state.inputReady = Boolean(pad || state.keyboardDemo);
  if (pad) {
    ui.controller.textContent = `接続中: ${pad.id}`;
    ui.controller.classList.add("ready");
  } else if (state.keyboardDemo) {
    ui.controller.textContent = "プロトタイプ用キーボード入力";
    ui.controller.classList.add("ready");
  } else {
    ui.controller.textContent = "外部コントローラー未接続";
    ui.controller.classList.remove("ready");
  }
}

function readInput() {
  const pad = getGamepad();
  const input = { throttle: 0, forward: 0, strafe: 0, yaw: 0 };
  if (pad) {
    const axes = pad.axes.map((value) => Math.abs(value) < 0.08 ? 0 : value);
    const preset = ui.preset.value;
    if (preset === "mode2") {
      input.throttle = -(axes[1] || 0);
      input.yaw = axes[0] || 0;
      input.forward = -(axes[3] || 0);
      input.strafe = axes[2] || 0;
    } else {
      input.throttle = -(axes[1] || 0);
      input.forward = -(axes[3] || 0);
      input.strafe = axes[2] || 0;
      input.yaw = axes[0] || 0;
    }
  }
  if (state.keyboardDemo) {
    input.throttle += (state.keys.has("KeyE") ? 1 : 0) - (state.keys.has("KeyQ") ? 1 : 0);
    input.forward += (state.keys.has("KeyW") ? 1 : 0) - (state.keys.has("KeyS") ? 1 : 0);
    input.strafe += (state.keys.has("KeyD") ? 1 : 0) - (state.keys.has("KeyA") ? 1 : 0);
    input.yaw += (state.keys.has("ArrowRight") ? 1 : 0) - (state.keys.has("ArrowLeft") ? 1 : 0);
  }
  input.throttle = clamp(input.throttle, -1, 1);
  input.forward = clamp(input.forward, -1, 1);
  input.strafe = clamp(input.strafe, -1, 1);
  input.yaw = clamp(input.yaw, -1, 1);
  return input;
}

function updatePhysics(dt, input) {
  const d = state.drone;
  const hasPilotInput = Math.abs(input.throttle) + Math.abs(input.forward) + Math.abs(input.strafe) + Math.abs(input.yaw) > 0.12;
  if (state.running && hasPilotInput && state.responseDelays.length < phaseOrder.length) {
    state.responseDelays.push((performance.now() - state.lastPhaseChange) / 1000);
  }

  const horizontalPower = d.y > 0.08 ? 6.5 : 0;
  d.vx += input.strafe * horizontalPower * dt;
  d.vz += input.forward * horizontalPower * dt;
  d.vy += input.throttle * 3.8 * dt;
  d.yaw += input.yaw * 1.8 * dt;

  if (Math.abs(input.forward) + Math.abs(input.strafe) > 0.2) {
    d.vy -= 0.55 * dt;
  }

  d.vx *= Math.pow(0.86, dt * 8);
  d.vz *= Math.pow(0.86, dt * 8);
  d.vy *= Math.pow(0.82, dt * 8);

  d.x = clamp(d.x + d.vx * dt, -8, 8);
  d.z = clamp(d.z + d.vz * dt, -2, 18);
  d.y = clamp(d.y + d.vy * dt, 0, 4);
  if (d.y === 0) d.vy = Math.max(0, d.vy);

  const jitter = Math.abs(d.y - 1.5);
  if (state.running && state.phase !== "landing") {
    state.maxAltitudeJitter = Math.max(state.maxAltitudeJitter, jitter);
  }
}

function updateMission(dt) {
  if (!state.running) return;
  const d = state.drone;
  state.elapsed = (performance.now() - state.startTime) / 1000;

  if (state.phase === "takeoff") {
    if (Math.abs(d.y - 1.5) < 0.22 && Math.hypot(d.vx, d.vz, d.vy) < 0.45) {
      state.hoverTimer += dt;
    } else {
      state.hoverTimer = Math.max(0, state.hoverTimer - dt);
    }
    if (state.hoverTimer > 3) setPhase("move");
  }

  if (state.phase === "move") {
    const distance = Math.hypot(d.x - 0, d.z - 8);
    if (distance < 0.8 && Math.abs(d.y - 1.5) < 0.35) {
      state.moveTimer += dt;
    } else {
      state.moveTimer = Math.max(0, state.moveTimer - dt * 0.5);
    }
    if (state.moveTimer > 2) setPhase("eight");
  }

  if (state.phase === "eight") {
    const left = Math.hypot(d.x + 2.8, d.z - 10);
    const right = Math.hypot(d.x - 2.8, d.z - 10);
    if (state.eightProgress === 0 && left < 1.3) state.eightProgress = 1;
    if (state.eightProgress === 1 && right < 1.3) state.eightProgress = 2;
    if (state.eightProgress === 2 && Math.hypot(d.x, d.z - 8) < 1.1) setPhase("landing");
  }

  if (state.phase === "landing") {
    state.landingDrift = Math.max(state.landingDrift, Math.hypot(d.vx, d.vz));
    if (Math.hypot(d.x, d.z) < 0.8 && d.y < 0.08 && Math.hypot(d.vx, d.vz) < 0.55) {
      finishExam();
    }
  }
}

function finishExam() {
  state.running = false;
  setPhase("result");
  const feedback = [];
  let score = 100;

  if (state.checklistMistakes > 0) {
    score -= state.checklistMistakes * 8;
    feedback.push("点検手順に順序ミスがあります。声に出して確認順を固定してください。");
  }
  if (state.maxAltitudeJitter > 0.65) {
    score -= 16;
    feedback.push("高度維持が不安定です。水平移動時のスロットル補正を小さく早めに入れてください。");
  }
  if (state.landingDrift > 0.9) {
    score -= 18;
    feedback.push("着陸時に機体が流れる傾向があります。接地前に水平速度を十分に落としてください。");
  }
  const avgResponse = average(state.responseDelays);
  if (avgResponse > 2.8) {
    score -= 10;
    feedback.push("指示から操作開始までに時間がかかっています。次の課題姿勢を早めに準備してください。");
  }
  if (state.elapsed > 180) {
    score -= 10;
    feedback.push("所要時間が長めです。停止位置の手前から減速を始めてください。");
  }
  if (feedback.length === 0) {
    feedback.push("大きな減点傾向はありません。次は本番モードで途中表示なしに挑戦してください。");
  }

  score = Math.max(0, Math.round(score));
  ui.resultPanel.hidden = false;
  ui.passFail.textContent = score >= 70 ? "合格" : "不合格";
  ui.score.textContent = `${score} / 100`;
  ui.finalTime.textContent = formatTime(state.elapsed);
  ui.feedback.innerHTML = feedback.map((item) => `<li>${item}</li>`).join("");
}

function drawScene() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const horizon = h * 0.42;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#86b7c4");
  sky.addColorStop(1, "#b9d2c5");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, horizon);

  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, "#65785f");
  ground.addColorStop(1, "#2f4034");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, w, h - horizon);

  drawRunway();
  drawMarker(0, 0, "#58c48f", "着陸");
  drawMarker(0, 8, "#f2c94c", "停止");
  drawMarker(-2.8, 10, "#ef6f6c", "8");
  drawMarker(2.8, 10, "#ef6f6c", "8");
  drawDrone();
  drawMiniMap();
}

function project(x, z, y = 0) {
  const scale = 42 / (1 + z * 0.09);
  return {
    x: canvas.width / 2 + x * scale,
    y: canvas.height * 0.78 - z * 18 - y * 74,
    s: scale,
  };
}

function drawRunway() {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  for (let z = 0; z <= 18; z += 2) {
    const a = project(-5, z);
    const b = project(5, z);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.46)";
  [-5, 5, 0].forEach((x) => {
    ctx.beginPath();
    for (let z = 0; z <= 18; z += 0.5) {
      const p = project(x, z);
      if (z === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  });
  ctx.restore();
}

function drawMarker(x, z, color, label) {
  const p = project(x, z);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, p.s * 0.35, p.s * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#101510";
  ctx.font = "700 14px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(label, p.x, p.y + 5);
  ctx.restore();
}

function drawDrone() {
  const d = state.drone;
  const p = project(d.x, d.z, d.y);
  const size = clamp(p.s * (0.52 + d.y * 0.06), 20, 56);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(d.yaw);
  ctx.shadowColor = "rgba(0,0,0,0.42)";
  ctx.shadowBlur = 12;
  ctx.strokeStyle = "#111714";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-size, -size * 0.52);
  ctx.lineTo(size, size * 0.52);
  ctx.moveTo(size, -size * 0.52);
  ctx.lineTo(-size, size * 0.52);
  ctx.stroke();
  ctx.fillStyle = "#edf4ea";
  ctx.strokeStyle = "#121812";
  ctx.lineWidth = 3;
  ctx.fillRect(-size * 0.38, -size * 0.22, size * 0.76, size * 0.44);
  ctx.strokeRect(-size * 0.38, -size * 0.22, size * 0.76, size * 0.44);
  [[-1, -0.52], [1, -0.52], [-1, 0.52], [1, 0.52]].forEach(([sx, sy]) => {
    ctx.beginPath();
    ctx.ellipse(sx * size, sy * size, size * 0.36, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,24,22,0.88)";
    ctx.fill();
  });
  ctx.restore();

  const shadow = project(d.x, d.z, 0);
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${clamp(0.28 - d.y * 0.04, 0.08, 0.28)})`;
  ctx.beginPath();
  ctx.ellipse(shadow.x, shadow.y + 12, size * 0.8, size * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMiniMap() {
  const x = 18;
  const y = canvas.height - 178;
  const w = 160;
  const h = 150;
  ctx.save();
  ctx.fillStyle = "rgba(18,22,19,0.72)";
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#b9c0b4";
  ctx.font = "12px system-ui";
  ctx.fillText("位置", x + 12, y + 22);
  const px = x + w / 2 + state.drone.x * 7;
  const py = y + h - 22 - state.drone.z * 6;
  ctx.fillStyle = "#58c48f";
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.26)";
  ctx.strokeRect(x + 28, y + 32, 104, 94);
  ctx.restore();
}

function renderReadouts() {
  const d = state.drone;
  ui.altitude.textContent = `${d.y.toFixed(1)}m`;
  ui.speed.textContent = `${Math.hypot(d.vx, d.vz, d.vy).toFixed(1)}m/s`;
  ui.time.textContent = formatTime(state.elapsed);

  if (state.mode === "exam" && state.running) {
    ui.phaseHint.textContent = "課題終了まで減点内容は表示されません。";
  } else if (state.phase !== "result") {
    ui.phaseHint.textContent = phases[state.phase].hint;
  }
}

function loop(now) {
  const dt = Math.min(0.033, (now - (loop.last || now)) / 1000);
  loop.last = now;
  updateControllerStatus();
  const input = readInput();
  updatePhysics(dt, input);
  updateMission(dt);
  drawScene();
  renderReadouts();
  requestAnimationFrame(loop);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const min = String(Math.floor(whole / 60)).padStart(2, "0");
  const sec = String(whole % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

ui.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
ui.start.addEventListener("click", startExam);
ui.reset.addEventListener("click", reset);
ui.keyboardDemo.addEventListener("click", () => {
  state.keyboardDemo = !state.keyboardDemo;
  ui.keyboardDemo.textContent = state.keyboardDemo
    ? "キーボード入力を停止"
    : "プロトタイプ用キーボード入力を使う";
});
window.addEventListener("keydown", (event) => state.keys.add(event.code));
window.addEventListener("keyup", (event) => state.keys.delete(event.code));
window.addEventListener("gamepadconnected", updateControllerStatus);
window.addEventListener("gamepaddisconnected", updateControllerStatus);

reset();
setMode("practice");
requestAnimationFrame(loop);
