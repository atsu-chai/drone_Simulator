const canvas = document.getElementById("simCanvas");

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
  developerMode: document.getElementById("developerModeButton"),
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
    hint: "高度3.5mまで上昇し、5秒間ホバリングしてください。",
    line: "離陸してください。高度3.5mでホバリングしてください。",
  },
  square: {
    title: "スクエア飛行",
    hint: "指定リングを順番に通過し、機首を進行方向に向けてください。",
    line: "スクエア飛行を開始してください。指定経路を維持してください。",
  },
  eight: {
    title: "8の字飛行",
    hint: "高度1.5mを保ち、2つの円を連続して飛行してください。",
    line: "高度1.5mへ移行し、8の字飛行を開始してください。",
  },
  abnormal: {
    title: "異常事態の飛行",
    hint: "水平安定が弱い状態で、指定経路を機首前向きのまま側方移動してください。",
    line: "GNSS・ビジョンOFFを想定します。指定点まで側方移動してください。",
  },
  landing: {
    title: "緊急着陸",
    hint: "最短経路で緊急着陸地点へ移動し、流れを抑えて接地してください。",
    line: "緊急着陸してください。最短経路で指定地点へ降下してください。",
  },
  result: {
    title: "結果",
    hint: "試験結果を確認してください。",
    line: "試験を終了します。",
  },
};

const phaseOrder = ["preflight", "takeoff", "square", "eight", "abnormal", "landing", "result"];

const squareTargets = [
  { key: "squareA", x: 4.8, z: 8.5 },
  { key: "squareB", x: -4.8, z: 8.5 },
  { key: "squareC", x: -4.8, z: 0 },
  { key: "squareD", x: 0, z: 0 },
];

const abnormalTargets = [
  { key: "abnormalA", x: 0, z: 8.5 },
  { key: "abnormalB", x: -5.4, z: 8.5 },
];

const state = {
  mode: "practice",
  phase: "preflight",
  running: false,
  developerMode: true,
  checklistIndex: 0,
  checklistMistakes: 0,
  startTime: 0,
  elapsed: 0,
  hoverTimer: 0,
  squareTimer: 0,
  squareIndex: 0,
  eightProgress: 0,
  abnormalIndex: 0,
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
  threeReady: false,
};

const world = {
  renderer: null,
  scene: null,
  camera: null,
  drone: null,
  shadow: null,
  propellers: [],
  targetRings: {},
  warning: null,
  clock: null,
};

function initThreeWorld() {
  if (!window.THREE) {
    showThreeError();
    return false;
  }

  const THREE = window.THREE;
  world.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  world.renderer.shadowMap.enabled = true;
  world.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  world.scene = new THREE.Scene();
  world.scene.background = new THREE.Color(0x8fbfd0);
  world.scene.fog = new THREE.Fog(0x8fbfd0, 28, 78);

  world.camera = new THREE.PerspectiveCamera(54, 1, 0.1, 120);
  world.clock = new THREE.Clock();

  const hemi = new THREE.HemisphereLight(0xd8f0ff, 0x4b5942, 1.7);
  world.scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0cd, 2.2);
  sun.position.set(-18, 28, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  world.scene.add(sun);

  buildTrainingField(THREE);
  buildDrone(THREE);
  window.addEventListener("resize", resizeRenderer);
  resizeRenderer();
  state.threeReady = true;
  return true;
}

function showThreeError() {
  const fallback = document.createElement("div");
  fallback.className = "engine-error";
  fallback.textContent = "Three.jsを読み込めませんでした。ネットワーク接続を確認して再読み込みしてください。";
  canvas.replaceWith(fallback);
}

