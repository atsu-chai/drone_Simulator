import { versions, course, squarePath, createEvaluation, evaluateSample, normalizedAxis, calibrationValid, subjects, historyStore, routeDistance } from "./src/training.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

const canvas = document.getElementById("simCanvas");

const ui = {
  modeBadge: document.getElementById("modeBadge"),
  phaseTitle: document.getElementById("phaseTitle"),
  phaseHint: document.getElementById("phaseHint"),
  altitude: document.getElementById("altitudeReadout"),
  speed: document.getElementById("speedReadout"),
  time: document.getElementById("timeReadout"),
  taskTime: document.getElementById("taskTimeReadout"),
  battery: document.getElementById("batteryReadout"),
  stability: document.getElementById("stabilityReadout"),
  examiner: document.getElementById("examinerLine"),
  checklistTitle: document.getElementById("checklistTitle"),
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
  downloadLog: document.getElementById("downloadLogButton"),
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

const postflightItems = [
  "機体外観、プロペラ、機器取付状態の確認",
  "バッテリーと機体の異常発熱、汚損の確認",
  "飛行経路、飛行時間、異常の有無を記録",
];

const phases = {
  preflight: {
    title: "飛行前点検",
    hint: "点検項目を正しい順序で進めてください。",
    line: "飛行前点検を開始してください。",
  },
  takeoff: {
    title: "スクエア飛行: 離陸",
    hint: "高度3.5mまで上昇し、5秒間ホバリングしてください。",
    line: "離陸してください。高度3.5mでホバリングしてください。",
  },
  square: {
    title: "スクエア飛行",
    hint: "13m×5mのA-B-C-D-E-A経路を直線飛行してください。",
    line: "スクエア飛行を開始してください。機首を進行方向へ向けてください。",
  },
  squareLanding: {
    title: "スクエア飛行: 着陸",
    hint: "A点へ戻り、流れを抑えて着陸してください。",
    line: "スクエア飛行を終了し、A点へ着陸してください。",
  },
  eightTakeoff: {
    title: "8の字飛行: 離陸",
    hint: "高度1.5mまで上昇し、5秒間ホバリングしてください。",
    line: "再離陸し、高度1.5mで5秒間ホバリングしてください。",
  },
  eight: {
    title: "8の字飛行",
    hint: "直径約5mの2つの円を、機首を進行方向へ向けて連続2周してください。",
    line: "8の字飛行を2周実施してください。",
  },
  eightLanding: {
    title: "8の字飛行: 着陸",
    hint: "A点へ戻り、安全に着陸してください。",
    line: "8の字飛行を終了し、A点へ着陸してください。",
  },
  abnormalTakeoff: {
    title: "異常事態飛行: 離陸",
    hint: "位置安定OFFで高度3.5mまで上昇し、5秒間ホバリングしてください。",
    line: "水平方向の位置安定機能をOFFにします。離陸してください。",
  },
  abnormal: {
    title: "異常事態の飛行",
    hint: "機首を前方へ固定し、F–G–Fの経路を側方に1往復以上飛行してください。",
    line: "機首方位を維持したまま、側方移動を1往復してください。",
  },
  emergencyHover: {
    title: "緊急事態宣言",
    hint: "その場で水平位置と高度3.5mを維持してください。",
    line: "緊急事態を宣言します。その場でホバリングしてください。",
  },
  landing: {
    title: "緊急着陸",
    hint: "最短経路でHのコーン横へ移動し、流れを抑えて接地してください。",
    line: "緊急着陸してください。最短経路でHのコーン横の指定地点へ降下してください。",
  },
  postflight: {
    title: "飛行後点検・記録",
    hint: "機体点検と飛行記録を正しい順序で完了してください。",
    line: "飛行後点検と飛行記録を実施してください。",
  },
  demoLanding: { title: "無料体験：着陸", hint: "A点へ静かに着陸してください。", line: "ホバリング完了。A点へ着陸してください。" },
  result: {
    title: "結果",
    hint: "試験結果を確認してください。",
    line: "試験を終了します。",
  },
};

const phaseMission = {
  preflight: "preflight",
  takeoff: "square",
  square: "square",
  squareLanding: "square",
  eightTakeoff: "eight",
  eight: "eight",
  eightLanding: "eight",
  abnormalTakeoff: "abnormal",
  abnormal: "abnormal",
  emergencyHover: "abnormal",
  landing: "abnormal",
  postflight: "postflight",
  demoLanding: "square",
  result: "result",
};

const missionOrder = ["preflight", "square", "eight", "abnormal", "postflight", "result"];
const taskLimits = { square: 8 * 60, eight: 8 * 60, abnormal: 6 * 60 };

const squareTargets = squarePath.slice(1).map((point, index) => ({
  ...point,
  key: `square${point.label}${index}`,
}));

const figureEightLap = [
  { x: -2.5, z: 11 },
  { x: -5, z: 8.5 },
  { x: -2.5, z: 6 },
  { x: 0, z: 8.5 },
  { x: 2.5, z: 11 },
  { x: 5, z: 8.5 },
  { x: 2.5, z: 6 },
  { x: 0, z: 8.5 },
];

const figureEightTargets = [
  { x: 0, z: 8.5 },
  ...figureEightLap,
  ...figureEightLap,
];

const abnormalTargets = [
  { key: "abnormalSetup", x: 0, z: 5 },
  { key: "abnormalOut", x: -5, z: 5 },
  { key: "abnormalReturn", x: 0, z: 5 },
];

const takeoffPoint = { x: 0, z: 0 };
const emergencyLandingPoint = { x: -5.4, z: 2.2 };
const wind = { speedMps: 0, directionDeg: 30 };

const flightModel = {
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

const state = {
  mode: "practice",
  phase: "preflight",
  running: false,
  paused: false,
  subject: "demo",
  calibration: null,
  evaluation: createEvaluation(),
  interrupted: false,
  developerMode: false,
  checklistIndex: 0,
  postflightIndex: 0,
  checklistMistakes: 0,
  startTime: 0,
  elapsed: 0,
  hoverTimer: 0,
  squareTimer: 0,
  squareIndex: 0,
  eightIndex: 0,
  abnormalIndex: 0,
  emergencyHoverTimer: 0,
  taskStartTime: 0,
  taskElapsed: 0,
  taskTimes: {},
  timeLimitExceeded: null,
  landingDrift: 0,
  altitudeErrorSquared: 0,
  altitudeSampleTime: 0,
  headingErrorSquared: 0,
  headingSampleTime: 0,
  hardLandingSpeed: 0,
  boundaryViolations: 0,
  responseDelays: [],
  respondedPhase: null,
  lastPhaseChange: 0,
  physicsAccumulator: 0,
  simulationTime: 0,
  batteryPct: 100,
  flightRecords: [],
  lastLogSecond: -1,
  command: {
    throttle: 0,
    forward: 0,
    strafe: 0,
    yaw: 0,
  },
  drone: {
    x: 0,
    z: 0,
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw: 0,
    yawRate: 0,
    roll: 0,
    pitch: 0,
    rollRate: 0,
    pitchRate: 0,
    thrustNewtons: 0,
  },
  keys: new Set(),
  inputReady: false,
  threeReady: false,
};

const world = {
  renderer: null,
  boundaryGroup: null,
  boundaryKey: null,
  scene: null,
  camera: null,
  drone: null,
  droneFallback: null,
  droneMixer: null,
  shadow: null,
  propellers: [],
  rotorDiscs: [],
  courseMarkers: [],
  clock: null,
  cameraLookTarget: null,
  cameraDesiredTarget: null,
  pilotEye: null,
};

function initThreeWorld() {
  try {
    world.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch (error) {
    console.error(error);
    showThreeError();
    return false;
  }
  world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  world.renderer.outputColorSpace = THREE.SRGBColorSpace;
  world.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  world.renderer.toneMappingExposure = 1.05;
  world.renderer.shadowMap.enabled = true;
  world.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  world.scene = new THREE.Scene();
  world.scene.background = new THREE.Color(0xa5bec3);
  world.scene.fog = new THREE.Fog(0xa5b7b3, 34, 86);

  world.camera = new THREE.PerspectiveCamera(54, 1, 0.1, 120);
  world.clock = new THREE.Clock();
  world.cameraLookTarget = new THREE.Vector3(0, 1, 0);
  world.cameraDesiredTarget = new THREE.Vector3(0, 1, 0);
  world.pilotEye = new THREE.Vector3(0, 2.05, -8.5);
  world.camera.position.copy(world.pilotEye);

  const hemi = new THREE.HemisphereLight(0xd8f0ff, 0x465044, 0.55);
  world.scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d2, 2.8);
  sun.position.set(-18, 28, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  world.scene.add(sun);

  loadEnvironment();
  buildTrainingField();
  buildDrone();
  window.addEventListener("resize", resizeRenderer);
  resizeRenderer();
  state.threeReady = true;
  return true;
}

function loadEnvironment() {
  new RGBELoader().load(
    "assets/environment/suburban-field-01-1k.hdr",
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      world.scene.environment = texture;
      world.scene.background = texture;
      world.scene.backgroundBlurriness = 0.16;
      world.scene.backgroundIntensity = 0.82;
    },
    undefined,
    (error) => console.warn("HDR環境光を読み込めませんでした。", error)
  );
}

function showThreeError() {
  const fallback = document.createElement("div");
  fallback.className = "engine-error";
  fallback.textContent = "Three.jsを読み込めませんでした。ネットワーク接続を確認して再読み込みしてください。";
  canvas.replaceWith(fallback);
}

function loadSurfaceTextures(folder, repeatX, repeatY) {
  const loader = new THREE.TextureLoader();
  const setup = (texture, color = false) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.anisotropy = Math.min(8, world.renderer.capabilities.getMaxAnisotropy());
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };

  return {
    map: setup(loader.load(`${folder}/diffuse.jpg`), true),
    normalMap: setup(loader.load(`${folder}/normal.jpg`)),
    roughnessMap: setup(loader.load(`${folder}/roughness.jpg`)),
  };
}

function buildTrainingField() {
  const grassTextures = loadSurfaceTextures("assets/textures/grass", 7, 7);
  const asphaltTextures = loadSurfaceTextures("assets/textures/asphalt", 5, 3);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({
      ...grassTextures,
      color: 0x8da083,
      roughness: 0.98,
      normalScale: new THREE.Vector2(0.7, 0.7),
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.scene.add(ground);

  const padMat = new THREE.MeshStandardMaterial({
    ...asphaltTextures,
    color: 0x9a9a94,
    roughness: 0.95,
    normalScale: new THREE.Vector2(0.55, 0.55),
  });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xeef6e8 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xef6f6c, roughness: 0.5 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x4aa3df, roughness: 0.65 });
  const routeMat = new THREE.MeshBasicMaterial({ color: 0xf2c94c });

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

  for (let index = 0; index < squarePath.length - 1; index += 1) {
    const from = squarePath[index];
    const to = squarePath[index + 1];
    addLine(THREE, from.x, from.z, to.x, to.z, routeMat);
  }



  addLandingPad(THREE, 0, 0);
  // Place the takeoff marker beside the landing area, not beneath the aircraft.
  addCourseCone(THREE, -1.45, -0.5, "A", ["squareA4", "landing"], ["square", "eight", "abnormal", "preflight", "postflight", "result"]);
  squareTargets.filter(target => target.label !== "A").forEach(target => {
    const offsetX = target.x > 0 ? 0.65 : -0.65;
    addCourseCone(THREE, target.x + offsetX, target.z, target.label, [target.key], ["square"]);
  });
  course.eightCenters.forEach((point, index) => {
    addCourseCone(THREE, point.x, point.z, String(index + 1), [`eight${index}`], ["eight"]);
  });
  addCourseCone(THREE, 0, 5.75, "F", ["abnormalSetup", "abnormalReturn"], ["abnormal"]);
  addCourseCone(THREE, -5.75, 5, "G", ["abnormalOut"], ["abnormal"]);
  addLine(THREE, -5, 5, 0, 5, blueMat);
  addCourseCone(THREE, emergencyLandingPoint.x - 1.45, emergencyLandingPoint.z, "H", ["emergencyLanding"], ["abnormal"], "緊急");

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
    new THREE.BoxGeometry(2.2, 0.045, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x58c48f, roughness: 0.7 })
  );
  pad.position.set(x, 0.04, z);
  pad.receiveShadow = true;
  world.scene.add(pad);
}