function buildTrainingField(THREE) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({ color: 0x617453, roughness: 0.92 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.scene.add(ground);

  const padMat = new THREE.MeshStandardMaterial({ color: 0x2f3930, roughness: 0.85 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xeef6e8 });
  const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.6 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xef6f6c, roughness: 0.5 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x4aa3df, roughness: 0.65 });

  const runway = new THREE.Mesh(new THREE.PlaneGeometry(21, 13), padMat);
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(0, 0.012, 6.5);
  runway.receiveShadow = true;
  world.scene.add(runway);

  for (let z = 0; z <= 13; z += 2.6) {
    addLine(THREE, -10.5, z, 10.5, z, lineMat);
  }
  addLine(THREE, -10.5, 0, -10.5, 13, lineMat);
  addLine(THREE, 10.5, 0, 10.5, 13, lineMat);
  addLine(THREE, 0, 0, 0, 13, lineMat);

  addLandingPad(THREE, 0, 0, "着陸");
  squareTargets.forEach((target) => addTargetRing(THREE, target.x, target.z, 0.8, yellowMat, target.key));
  addPole(THREE, -2.8, 10, redMat);
  addPole(THREE, 2.8, 10, redMat);
  addTargetRing(THREE, -2.8, 10, 1.25, redMat, "left");
  addTargetRing(THREE, 2.8, 10, 1.25, redMat, "right");
  abnormalTargets.forEach((target) => addTargetRing(THREE, target.x, target.z, 0.9, blueMat, target.key));
  addTargetRing(THREE, -5.4, 2.2, 1.1, redMat, "emergencyLanding");

  addGate(THREE, -6.5, 4.5, blueMat);
  addGate(THREE, 6.5, 12.5, blueMat);
  addPilotStand(THREE);
  addFence(THREE);
  addBuildings(THREE);
  addTrees(THREE);
}

function addLine(THREE, x1, z1, x2, z2, material) {
  const length = Math.hypot(x2 - x1, z2 - z1);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.045, length), material);
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = -Math.atan2(z2 - z1, x2 - x1) + Math.PI / 2;
  line.position.set((x1 + x2) / 2, 0.025, (z1 + z2) / 2);
  world.scene.add(line);
}

function addLandingPad(THREE, x, z) {
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 0.045, 64),
    new THREE.MeshStandardMaterial({ color: 0x58c48f, roughness: 0.55 })
  );
  pad.position.set(x, 0.04, z);
  pad.receiveShadow = true;
  world.scene.add(pad);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.035, 10, 64),
    new THREE.MeshBasicMaterial({ color: 0xf7fff8 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, 0.08, z);
  world.scene.add(ring);
  world.targetRings.landing = ring;
}

function addTargetRing(THREE, x, z, radius, material, key) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.04, 12, 72), material);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, 0.09, z);
  world.scene.add(ring);
  world.targetRings[key] = ring;
}

function addPole(THREE, x, z, material) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 16), material);
  pole.position.set(x, 1.1, z);
  pole.castShadow = true;
  world.scene.add(pole);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), material);
  cap.position.set(x, 2.26, z);
  cap.castShadow = true;
  world.scene.add(cap);
}

function addGate(THREE, x, z, material) {
  const group = new THREE.Group();
  const postGeometry = new THREE.BoxGeometry(0.12, 2.4, 0.12);
  const crossGeometry = new THREE.BoxGeometry(2.2, 0.12, 0.12);
  [-1, 1].forEach((side) => {
    const post = new THREE.Mesh(postGeometry, material);
    post.position.set(side * 1.1, 1.2, 0);
    post.castShadow = true;
    group.add(post);
  });
  const cross = new THREE.Mesh(crossGeometry, material);
  cross.position.set(0, 2.35, 0);
  cross.castShadow = true;
  group.add(cross);
  group.position.set(x, 0, z);
  group.rotation.y = x < 0 ? 0.45 : -0.45;
  world.scene.add(group);
}

function addPilotStand(THREE) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x222725, roughness: 0.8 });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 1.6), mat);
  platform.position.set(-7.6, 0.09, -1.7);
  platform.castShadow = true;
  platform.receiveShadow = true;
  world.scene.add(platform);

  const pilot = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 1.1, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.7 })
  );
  pilot.position.set(-7.6, 0.88, -1.7);
  pilot.castShadow = true;
  world.scene.add(pilot);
}

function addFence(THREE) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xdce6d7, roughness: 0.7 });
  const postGeometry = new THREE.BoxGeometry(0.08, 1.1, 0.08);
  for (let x = -18; x <= 18; x += 2) {
    [-8, 23].forEach((z) => {
      const post = new THREE.Mesh(postGeometry, mat);
      post.position.set(x, 0.55, z);
      post.castShadow = true;
      world.scene.add(post);
    });
  }
  for (let z = -8; z <= 23; z += 2) {
    [-18, 18].forEach((x) => {
      const post = new THREE.Mesh(postGeometry, mat);
      post.position.set(x, 0.55, z);
      post.castShadow = true;
      world.scene.add(post);
    });
  }
}

function addBuildings(THREE) {
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0x7a8c96, roughness: 0.82 }),
    new THREE.MeshStandardMaterial({ color: 0xb9c0b4, roughness: 0.82 }),
    new THREE.MeshStandardMaterial({ color: 0x6f8b7c, roughness: 0.82 }),
  ];
  [
    [-24, 2, 4, 5, 6],
    [24, 8, 5, 7, 4],
    [-22, 18, 5, 4, 5],
    [23, 20, 4, 6, 7],
  ].forEach(([x, z, w, h, d], index) => {
    const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[index % mats.length]);
    building.position.set(x, h / 2, z);
    building.castShadow = true;
    building.receiveShadow = true;
    world.scene.add(building);
  });
}

function addTrees(THREE) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x554435, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7f52, roughness: 0.85 });
  for (let i = 0; i < 26; i += 1) {
    const angle = i * 1.91;
    const x = Math.cos(angle) * (21 + (i % 4));
    const z = Math.sin(angle) * (17 + (i % 5)) + 8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.4, 8), trunkMat);
    trunk.position.set(x, 0.7, z);
    trunk.castShadow = true;
    world.scene.add(trunk);
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 12), leafMat);
    leaves.position.set(x, 2.25, z);
    leaves.castShadow = true;
    world.scene.add(leaves);
  }
}

function buildDrone(THREE) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf0f5ee, metalness: 0.25, roughness: 0.42 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x151817, metalness: 0.2, roughness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x58c48f, roughness: 0.4 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.18, 0.5), bodyMat);
  body.castShadow = true;
  group.add(body);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.24), accentMat);
  nose.position.set(0, 0.03, -0.34);
  nose.castShadow = true;
  group.add(nose);

  const armGeometry = new THREE.BoxGeometry(1.55, 0.06, 0.08);
  [-0.48, 0.48].forEach((z, index) => {
    const arm = new THREE.Mesh(armGeometry, darkMat);
    arm.position.z = z;
    arm.rotation.y = index === 0 ? 0.34 : -0.34;
    arm.castShadow = true;
    group.add(arm);
  });

  const motorGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 20);
  const propGeometry = new THREE.BoxGeometry(0.7, 0.018, 0.08);
  [
    [-0.72, -0.56],
    [0.72, -0.56],
    [-0.72, 0.56],
    [0.72, 0.56],
  ].forEach(([x, z], index) => {
    const motor = new THREE.Mesh(motorGeometry, darkMat);
    motor.position.set(x, 0.02, z);
    motor.rotation.x = Math.PI / 2;
    motor.castShadow = true;
    group.add(motor);

    const prop = new THREE.Mesh(propGeometry, accentMat);
    prop.position.set(x, 0.11, z);
    prop.rotation.y = index % 2 ? Math.PI / 2 : 0;
    prop.castShadow = true;
    group.add(prop);
    world.propellers.push(prop);
  });

  world.shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false })
  );
  world.shadow.rotation.x = -Math.PI / 2;
  world.shadow.position.y = 0.035;
  world.scene.add(world.shadow);

  world.drone = group;
  world.scene.add(group);
}

function resizeRenderer() {
  if (!world.renderer || !world.camera) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  world.renderer.setSize(width, height, false);
  world.camera.aspect = width / height;
  world.camera.updateProjectionMatrix();
}