function addCourseCone(THREE, x, z, label, keys, missions, subtitle = "") {
  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xf07824, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.8), orange);
  base.position.y = 0.07;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.34, 0.9, 32), orange);
  body.position.y = 0.56;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.195, 0.16, 32), white);
  band.position.y = 0.66;
  [base, body, band].forEach(mesh => { mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); });

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fffaf0";
  context.fillRect(0, 0, 256, 256);
  context.fillStyle = "#202521";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 184px system-ui, sans-serif";
  context.fillText(label, 128, subtitle ? 107 : 133);
  if (subtitle) {
    context.font = "bold 44px system-ui, sans-serif";
    context.fillText(subtitle, 128, 221);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  // Repeat the identifier around the cone so it remains readable from either side.
  for (let side = 0; side < 4; side += 1) {
    const angle = side * Math.PI / 2;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), labelMaterial);
    face.position.set(Math.sin(angle) * 0.27, 0.35, Math.cos(angle) * 0.27);
    face.rotation.set(-Math.atan2(0.285, 0.9), angle, 0, "YXZ");
    group.add(face);
  }
  group.position.set(x, 0, z);
  group.userData = { keys, missions, label };
  world.scene.add(group);
  world.courseMarkers.push(group);
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

function buildDrone() {
  const group = new THREE.Group();
  const fallback = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf0f5ee, metalness: 0.25, roughness: 0.42 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x151817, metalness: 0.2, roughness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x58c48f, roughness: 0.4 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.18, 0.5), bodyMat);
  body.castShadow = true;
  fallback.add(body);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.24), accentMat);
  nose.position.set(0, 0.03, 0.34);
  nose.castShadow = true;
  fallback.add(nose);

  const armGeometry = new THREE.BoxGeometry(1.55, 0.06, 0.08);
  [-0.48, 0.48].forEach((z, index) => {
    const arm = new THREE.Mesh(armGeometry, darkMat);
    arm.position.z = z;
    arm.rotation.y = index === 0 ? 0.34 : -0.34;
    arm.castShadow = true;
    fallback.add(arm);
  });

  const motorGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.12, 20);
  const propGeometry = new THREE.BoxGeometry(0.7, 0.018, 0.08);
  const rotorDiscGeometry = new THREE.CircleGeometry(0.36, 32);
  const rotorDiscMaterial = new THREE.MeshBasicMaterial({
    color: 0xc9f3dd,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
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
    fallback.add(motor);

    const prop = new THREE.Mesh(propGeometry, accentMat);
    prop.position.set(x, 0.11, z);
    prop.rotation.y = index % 2 ? Math.PI / 2 : 0;
    prop.castShadow = true;
    fallback.add(prop);
    world.propellers.push(prop);

    const rotorDisc = new THREE.Mesh(rotorDiscGeometry, rotorDiscMaterial.clone());
    rotorDisc.position.set(x, 0.115, z);
    rotorDisc.rotation.x = -Math.PI / 2;
    fallback.add(rotorDisc);
    world.rotorDiscs.push(rotorDisc);
  });
  group.add(fallback);

  world.shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false })
  );
  world.shadow.rotation.x = -Math.PI / 2;
  world.shadow.position.y = 0.035;
  world.scene.add(world.shadow);

  world.drone = group;
  world.droneFallback = fallback;
  world.drone.rotation.order = "YXZ";
  world.scene.add(group);
  loadDroneModel();
}