function updateThreeWorld(dt) {
  if (!state.threeReady) return;
  const THREE = window.THREE;
  const d = state.drone;
  world.drone.position.set(d.x, d.y + 0.18, d.z);
  world.drone.rotation.set(-d.vz * 0.035, d.yaw, -d.vx * 0.035);

  world.propellers.forEach((prop, index) => {
    prop.rotation.y += (index % 2 ? -1 : 1) * (18 + Math.abs(d.vy) * 8) * dt;
  });

  world.shadow.position.set(d.x, 0.04, d.z);
  const shadowScale = clamp(1.15 - d.y * 0.12, 0.35, 1.15);
  world.shadow.scale.set(shadowScale, shadowScale, shadowScale);
  world.shadow.material.opacity = clamp(0.28 - d.y * 0.045, 0.07, 0.28);

  Object.entries(world.targetRings).forEach(([key, ring]) => {
    const currentSquare = squareTargets[state.squareIndex]?.key;
    const currentAbnormal = abnormalTargets[state.abnormalIndex]?.key;
    const active =
      (state.phase === "square" && key === currentSquare) ||
      (state.phase === "eight" && (key === "left" || key === "right")) ||
      (state.phase === "abnormal" && key === currentAbnormal) ||
      (state.phase === "landing" && key === "emergencyLanding");
    ring.scale.setScalar(active ? 1 + Math.sin(performance.now() / 180) * 0.04 : 1);
  });

  const pilotEye = new THREE.Vector3(-7.8, 2.1, -4.4);
  const chase = new THREE.Vector3(d.x - Math.sin(d.yaw) * 3.8, d.y + 2.2, d.z - Math.cos(d.yaw) * 5.2);
  const cameraTarget = state.phase === "preflight" ? pilotEye : pilotEye.lerp(chase, 0.48);
  world.camera.position.lerp(cameraTarget, 0.065);
  world.camera.lookAt(d.x, Math.max(0.8, d.y + 0.35), d.z + 1.8);
  world.renderer.render(world.scene, world.camera);
}

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
  state.lastPhaseChange = performance.now();
  const copy = phases[phase];
  ui.phaseTitle.textContent = copy.title;
  ui.phaseHint.textContent = copy.hint;
  ui.examiner.textContent = copy.line;
  ui.missions.forEach((item) => {
    item.classList.toggle("current", item.dataset.phase === phase);
    item.classList.toggle("done", phaseOrder.indexOf(item.dataset.phase) < phaseOrder.indexOf(phase));
  });
}