function loadDroneModel() {
  new GLTFLoader().load(
    "assets/models/cesium-drone.glb",
    (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(0.35);
      model.updateMatrixWorld(true);

      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -bounds.min.y - 0.14, -center.z);
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          material.envMapIntensity = 1.25;
          material.needsUpdate = true;
        });
      });

      world.drone.add(model);
      world.droneFallback.visible = false;
      world.propellers = [];
      world.rotorDiscs = [];

      if (gltf.animations.length > 0) {
        world.droneMixer = new THREE.AnimationMixer(model);
        world.droneMixer.clipAction(gltf.animations[0]).play();
      }
    },
    undefined,
    (error) => console.warn("glTF機体モデルを読み込めないため簡易モデルを使用します。", error)
  );
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
  updateBoundaryDisplay();
  const d = state.drone;
  const observerDistance = phaseMission[state.phase] === "eight" ? 6.5 : 8.5;
  world.pilotEye.set(0, 2.05, -observerDistance);
  world.drone.position.set(d.x, d.y + 0.18, d.z);
  world.drone.rotation.set(d.pitch, d.yaw, d.roll);

  if (world.droneMixer) {
    world.droneMixer.timeScale = clamp((d.thrustNewtons - 0.5) / 4.5, 0, 3.2);
    world.droneMixer.update(dt);
  }
  world.propellers.forEach((prop, index) => {
    const thrustAcceleration = d.thrustNewtons / flightModel.massKg;
    const rotorSpeed = 8 + thrustAcceleration * 2.8;
    prop.rotation.y += (index % 2 ? -1 : 1) * rotorSpeed * dt;
  });
  world.rotorDiscs.forEach((disc) => {
    const thrustAcceleration = d.thrustNewtons / flightModel.massKg;
    disc.material.opacity = clamp((thrustAcceleration - 3) / 55, 0, 0.22);
  });

  world.shadow.position.set(d.x, 0.04, d.z);
  const shadowScale = clamp(1.15 - d.y * 0.12, 0.35, 1.15);
  world.shadow.scale.set(shadowScale, shadowScale, shadowScale);
  world.shadow.material.opacity = clamp(0.28 - d.y * 0.045, 0.07, 0.28);

  const mission = phaseMission[state.phase];
  const activeKey = state.phase === "square" ? squareTargets[state.squareIndex]?.key
    : state.phase === "eight" && state.eightIndex > 0 ? `eight${Math.floor(((state.eightIndex - 1) % 8) / 4)}`
    : state.phase === "abnormal" ? abnormalTargets[state.abnormalIndex]?.key
    : ["squareLanding", "eightLanding", "demoLanding"].includes(state.phase) ? "landing"
    : state.phase === "landing" ? "emergencyLanding" : null;
  const markerMission = ["preflight", "postflight", "result"].includes(mission)
    ? state.subject === "eight" ? "eight" : state.subject === "abnormal" ? "abnormal" : "square"
    : mission;
  for (const marker of world.courseMarkers) {
    marker.visible = marker.userData.missions.includes(markerMission);
    const active = state.mode === "practice" && marker.userData.keys.includes(activeKey);
    // Fixed physical markers stay visible in mock exams; only practice adds a highlight.
    marker.children[0].material.emissive.setHex(active ? 0x572500 : 0x000000);
  }

  world.camera.position.lerp(world.pilotEye, 1 - Math.exp(-dt * 5));
  world.cameraDesiredTarget.set(d.x, Math.max(0.45, d.y + 0.28), d.z);
  world.cameraLookTarget.lerp(world.cameraDesiredTarget, 1 - Math.exp(-dt * 7));
  world.camera.lookAt(world.cameraLookTarget);
  world.renderer.render(world.scene, world.camera);
}

function buildChecklist() {
  ui.checklistTitle.textContent = "飛行前点検";
  buildChecklistItems(checklistItems, confirmChecklist);
}

function buildPostflightChecklist() {
  ui.checklistTitle.textContent = "飛行後点検・記録";
  buildChecklistItems(postflightItems, confirmPostflight);
}

function buildChecklistItems(items, handler) {
  ui.checklist.innerHTML = "";
  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = index === 0 ? "" : "locked";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item;
    button.addEventListener("click", () => handler(index));
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

function confirmPostflight(index) {
  if (state.phase !== "postflight") return;
  if (index !== state.postflightIndex) {
    state.checklistMistakes += 1;
    ui.examiner.textContent = "飛行後点検・記録の順序が違います。";
    return;
  }
  const items = [...ui.checklist.children];
  items[index].className = "done";
  state.postflightIndex += 1;
  if (items[state.postflightIndex]) items[state.postflightIndex].className = "";
  if (state.postflightIndex === postflightItems.length) finishExam();
}

function setMode(mode) {
  if (state.running) return;
  state.mode = mode;
  ui.modeBadge.textContent = mode === "practice" ? "練習モード" : "本番モード";
  ui.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
}

function setPhase(phase) {
  const previousMission = phaseMission[state.phase];
  const nextMission = phaseMission[phase];
  if (previousMission !== nextMission) {
    if (taskLimits[previousMission]) {
      state.taskTimes[previousMission] = state.taskElapsed;
    }
    if (taskLimits[nextMission]) {
      state.taskStartTime = trainingNow();
      state.taskElapsed = 0;
    }
  }
  state.phase = phase;
  if (["takeoff", "eightTakeoff", "abnormalTakeoff", "emergencyHover"].includes(phase)) {
    state.hoverTimer = 0;
  }
  state.lastPhaseChange = trainingNow();
  state.respondedPhase = null;
  const copy = phases[phase];
  ui.phaseTitle.textContent = copy.title;
  ui.phaseHint.textContent = copy.hint;
  ui.examiner.textContent = copy.line;
  if(document.getElementById("voiceEnabled").checked && "speechSynthesis" in window) {
    speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(copy.line);utterance.lang="ja-JP";speechSynthesis.speak(utterance);
  }
  const missionIndex = missionOrder.indexOf(nextMission);
  ui.missions.forEach((item) => {
    const itemIndex = missionOrder.indexOf(item.dataset.mission);
    item.classList.toggle("current", item.dataset.mission === nextMission);
    item.classList.toggle("done", itemIndex < missionIndex);
  });
}

function reset() {
  if(state.running && state.elapsed>0) {
    state.interrupted=true;
    state.evaluation.events.push({type:"interrupted",points:0,phase:state.phase,time:state.elapsed,position:{x:state.drone.x,z:state.drone.z}});
    finishExam();
  }
  state.phase = "preflight";
  state.running = false;
  state.paused = false;
  state.interrupted = false;
  state.evaluation = createEvaluation();
  state.emergencyHoverPoint=null;
  state.arc = { key: null, angle: null, travel: 0 };
  document.getElementById("pauseButton").hidden = true;
  state.checklistIndex = 0;
  state.postflightIndex = 0;
  state.checklistMistakes = 0;
  state.elapsed = 0;
  state.hoverTimer = 0;
  state.squareTimer = 0;
  state.squareIndex = 0;
  state.eightIndex = 0;
  state.abnormalIndex = 0;
  state.emergencyHoverTimer = 0;
  state.taskStartTime = 0;
  state.taskElapsed = 0;
  state.taskTimes = {};
  state.timeLimitExceeded = null;
  state.landingDrift = 0;
  state.altitudeErrorSquared = 0;
  state.altitudeSampleTime = 0;
  state.headingErrorSquared = 0;
  state.headingSampleTime = 0;
  state.hardLandingSpeed = 0;
  state.boundaryViolations = 0;
  state.responseDelays = [];
  state.respondedPhase = null;
  state.physicsAccumulator = 0;
  state.simulationTime = 0;
  state.batteryPct = 100;
  state.flightRecords = [];
  state.lastLogSecond = -1;
  Object.assign(state.command, { throttle: 0, forward: 0, strafe: 0, yaw: 0 });
  Object.assign(state.drone, {
    x: 0,
    z: 0,
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    yaw: 0,
    yawRate: 0,
    roll: 0,
    pitch: 0,
    rollRate: 0,
    pitchRate: 0,
    thrustNewtons: 0,
  });
  ui.resultPanel.hidden = true;
  ui.downloadLog.disabled = true;
  ui.start.disabled = true;
  ui.start.textContent = "試験を開始";
  buildChecklist();
  setPhase("preflight");
}

async function startExam() {
  if(state.running) return;
  if(state.subject!=="demo") {
    ui.start.disabled=true;
    try {const status=await fetch("/api/status").then(r=>r.json());accessGranted=Boolean(status.access);
      if(accessGranted) {const {createMission}=await import("./src/premium-mission.js");premiumMission=createMission({state,phaseMission,taskLimits,trainingNow,recordTelemetry,evaluateSample,finishExam,isLandedAt,takeoffPoint,setPhase,squareTargets,figureEightTargets,figureEightLap,course,angleDifference,abnormalTargets,emergencyLandingPoint,ui,buildPostflightChecklist});}
    } catch {accessGranted=false;} finally {ui.start.disabled=false;}
  }
  if(state.subject!=="demo" && !accessGranted) { ui.examiner.textContent="この科目は検証参加者・契約者向けです。アカウント画面で利用状況を確認してください。";return; }
  if (state.checklistIndex < checklistItems.length) {
    ui.examiner.textContent = "飛行前点検が完了していません。";
    return;
  }
  if (!state.inputReady) {
    ui.examiner.textContent = "外部コントローラーを接続してください。開発者モードではキーボード操作で開始できます。";
    return;
  }
  if (!state.threeReady) { ui.examiner.textContent = "3D画面の準備が完了していません。再読み込みしてください。"; return; }
  if (!state.developerMode && !state.calibration) { ui.examiner.textContent = "開始前に入力確認と中立校正をしてください。"; return; }
  state.running = true;
  document.getElementById("pauseButton").hidden = false;
  state.startTime = trainingNow();
  state.taskStartTime = 0;
  state.responseDelays = [];
  state.flightRecords = [];
  state.lastLogSecond = -1;
  ui.start.textContent = "試験中";
  ui.start.disabled = true;
  setPhase(subjects[state.subject].phase);
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
    const axes = pad.axes.map((value, index) => normalizedAxis(value, state.calibration?.axes[index] || 0));
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

function updatePhysics(dt, rawInput) {
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

  const positionHold = !["abnormalTakeoff", "abnormal", "emergencyHover", "landing"].includes(state.phase);
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
  if (nextX < -10.5 || nextX > 10.5) {
    if (Math.abs(d.vx) > 0.4) state.boundaryViolations += 1;
    d.x = clamp(nextX, -10.5, 10.5);
    d.vx *= -0.12;
  } else {
    d.x = nextX;
  }
  if (nextZ < -2 || nextZ > 18) {
    if (Math.abs(d.vz) > 0.4) state.boundaryViolations += 1;
    d.z = clamp(nextZ, -2, 18);
    d.vz *= -0.12;
  } else {
    d.z = nextZ;
  }
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
    ["square", "eight", "abnormal", "emergencyHover"].includes(state.phase);
  if (altitudeCanBeScored) {
    state.altitudeErrorSquared += jitter * jitter * dt;
    state.altitudeSampleTime += dt;
  }

  const navigationTarget = currentNavigationTarget();
  const horizontalSpeed = Math.hypot(d.vx, d.vz);
  if (navigationTarget && horizontalSpeed > 0.25) {
    const expectedYaw =
      state.phase === "abnormal"
        ? 0
        : Math.atan2(navigationTarget.x - d.x, navigationTarget.z - d.z);
    const headingError = angleDifference(d.yaw, expectedYaw);
    state.headingErrorSquared += headingError * headingError * dt;
    state.headingSampleTime += dt;
  }
}

function updateMission(dt) {
  if(state.subject!=="demo") { if(premiumMission) premiumMission(dt); return; }
  if(!state.running || state.paused) return;
  state.elapsed=(trainingNow()-state.startTime)/1000;
  state.taskElapsed=state.elapsed;
  recordTelemetry();
  if(state.elapsed>480) {state.timeLimitExceeded="square";finishExam();return;}
  const d=state.drone;
  if(state.phase==="takeoff") {
    if(Math.hypot(d.x,d.z)<.9 && Math.abs(d.y-3.5)<.22 && Math.hypot(d.vx,d.vz,d.vy)<.45) state.hoverTimer+=dt;
    else state.hoverTimer=0;
    if(state.hoverTimer>5) setPhase("demoLanding");
  } else if(state.phase==="demoLanding" && isLandedAt(takeoffPoint)) finishExam();
}

function isLandedAt(point) {
  const d = state.drone;
  return (
    Math.hypot(d.x - point.x, d.z - point.z) < 0.9 &&
    d.y < 0.08 &&
    Math.hypot(d.vx, d.vz) < 0.55
  );
}

function finishExam() {
  state.running = false;
  state.paused = false;
  document.getElementById("pauseButton").hidden = true;
  setPhase("result");
  const feedback = [];
  let score = 100 - state.evaluation.events.reduce((total,event)=>total+event.points,0);
  if(state.evaluation.events.some(event=>event.type==="route-penalty")) feedback.push("経路逸脱を記録しました。航跡を確認し、区間の途中でも経路を維持してください。");
  if(state.evaluation.fatal) feedback.push("練習用の中止区画に入りました。減速と経路維持を単科目で練習してください。");
  const altitudeRms =
    state.altitudeSampleTime > 0
      ? Math.sqrt(state.altitudeErrorSquared / state.altitudeSampleTime)
      : 0;
  const headingRms =
    state.headingSampleTime > 0
      ? Math.sqrt(state.headingErrorSquared / state.headingSampleTime)
      : 0;
  const fatalLanding = state.hardLandingSpeed >= 3;
  const fatalTime = Boolean(state.timeLimitExceeded);

  if (state.checklistMistakes > 0) {
    score -= state.checklistMistakes * 8;
    feedback.push("点検手順に順序ミスがあります。声に出して確認順を固定してください。");
  }
  if (altitudeRms > 0.35) {
    score -= 16;
    feedback.push(`高度維持の平均誤差が${altitudeRms.toFixed(2)}mです。水平移動時の上昇・下降補正を小さく早めに入れてください。`);
  }
  if (["full","square"].includes(state.subject) && state.squareIndex < squareTargets.length) {
    score -= 14;
    feedback.push("スクエア飛行の指定経路を完了できていません。次の文字入りコーンを目印に、進行方向と高度を保ってください。");
  }
  if (["full","eight"].includes(state.subject) && state.eightIndex < figureEightTargets.length) {
    score -= 14;
    feedback.push("8の字飛行を連続2周完了できていません。直径約5mの経路を一定高度で反復してください。");
  }
  if (["full","abnormal"].includes(state.subject) && state.abnormalIndex < abnormalTargets.length) {
    score -= 14;
    feedback.push("異常事態の飛行で指定側方移動を完了できていません。安定機能が弱い状態での惰性を早めに抑えてください。");
  }
  if (state.landingDrift > 0.9) {
    score -= 18;
    feedback.push("着陸時に機体が流れる傾向があります。接地前に水平速度を十分に落としてください。");
  }
  if (state.hardLandingSpeed > 1.5) {
    score -= fatalLanding ? 100 : 18;
    feedback.push(`接地時の降下速度が${state.hardLandingSpeed.toFixed(1)}m/sです。接地直前の降下率を抑えてください。`);
  }
  if (state.boundaryViolations > 0) {
    score -= Math.min(20, state.boundaryViolations * 5);
    feedback.push("飛行可能範囲を逸脱しています。減速開始位置と機体の慣性を意識してください。");
  }
  if (headingRms > 25 * Math.PI / 180) {
    score -= 12;
    feedback.push(`機首方位の平均誤差が${(headingRms * 180 / Math.PI).toFixed(0)}度です。進行方向への機首合わせを早めてください。`);
  }
  const avgResponse = average(state.responseDelays);
  if (avgResponse > 2.8) {
    score -= 10;
    feedback.push("指示から操作開始までに時間がかかっています。次の課題姿勢を早めに準備してください。");
  }
  if (fatalTime) {
    score = 0;
    const taskName = state.timeLimitExceeded === "square"
      ? "スクエア飛行"
      : state.timeLimitExceeded === "eight"
        ? "8の字飛行"
        : "異常事態飛行";
    feedback.push(`${taskName}の制限時間を超過しました。各科目の経路と減速位置を事前に固定してください。`);
  }
  if (feedback.length === 0) {
    feedback.push("大きな減点傾向はありません。次は本番モードで途中表示なしに挑戦してください。");
  }

  if(state.evaluation.fatal) score=0;
  score = Math.max(0, Math.round(score));
  ui.resultPanel.hidden = false;
  ui.downloadLog.disabled = state.flightRecords.length === 0;
  ui.passFail.textContent = state.evaluation.fatal || fatalLanding || fatalTime ? "練習中止・要改善" : "練習終了（公式合否は未評価）";
  ui.score.textContent = `${score} / 100`;
  ui.finalTime.textContent = formatTime(state.elapsed);
  ui.feedback.innerHTML = feedback.slice(0,3).map((item) => `<li>${item}</li>`).join("");
  const record={participantId:getParticipantId(),environment:{userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight]},id:crypto.randomUUID(),at:new Date().toISOString(),versions,subject:state.subject,mode:state.mode,score,elapsed:state.elapsed,interrupted:state.interrupted,developerMode:state.developerMode,calibration:state.calibration,events:state.evaluation.events,feedback:feedback.slice(0,3),flightRecords:state.flightRecords};
  try { savedHistory.append(record); document.getElementById("saveStatus").textContent="このブラウザに履歴を保存しました。"; }
  catch { document.getElementById("saveStatus").textContent="履歴を保存できません。今回のログをダウンロードしてください。"; }
  renderHistory();
  renderEvents(record);
}

function recordTelemetry() {
  const second = Math.floor(state.elapsed);
  if (second === state.lastLogSecond) return;
  state.lastLogSecond = second;
  const d = state.drone;
  const positionHold = !["abnormalTakeoff", "abnormal", "emergencyHover", "landing"].includes(state.phase);
  state.flightRecords.push({
    scenario_id: phaseMission[state.phase] === "abnormal" ? "S01_SENSOR_FAIL" : "N01_NORMAL",
    elapsed_s: second,
    timestamp_jst: formatJstTimestamp(new Date()),
    phase: state.phase,
    x_east_m: Number(d.x.toFixed(3)),
    y_north_m: Number(d.z.toFixed(3)),
    z_up_m: Number(d.y.toFixed(3)),
    yaw_deg: Number((d.yaw * 180 / Math.PI).toFixed(2)),
    pitch_deg: Number((d.pitch * 180 / Math.PI).toFixed(2)),
    roll_deg: Number((d.roll * 180 / Math.PI).toFixed(2)),
    ground_speed_mps: Number(Math.hypot(d.vx, d.vz).toFixed(3)),
    vertical_speed_mps: Number(d.vy.toFixed(3)),
    flight_mode: positionHold ? "GNSS_VISION" : "ATTI",
    pos_hold_enabled: positionHold,
    link_state: "OK",
    sensor_status: positionHold ? "NOMINAL" : "POSITION_HOLD_OFF",
    battery_pct: Number(state.batteryPct.toFixed(1)),
    wind_speed_mps: wind.speedMps,
    wind_dir_deg: wind.directionDeg,
  });
}

function downloadFlightLog() {
  if (!state.flightRecords.length) return;
  const payload = {
    metadata: {
      versions,
      subject: state.subject,
      interrupted: state.interrupted,
      calibration: state.calibration,
      evaluation_events: state.evaluation.events,
      document_title: "二等無人航空機実地試験 3D再現ログ",
      geodetic_frame: "LOCAL_ENU",
      origin: { name: "A点離着陸基準点", x_east_m: 0, y_north_m: 0, z_up_m: 0 },
      official_course_limits_s: taskLimits,
      note: "位置・センサー周波数は3D再現用の仮定です。",
    },
    task_times_s: state.taskTimes,
    flight_records: state.flightRecords,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `drone-test-log-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderReadouts() {
  const d = state.drone;
  ui.altitude.textContent = `${d.y.toFixed(1)}m`;
  ui.speed.textContent = `${Math.hypot(d.vx, d.vz, d.vy).toFixed(1)}m/s`;
  ui.time.textContent = formatTime(state.elapsed);
  const mission = phaseMission[state.phase];
  const remaining = taskLimits[mission] ? Math.max(0, taskLimits[mission] - state.taskElapsed) : null;
  ui.taskTime.textContent = remaining === null ? "--:--" : formatTime(remaining);
  ui.battery.textContent = `${state.batteryPct.toFixed(0)}%`;
  const positionHold = !["abnormalTakeoff", "abnormal", "emergencyHover", "landing"].includes(state.phase);
  ui.stability.textContent = positionHold ? "位置安定 ON" : "位置安定 OFF";
  ui.stability.classList.toggle("warning", !positionHold);

  if (state.mode === "exam" && state.running) {
    ui.phaseHint.textContent = "課題終了まで減点内容は表示されません。";
  } else if (state.phase !== "result") {
    ui.phaseHint.textContent = phases[state.phase].hint;
  }
}

function loop() {
  const frameDt = world.clock ? Math.min(0.1, world.clock.getDelta()) : 0.016;
  updateControllerStatus();
  updateInputCheck();
  if(state.running && !state.developerMode && !getGamepad()) pauseTraining("接続が切れました。再接続後に校正してください。");
  const input = readInput();
  state.physicsAccumulator = Math.min(
    state.physicsAccumulator + frameDt,
    flightModel.fixedStep * 12
  );
  while (state.physicsAccumulator >= flightModel.fixedStep) {
    if(state.paused) {state.physicsAccumulator=0;break;}
    updatePhysics(flightModel.fixedStep, input);
    updateMission(flightModel.fixedStep);
    state.physicsAccumulator -= flightModel.fixedStep;
  }
  updateThreeWorld(frameDt);
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

function formatJstTimestamp(date) {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return shifted.toISOString().replace("Z", "+09:00");
}

function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function currentNavigationTarget() {
  if (state.phase === "square") return squareTargets[state.squareIndex] || null;
  if (state.phase === "eight") return figureEightTargets[state.eightIndex] || null;
  if (state.phase === "abnormal") return abnormalTargets[state.abnormalIndex] || null;
  if (["squareLanding","eightLanding","demoLanding"].includes(state.phase)) return takeoffPoint;
  if (state.phase === "landing") return emergencyLandingPoint;
  return null;
}

function targetAltitude() {
  if (["eightTakeoff", "eight"].includes(state.phase)) return 1.5;
  if (["squareLanding", "eightLanding", "demoLanding", "landing"].includes(state.phase)) return 0;
  if (["preflight", "postflight", "result"].includes(state.phase)) return state.drone.y;
  return 3.5;
}

ui.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
ui.start.addEventListener("click", startExam);
ui.reset.addEventListener("click", reset);
ui.downloadLog.addEventListener("click", downloadFlightLog);
ui.developerMode.addEventListener("click", () => {
  if(state.running) return;
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
  if (["INPUT","TEXTAREA","SELECT"].includes(event.target.tagName)) return;
  state.keys.add(event.code);
});
window.addEventListener("keyup", (event) => state.keys.delete(event.code));
window.addEventListener("gamepadconnected", updateControllerStatus);
window.addEventListener("gamepaddisconnected", () => {state.calibration=null;pauseTraining("接続が切れました。再接続後に校正してください。");updateControllerStatus();});
window.addEventListener("blur",()=>{state.keys.clear();pauseTraining("画面を離れたため一時停止しました。");});
document.addEventListener("visibilitychange",()=>{if(document.hidden) {state.keys.clear();pauseTraining("画面を離れたため一時停止しました。");}});

function updateBoundaryDisplay() {
  const index=state.phase==="square"?state.squareIndex:state.phase==="eight"?state.eightIndex:state.abnormalIndex;
  const key=`${state.phase}:${index}`;
  if(world.boundaryKey===key) return;
  world.boundaryKey=key;
  if(world.boundaryGroup) {world.scene.remove(world.boundaryGroup);world.boundaryGroup.geometry.dispose();world.boundaryGroup.material.dispose();world.boundaryGroup=null;}
  if(!["square","eight","abnormal","takeoff","eightTakeoff","abnormalTakeoff","emergencyHover"].includes(state.phase)) return;
  const points=[],colors=[];
  for(let x=-10;x<=10;x+=.15) for(let z=-3;z<=16;z+=.15) {
    const distance=routeDistance({x,z},state.phase,index,state.emergencyHoverPoint || undefined);
    const penalty=Math.abs(distance-course.penalty)<.07,fatal=Math.abs(distance-course.failure)<.07;
    if(penalty || fatal) {points.push(x,.06,z);colors.push(...(fatal?[.94,.43,.42]:[.9,.65,.25]));}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(points,3));geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  world.boundaryGroup=new THREE.Points(geometry,new THREE.PointsMaterial({size:.09,vertexColors:true}));world.scene.add(world.boundaryGroup);
}
function getParticipantId() {
  try {let id=localStorage.getItem("drone.participant.v1");if(!id){id=crypto.randomUUID();localStorage.setItem("drone.participant.v1",id);}return id;}catch{return "unsaved";}
}
function trainingNow() { return state.simulationTime * 1000; }
let accessGranted = false;
let premiumMission = null;
const savedHistory = historyStore({getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value),removeItem:key=>window.localStorage.removeItem(key)});
let inputRange = Array.from({length:4},()=>({min:0,max:0}));
let padIdentity = null;
let restoredCalibrationAttempted = false;
function updateInputCheck() {
  const pad=getGamepad();
  const identity=pad ? `${pad.index}:${pad.id}` : null;
  if(identity!==padIdentity) {state.calibration=null;inputRange=Array.from({length:4},()=>({min:0,max:0}));padIdentity=identity;if(state.running) pauseTraining("入力機器が変わりました。再校正してください。");}
  if(!pad) return;
  if(!restoredCalibrationAttempted) {
    restoredCalibrationAttempted=true;
    try {const saved=JSON.parse(localStorage.getItem("drone.calibration.v1")||"null");if(saved?.id===pad.id && calibrationValid(saved.axes) && saved.axes.every((v,i)=>Math.abs(v-pad.axes[i])<.08)) state.calibration=saved;}catch{}
  }
  const axes=Array.from(pad.axes).slice(0,4);
  axes.forEach((v,i)=>{inputRange[i].min=Math.min(inputRange[i].min,v);inputRange[i].max=Math.max(inputRange[i].max,v);});
  document.getElementById("axisReadout").textContent=axes.map((v,i)=>`${i+1}: ${v.toFixed(2)}`).join(" / ");
}
function pauseTraining(message) {
  if(!state.running || state.paused) return;
  state.paused=true;state.interrupted=true;state.keys.clear();
  if("speechSynthesis" in window) speechSynthesis.cancel();
  Object.assign(state.command,{throttle:0,forward:0,strafe:0,yaw:0});
  document.getElementById("pauseButton").textContent="確認して再開";
  ui.examiner.textContent=message;
}
function renderHistory() {
  const list=document.getElementById("historyList");list.replaceChildren();
  for(const record of savedHistory.read().slice(0,5)) {
    const li=document.createElement("li");
    const button=document.createElement("button");
    button.textContent=`${new Date(record.at).toLocaleString("ja-JP")} / ${subjects[record.subject]?.label || "練習"} / 独自指標 ${record.score}点${record.interrupted ? " / 中断あり" : ""}`;
    button.addEventListener("click",()=>renderEvents(record));li.append(button);list.append(li);
  }
  if(!list.children.length) list.textContent="まだ履歴はありません。";
}
function renderEvents(record) {
  const target=document.getElementById("eventList");target.replaceChildren();
  const labels={"route-warning":"経路への復帰指示","route-penalty":"経路逸脱","route-return":"経路に復帰","failure-zone":"中止区画への侵入"};
  for(const event of record.events) {const li=document.createElement("li");li.textContent=`${event.time.toFixed(1)}秒 / ${event.phase} / ${labels[event.type] || event.type} / (${event.position.x.toFixed(1)}, ${event.position.z.toFixed(1)})m`;target.append(li);}
  if(!target.children.length) target.textContent="記録された経路イベントはありません。公式の全項目を評価した結果ではありません。";
  const canvas=document.getElementById("trackCanvas"),ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle="#58c48f";ctx.lineWidth=2;ctx.beginPath();
  record.flightRecords.forEach((row,i)=>{const x=canvas.width/2+row.x_east_m*10,y=canvas.height-25-row.y_north_m*10;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
  ctx.fillStyle="#ef6f6c";record.events.filter(e=>e.points || e.type==="failure-zone").forEach(e=>{ctx.beginPath();ctx.arc(canvas.width/2+e.position.x*10,canvas.height-25-e.position.z*10,4,0,Math.PI*2);ctx.fill();});
}
document.getElementById("calibrateButton").addEventListener("click",()=>{
  if(state.running && !state.paused) return;
  const pad=getGamepad(), axes=pad ? Array.from(pad.axes).slice(0,4) : [];
  if(!calibrationValid(axes) || inputRange.some(r=>r.min>-.7 || r.max<.7)) {ui.examiner.textContent="全4軸を両端まで動かし、スティックを中立に戻してから校正してください。";return;}
  state.calibration={id:pad.id,axes,at:new Date().toISOString()};
  try{localStorage.setItem("drone.calibration.v1",JSON.stringify(state.calibration));}catch{}ui.examiner.textContent="中立校正を保存しました。各軸の操作方向も無料体験で確認してください。";
});
document.getElementById("subjectSelect").addEventListener("change",(event)=>{reset();state.subject=event.target.value;});
document.getElementById("pauseButton").addEventListener("click",()=>{
  if(!state.paused) {pauseTraining("一時停止しました。");return;}
  if(!state.developerMode && (!getGamepad() || !state.calibration)) {ui.examiner.textContent="再接続と校正を完了してください。";return;}
  if(state.mode==="exam") {state.evaluation.events.push({type:"interrupted",points:0,phase:state.phase,time:state.elapsed,position:{x:state.drone.x,z:state.drone.z}});finishExam();return;}
  state.paused=false;state.physicsAccumulator=0;document.getElementById("pauseButton").textContent="一時停止";ui.examiner.textContent=phases[state.phase].line;
});
document.getElementById("retryButton").addEventListener("click",()=>{reset();ui.examiner.textContent="点検後、同じ科目を再練習できます。";});
document.getElementById("exportHistoryButton").addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify({versions,records:savedHistory.read()},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="drone-history.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
setInterval(async()=>{
  if(!state.running || state.subject==="demo") return;
  try {const status=await fetch("/api/status").then(r=>r.json());if(!status.access){accessGranted=false;pauseTraining("利用期間が終了しました。履歴を保存して終了します。");finishExam();}}
  catch {pauseTraining("利用状況を確認できません。一度終了して再接続してください。");}
},30000);
renderHistory();
fetch("/api/status").then(response=>response.json()).then(status=>{
  accessGranted=Boolean(status.access);
  const selected=new URLSearchParams(location.search).get("subject");
  if(subjects[selected]) {state.subject=selected;document.getElementById("subjectSelect").value=selected;reset();}
  if(!accessGranted) ui.examiner.textContent="登録不要の無料体験を利用できます。他の科目は検証参加者・契約者向けです。";
}).catch(()=>{ui.examiner.textContent="無料体験を利用できます。全科目の利用には専用サーバーから起動してください。";});

initThreeWorld();
reset();
setMode("practice");
requestAnimationFrame(loop);