function reset() {
  state.phase = "preflight";
  state.running = false;
  state.checklistIndex = 0;
  state.checklistMistakes = 0;
  state.elapsed = 0;
  state.hoverTimer = 0;
  state.squareTimer = 0;
  state.squareIndex = 0;
  state.eightProgress = 0;
  state.abnormalIndex = 0;
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
    ui.examiner.textContent = "外部コントローラーを接続してください。開発者モードではキーボード操作で開始できます。";
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
  state.inputReady = Boolean(pad || state.developerMode);
  if (pad) {
    ui.controller.textContent = `接続中: ${pad.id}`;
    ui.controller.classList.add("ready");
  } else if (state.developerMode) {
    ui.controller.textContent = "開発者モード: キーボード操作";
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
  if (state.developerMode) {
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
  const forwardX = Math.sin(d.yaw);
  const forwardZ = Math.cos(d.yaw);
  const rightX = Math.cos(d.yaw);
  const rightZ = -Math.sin(d.yaw);
  d.vx += (input.forward * forwardX + input.strafe * rightX) * horizontalPower * dt;
  d.vz += (input.forward * forwardZ + input.strafe * rightZ) * horizontalPower * dt;
  d.vy += input.throttle * 3.8 * dt;
  d.yaw += input.yaw * 1.8 * dt;

  if (Math.abs(input.forward) + Math.abs(input.strafe) > 0.2) {
    d.vy -= 0.55 * dt;
  }

  const horizontalDamping = state.phase === "abnormal" || state.phase === "landing" ? 0.93 : 0.86;
  d.vx *= Math.pow(horizontalDamping, dt * 8);
  d.vz *= Math.pow(horizontalDamping, dt * 8);
  d.vy *= Math.pow(0.82, dt * 8);

  if (state.phase === "abnormal" || state.phase === "landing") {
    d.vx += Math.sin(performance.now() / 900) * 0.18 * dt;
    d.vz += Math.cos(performance.now() / 1100) * 0.12 * dt;
  }

  d.x = clamp(d.x + d.vx * dt, -10.5, 10.5);
  d.z = clamp(d.z + d.vz * dt, -2, 18);
  d.y = clamp(d.y + d.vy * dt, 0, 4);
  if (d.y === 0) d.vy = Math.max(0, d.vy);

  const jitter = Math.abs(d.y - targetAltitude());
  if (state.running && state.phase !== "landing") {
    state.maxAltitudeJitter = Math.max(state.maxAltitudeJitter, jitter);
  }
}

function updateMission(dt) {
  if (!state.running) return;
  const d = state.drone;
  state.elapsed = (performance.now() - state.startTime) / 1000;

  if (state.phase === "takeoff") {
    if (Math.abs(d.y - 3.5) < 0.22 && Math.hypot(d.vx, d.vz, d.vy) < 0.45) {
      state.hoverTimer += dt;
    } else {
      state.hoverTimer = Math.max(0, state.hoverTimer - dt);
    }
    if (state.hoverTimer > 5) setPhase("square");
  }

  if (state.phase === "square") {
    const target = squareTargets[state.squareIndex];
    const distance = target ? Math.hypot(d.x - target.x, d.z - target.z) : 0;
    if (target && distance < 0.9 && Math.abs(d.y - 3.5) < 0.45) {
      state.squareTimer += dt;
    } else {
      state.squareTimer = Math.max(0, state.squareTimer - dt * 0.5);
    }
    if (state.squareTimer > 0.8) {
      state.squareIndex += 1;
      state.squareTimer = 0;
      if (state.squareIndex >= squareTargets.length) {
        setPhase("eight");
      } else {
        ui.examiner.textContent = `次のスクエア地点へ移動してください。${state.squareIndex + 1}/${squareTargets.length}`;
      }
    }
  }

  if (state.phase === "eight") {
    const left = Math.hypot(d.x + 2.8, d.z - 10);
    const right = Math.hypot(d.x - 2.8, d.z - 10);
    if (Math.abs(d.y - 1.5) < 0.45) {
      if (state.eightProgress === 0 && left < 1.3) state.eightProgress = 1;
      if (state.eightProgress === 1 && right < 1.3) state.eightProgress = 2;
      if (state.eightProgress === 2 && Math.hypot(d.x, d.z - 8) < 1.1) setPhase("abnormal");
    }
  }

  if (state.phase === "abnormal") {
    const target = abnormalTargets[state.abnormalIndex];
    const distance = target ? Math.hypot(d.x - target.x, d.z - target.z) : 0;
    if (target && distance < 0.9 && Math.abs(d.y - 3.5) < 0.55) {
      state.abnormalIndex += 1;
      if (state.abnormalIndex >= abnormalTargets.length) {
        setPhase("landing");
      } else {
        ui.examiner.textContent = "機首前向きのまま、次の側方移動点へ進んでください。";
      }
    }
  }

  if (state.phase === "landing") {
    state.landingDrift = Math.max(state.landingDrift, Math.hypot(d.vx, d.vz));
    if (Math.hypot(d.x + 5.4, d.z - 2.2) < 0.9 && d.y < 0.08 && Math.hypot(d.vx, d.vz) < 0.55) {
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
  if (state.squareIndex < squareTargets.length) {
    score -= 14;
    feedback.push("スクエア飛行の指定経路を完了できていません。次のリングを見失わないよう、進行方向と高度を保ってください。");
  }
  if (state.abnormalIndex < abnormalTargets.length) {
    score -= 14;
    feedback.push("異常事態の飛行で指定側方移動を完了できていません。安定機能が弱い状態での惰性を早めに抑えてください。");
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

function loop() {
  const dt = world.clock ? Math.min(0.033, world.clock.getDelta()) : 0.016;
  updateControllerStatus();
  const input = readInput();
  updatePhysics(dt, input);
  updateMission(dt);
  updateThreeWorld(dt);
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

function targetAltitude() {
  if (state.phase === "eight") return 1.5;
  if (state.phase === "landing") return 0;
  if (state.phase === "preflight" || state.phase === "result") return state.drone.y;
  return 3.5;
}

ui.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
ui.start.addEventListener("click", startExam);
ui.reset.addEventListener("click", reset);
ui.developerMode.addEventListener("click", () => {
  state.developerMode = !state.developerMode;
  ui.developerMode.classList.toggle("active", state.developerMode);
  ui.developerMode.textContent = state.developerMode
    ? "開発者モード: キーボード操作 ON"
    : "開発者モード: キーボード操作 OFF";
});
window.addEventListener("keydown", (event) => {
  if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }
  state.keys.add(event.code);
});
window.addEventListener("keyup", (event) => state.keys.delete(event.code));
window.addEventListener("gamepadconnected", updateControllerStatus);
window.addEventListener("gamepaddisconnected", updateControllerStatus);

initThreeWorld();
reset();
setMode("practice");
requestAnimationFrame(loop);
