import {summarizeFlight} from './src/flight-results.js';
import {advanceFlightFrame} from './src/flight-frame.js';
import {evaluateFlightCoaching,coachingMessages} from './src/flight-coaching.js';
import {createFlightState, transitionFlightPhase, navigationTarget, desiredAltitude, landedAt, phaseMission, taskLimits, squareTargets, figureEightTargets} from "./src/session-rules.js";
import {evaluateFlightSafety, safetyMessages, coneDimensions} from "./src/flight-safety.js";
import { flightModel, createFlightPhysics } from "./src/flight-physics.js";
import { layouts, expectedHeading, figureEightLap, abnormalTargets } from "./src/course-layout.js";
import { createCourseScene } from "./src/course-scene.js";
import { createDemonstration } from "./src/demonstration.js";
import { versions, course, evaluateSample, normalizedAxis, calibrationValid, subjects, historyStore } from "./src/training.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

const canvas = document.getElementById("simCanvas");

const ui = {
  inputStatus: document.getElementById("inputMonitorStatus"),
  inputValues: document.getElementById("inputValues"),
  sticks: ["leftStick", "rightStick", "leftApplied", "rightApplied"].map(id=>document.getElementById(id)),
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
    hint: "A点からHへ戻り、流れを抑えて着陸してください。",
    line: "スクエア飛行を終了し、Hへ着陸してください。",
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
    hint: "中央のH上空で停止して、安全に着陸してください。",
    line: "8の字飛行を終了し、Hへ着陸してください。",
  },
  abnormalTakeoff: {
    title: "異常事態飛行: 離陸",
    hint: "位置安定OFFで高度3.5mまで上昇し、5秒間ホバリングしてください。",
    line: "水平方向の位置安定機能をOFFにします。離陸してください。",
  },
  abnormal: {
    title: "異常事態の飛行",
    hint: "機首を前方へ固定し、AからB–E–Bの経路を側方に1往復以上飛行してください。",
    line: "機首方位を維持したまま、側方移動を1往復してください。",
  },
  emergencyHover: {
    title: "緊急事態宣言",
    hint: "その場で水平位置と高度3.5mを維持してください。",
    line: "緊急事態を宣言します。その場でホバリングしてください。",
  },
  emergencyTransit: {
    title: "緊急着陸：H上空へ移動", hint: "高度3.5mを維持し、最短経路でH上空へ移動してください。", line: "緊急着陸してください。高度を維持してHへ移動してください。"
  },
  emergencyArrival: { title: "緊急着陸：H上空で停止", hint: "高度3.5mを保ち、H上空で水平移動を止めてください。", line: "H上空に到着しました。高度を保って停止してください。" },
  landing: {
    title: "緊急着陸",
    hint: "最短経路でHへ移動し、流れを抑えて接地してください。",
    line: "緊急着陸してください。最短経路でHの指定地点へ降下してください。",
  },
  postflight: {
    title: "飛行後点検・記録",
    hint: "機体点検と飛行記録を正しい順序で完了してください。",
    line: "飛行後点検と飛行記録を実施してください。",
  },
  demoLanding: { title: "無料体験：着陸", hint: "Hへ静かに着陸してください。", line: "ホバリング完了。Hへ着陸してください。" },
  result: {
    title: "結果",
    hint: "試験結果を確認してください。",
    line: "試験を終了します。",
  },
};

const missionOrder = ["preflight", "square", "eight", "abnormal", "postflight", "result"];
const takeoffPoint = { ...layouts.square.takeoff };
const emergencyLandingPoint = { ...layouts.abnormal.takeoff };
const wind = { speedMps: 0, directionDeg: 30 };



const state = {
  ...createFlightState(), mode: "practice", cameraMode: "overview", presentation: null,
  calibration: null, developerMode: false, keys: new Set(), inputReady: false, threeReady: false,
};

const world = {
  renderer: null,
  boundaryGroup: null,
  boundaryKey: null,
  fields: {},
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
  world.scene.background = new THREE.Color(0x152126);
  world.scene.fog = new THREE.Fog(0x152126, 60, 110);

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

function buildTrainingField() {
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(90,90),new THREE.MeshStandardMaterial({color:0x27363b,roughness:.95}));
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;world.scene.add(ground);
  for(const id of Object.keys(layouts)) {
    world.fields[id]=createCourseScene(id,addCourseCone);
    world.scene.add(world.fields[id].group);
  }
}

function addCourseCone(THREE, x, z, label, keys, missions, subtitle = "", parent = world.scene) {
  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xf07824, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(coneDimensions.baseWidth, 0.08, coneDimensions.baseWidth), orange);
  base.position.y = 0.07;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(coneDimensions.tipRadius, coneDimensions.baseRadius, coneDimensions.bodyHeight, 32), orange);
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
  texture.repeat.x=-1;texture.offset.x=1; // Keep text readable in the mirrored course frame.
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
  parent.add(group);
  world.courseMarkers.push(group);
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
  world.headingArrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(0,.24,0),1.5,0x58ffb0,.35,.25);
  group.add(world.headingArrow);

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
  const d = state.drone;
  const layout=layouts[state.courseId];
  for(const [id,field] of Object.entries(world.fields)) {field.group.visible=id===state.courseId;field.guides.visible=state.mode==='practice' || Boolean(state.presentation);}
  world.pilotEye.set(layout.pilot.x, 1.65, layout.pilot.z);
  world.drone.position.set(-d.x, d.y + 0.18, d.z);
  world.drone.rotation.set(d.pitch, -d.yaw, -d.roll);
  world.headingArrow.visible=state.mode==='practice' || Boolean(state.presentation);

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

  world.shadow.position.set(-d.x, 0.04, d.z);
  const shadowScale = clamp(1.15 - d.y * 0.12, 0.35, 1.15);
  world.shadow.scale.set(shadowScale, shadowScale, shadowScale);
  world.shadow.material.opacity = clamp(0.28 - d.y * 0.045, 0.07, 0.28);

  const mission = state.courseId;
  const activeKey = state.phase === "square" ? `${state.courseId}:${squareTargets[state.squareIndex]?.label}`
    : state.phase === "eight" && state.eightIndex > 0 ? `eight:${Math.floor((state.eightIndex % 8) / 4)+1}`
    : state.phase === "abnormal" ? `abnormal:${abnormalTargets[state.abnormalIndex]?.label}`
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

  const target=new THREE.Vector3(0,0.5,layout.centerZ);
  if(state.cameraMode==='pilot') {
    world.camera.position.lerp(world.pilotEye,1-Math.exp(-dt*7));
    target.set(-d.x,Math.max(.45,d.y+.18),d.z);
  } else if(state.cameraMode==='top') {
    // Include the pilot and dimension captions below the course, clear of HUDs.
    const centerZ=(layout.pilot.z-1.5+layout.centerZ+layout.fieldDepth/2+1)/2;
    target.set(0,0,centerZ);
    world.camera.position.lerp(new THREE.Vector3(0,32.5,centerZ-.01),1-Math.exp(-dt*5));
  } else {
    world.camera.position.lerp(new THREE.Vector3(12,16,layout.centerZ-19),1-Math.exp(-dt*5));
  }
  world.cameraLookTarget.lerp(target,1-Math.exp(-dt*7));
  world.camera.lookAt(world.cameraLookTarget);
  updateCourseReadouts();

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
  transitionFlightPhase(state,phase);
  Object.assign(takeoffPoint,layouts[state.courseId].takeoff);
  const nextMission=phaseMission[phase];
  const copy = phases[phase];
  ui.phaseTitle.textContent = state.subject==='demo' && phase==='takeoff' ? '無料体験：離陸・ホバリング' : copy.title;
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

function reset(nextSubject) {
  const selectedSubject=typeof nextSubject==="string"?nextSubject:state.subject;
  state.presentation=null;
  document.getElementById("presentationControls").hidden=true;
  if(state.running && state.elapsed>0) {
    state.interrupted=true;
    state.evaluation.events.push({type:"interrupted",points:0,phase:state.phase,time:state.elapsed,position:{x:state.drone.x,z:state.drone.z}});
    finishExam();
  }
  Object.assign(state,createFlightState(selectedSubject));
  Object.assign(takeoffPoint,layouts[state.courseId].takeoff);
  state.keys.clear();
  document.getElementById("pauseButton").hidden = true;
  ui.resultPanel.hidden = true;
  ui.downloadLog.disabled = true;
  ui.start.disabled = true;
  ui.start.textContent = "試験を開始";
  ui.modeBadge.textContent=state.mode==="practice"?"練習モード":"模擬試験";
  buildChecklist();
  setPhase("preflight");
}

async function startExam() {
  if(state.running || state.presentation) return;
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

const updatePhysics = createFlightPhysics({state,clamp,trainingNow,targetAltitude,currentNavigationTarget,angleDifference});

function updateMission(dt) {
  if(!state.running || state.paused)return;
  evaluateFlightSafety(state,dt);
  if(state.evaluation.fatal){state.elapsed=(trainingNow()-state.startTime)/1000;finishExam();return;}
  const coaching=evaluateFlightCoaching(state,dt);
  if(state.mode==='practice' && coaching.length)ui.examiner.textContent=coachingMessages[coaching.at(-1).type];
  if(state.subject!=="demo") { if(premiumMission) premiumMission(dt); return; }
  if(!state.running || state.paused) return;
  state.elapsed=(trainingNow()-state.startTime)/1000;
  state.taskElapsed=state.elapsed;
  recordTelemetry();
  if(state.elapsed>480) {state.timeLimitExceeded="square";finishExam();return;}
  const d=state.drone;
  if(state.phase==="takeoff") {
    if(Math.hypot(d.x-takeoffPoint.x,d.z-takeoffPoint.z)<.9 && Math.abs(d.y-3.5)<.22 && Math.hypot(d.vx,d.vz,d.vy)<.45) state.hoverTimer+=dt;
    else state.hoverTimer=0;
    if(state.hoverTimer>5) setPhase("demoLanding");
  } else if(state.phase==="demoLanding" && isLandedAt(takeoffPoint)) {state.completedSubjects.push('demo');finishExam();}
}

function isLandedAt(point) { return landedAt(state,point); }

function finishExam() {
  const endingPhase=state.phase;
  const result=summarizeFlight(state);
  state.running=false;
  state.paused=false;
  document.getElementById("pauseButton").hidden=true;
  setPhase("result");
  ui.resultPanel.hidden=false;
  ui.downloadLog.disabled=state.flightRecords.length===0;
  ui.passFail.textContent=result.status;
  ui.score.textContent=`${result.score} / 100`;
  ui.finalTime.textContent=formatTime(state.elapsed);
  ui.feedback.replaceChildren(...result.feedback.map(text=>{const li=document.createElement("li");li.textContent=text;return li;}));
  const progress=document.getElementById("resultProgress");
  progress.replaceChildren(...result.progress.map(task=>{const li=document.createElement("li");li.textContent=`${task.label}：${task.status}（${task.count}/${task.total}）`;return li;}));
  const retry=document.getElementById("focusRetryButton");
  retry.hidden=result.score===100 && result.progress.every(task=>task.complete);
  retry.textContent=`${subjects[result.retrySubject].label}を重点練習`;
  retry.dataset.subject=result.retrySubject;
  const record={participantId:getParticipantId(),environment:{userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight]},id:crypto.randomUUID(),at:new Date().toISOString(),versions,subject:state.subject,mode:state.mode,score:result.score,elapsed:state.elapsed,endingPhase,progress:result.progress,retrySubject:result.retrySubject,interrupted:state.interrupted,developerMode:state.developerMode,calibration:state.calibration,events:state.evaluation.events,feedback:result.feedback,flightRecords:state.flightRecords};
  try { savedHistory.append(record);document.getElementById("saveStatus").textContent="このブラウザに履歴を保存しました。"; }
  catch {document.getElementById("saveStatus").textContent="履歴を保存できません。今回のログをダウンロードしてください。";}
  renderHistory();renderEvents(record);
}

function recordTelemetry() {
  const second = Math.floor(state.elapsed);
  if (second === state.lastLogSecond) return;
  state.lastLogSecond = second;
  const d = state.drone;
  const positionHold = !["abnormalTakeoff", "abnormal", "emergencyHover", "emergencyTransit", "emergencyArrival", "landing"].includes(state.phase);
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
  const positionHold = state.presentation ? state.courseId!=="abnormal" : !["abnormalTakeoff", "abnormal", "emergencyHover", "emergencyTransit", "emergencyArrival", "landing"].includes(state.phase);
  ui.stability.textContent = positionHold ? "位置安定 ON" : "位置安定 OFF";
  ui.stability.classList.toggle("warning", !positionHold);
  const degrees=yaw=>`${Math.round((yaw*180/Math.PI+360)%360)}°`;
  const heading=document.getElementById("headingReadout");
  if(state.mode==='exam' && state.running)heading.textContent='';
  else if(state.presentation)heading.textContent=`緑矢印＝機首 ${degrees(d.yaw)}（0°＝前方）`;
  else if(['square','eight','abnormal'].includes(state.phase)) {
    const index=state.phase==='square'?state.squareIndex:state.phase==='eight'?state.eightIndex:state.abnormalIndex;
    heading.textContent=`機首 ${degrees(d.yaw)} / 目標 ${degrees(expectedHeading(state.phase,d,index,null))}（0°＝前方）`;
  } else heading.textContent='緑矢印＝機首（前方は操縦者から遠ざかる向き）';

  if (state.presentation) {ui.phaseHint.textContent=state.presentation.sample?.caption || "見本を準備しています。";} else if (state.mode === "exam" && state.running) {
    ui.phaseHint.textContent = "課題終了まで減点内容は表示されません。";
  } else if (state.phase !== "result") {
    ui.phaseHint.textContent = phases[state.phase].hint;
  }
}

function renderInputMonitor(input) {
  const preview=Boolean(state.presentation);
  const applied=state.running && !state.paused ? state.command : {yaw:0,throttle:0,strafe:0,forward:0};
  const raw=preview ? {yaw:0,throttle:0,strafe:0,forward:0} : input;
  const points=[[raw.yaw,raw.throttle],[raw.strafe,raw.forward],[applied.yaw,applied.throttle],[applied.strafe,applied.forward]];
  points.forEach(([x,y],i)=>{ui.sticks[i].style.transform=`translate(${x*34}px,${-y*34}px)`;});
  ui.inputStatus.textContent=preview ? "見本飛行：操縦入力は使いません" : state.paused ? "一時停止：機体への指令は停止中" : getGamepad() ? "コントローラー入力" : state.developerMode ? "キーボード入力" : "コントローラーを接続してください";
  ui.inputValues.textContent=`高度 ${Math.round(raw.throttle*100)}%・旋回 ${Math.round(raw.yaw*100)}%・前後 ${Math.round(raw.forward*100)}%・左右 ${Math.round(raw.strafe*100)}%`;
}

function loop() {
  const frameDt = world.clock ? Math.min(0.1, world.clock.getDelta()) : 0.016;
  if(state.presentation) {
    updatePresentation(frameDt);updateThreeWorld(frameDt);renderReadouts();renderInputMonitor({});requestAnimationFrame(loop);return;
  }
  updateControllerStatus();
  updateInputCheck();
  if(state.running && !state.developerMode && !getGamepad()) pauseTraining("接続が切れました。再接続後に校正してください。");
  const input = readInput();
  renderInputMonitor(input);
  advanceFlightFrame(state,frameDt,input,updatePhysics,updateMission);
  updateThreeWorld(frameDt);
  renderReadouts();
  requestAnimationFrame(loop);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function currentNavigationTarget() { return navigationTarget(state); }
function targetAltitude() { return desiredAltitude(state); }

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

function updateCourseReadouts() {
  const layout=layouts[state.courseId];
  document.getElementById("courseDimension").textContent=layout.dimensions.join(" / ");
  const next=currentNavigationTarget();
  document.getElementById("nextTarget").textContent=state.presentation?"見本飛行（操作・採点なし）":next?`次の目標 ${next.label || 'H'} / 残り ${Math.hypot(next.x-state.drone.x,next.z-state.drone.z).toFixed(1)}m`:"Hから開始";
}
function updatePresentation(dt) {
  const player=state.presentation;
  if(!player.paused) player.time=Math.min(player.timeline.duration,player.time+dt*player.speed);
  const sample=player.timeline.sample(player.time);player.sample=sample;
  state.courseId=sample.courseId;Object.assign(takeoffPoint,layouts[sample.courseId].takeoff);
  Object.assign(state.drone,{x:sample.x,y:sample.y,z:sample.z,yaw:sample.yaw,pitch:0,roll:0,vx:sample.velocity.x,vy:sample.velocity.y,vz:sample.velocity.z,thrustNewtons:sample.y>.05?11.3:0});
  state.elapsed=player.time;state.simulationTime=player.time;
  ui.phaseTitle.textContent=`見本 / ${layouts[sample.courseId].title}`;
  ui.examiner.textContent=sample.caption;
  document.getElementById("presentationSeek").value=player.time;
  document.getElementById("presentationTime").textContent=`${formatTime(player.time)} / ${formatTime(player.timeline.duration)}`;
  if(player.lastStep!==sample.stepIndex) {
    player.lastStep=sample.stepIndex;
    if(document.getElementById("voiceEnabled").checked && 'speechSynthesis' in window) {speechSynthesis.cancel();const speech=new SpeechSynthesisUtterance(sample.caption);speech.lang='ja-JP';speechSynthesis.speak(speech);}
  }
  if(sample.done) {player.paused=true;document.getElementById("presentationPause").textContent="もう一度再生";}
}
document.getElementById("watchButton").addEventListener("click",()=>{
  const subject=state.subject;reset();
  const timeline=createDemonstration(subject);
  state.presentation={timeline,time:0,speed:Number(document.getElementById("presentationSpeed").value),paused:false,lastStep:-1};
  ui.modeBadge.textContent="解説付き見本";
  document.getElementById("presentationControls").hidden=false;
  document.getElementById("presentationSeek").max=timeline.duration;
  document.getElementById("presentationPause").textContent="一時停止";
  updatePresentation(0);
});
document.getElementById("presentationPause").addEventListener("click",()=>{
  if(!state.presentation)return;const p=state.presentation;if(p.time>=p.timeline.duration)p.time=0;p.paused=!p.paused;document.getElementById("presentationPause").textContent=p.paused?"再生":"一時停止";
  if(p.paused && 'speechSynthesis' in window)speechSynthesis.cancel();
});
document.getElementById("presentationSeek").addEventListener("input",event=>{if(state.presentation){state.presentation.time=Number(event.target.value);updatePresentation(0);}});
document.getElementById("presentationSpeed").addEventListener("change",event=>{if(state.presentation)state.presentation.speed=Number(event.target.value);});
document.getElementById("presentationStop").addEventListener("click",()=>{if('speechSynthesis'in window)speechSynthesis.cancel();reset();setMode(state.mode);});
document.querySelectorAll("[data-camera]").forEach(button=>button.addEventListener("click",()=>{state.cameraMode=button.dataset.camera;document.querySelectorAll("[data-camera]").forEach(item=>item.classList.toggle("active",item===button));}));

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
  const labels={...safetyMessages,...coachingMessages,"route-warning":"経路への復帰指示","route-penalty":"経路逸脱","route-return":"経路に復帰","failure-zone":"中止区画への侵入"};
  for(const event of record.events) {const li=document.createElement("li");li.textContent=`${event.time.toFixed(1)}秒 / ${phases[event.phase]?.title || event.phase} / ${labels[event.type] || event.type} / (${event.position.x.toFixed(1)}, ${event.position.z.toFixed(1)})m`;target.append(li);}
  if(!target.children.length) target.textContent="記録された経路イベントはありません。公式の全項目を評価した結果ではありません。";
  const canvas=document.getElementById("trackCanvas"),ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle="#58c48f";ctx.lineWidth=2;ctx.beginPath();
  record.flightRecords.forEach((row,i)=>{const x=canvas.width/2+row.x_east_m*10,y=canvas.height-25-row.y_north_m*10;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
  ctx.fillStyle="#ef6f6c";record.events.filter(e=>e.points || e.fatal || e.type==="failure-zone").forEach(e=>{ctx.beginPath();ctx.arc(canvas.width/2+e.position.x*10,canvas.height-25-e.position.z*10,4,0,Math.PI*2);ctx.fill();});
}
document.getElementById("calibrateButton").addEventListener("click",()=>{
  if(state.running && !state.paused) return;
  const pad=getGamepad(), axes=pad ? Array.from(pad.axes).slice(0,4) : [];
  if(!calibrationValid(axes) || inputRange.some(r=>r.min>-.7 || r.max<.7)) {ui.examiner.textContent="全4軸を両端まで動かし、スティックを中立に戻してから校正してください。";return;}
  state.calibration={id:pad.id,axes,at:new Date().toISOString()};
  try{localStorage.setItem("drone.calibration.v1",JSON.stringify(state.calibration));}catch{}ui.examiner.textContent="中立校正を保存しました。各軸の操作方向も無料体験で確認してください。";
});
document.getElementById("subjectSelect").addEventListener("change",(event)=>{reset(event.target.value);});
document.getElementById("pauseButton").addEventListener("click",()=>{
  if(!state.paused) {pauseTraining("一時停止しました。");return;}
  if(!state.developerMode && (!getGamepad() || !state.calibration)) {ui.examiner.textContent="再接続と校正を完了してください。";return;}
  if(state.mode==="exam") {state.evaluation.events.push({type:"interrupted",points:0,phase:state.phase,time:state.elapsed,position:{x:state.drone.x,z:state.drone.z}});finishExam();return;}
  state.paused=false;state.physicsAccumulator=0;document.getElementById("pauseButton").textContent="一時停止";ui.examiner.textContent=phases[state.phase].line;
});
document.getElementById("focusRetryButton").addEventListener("click",()=>{
  reset(document.getElementById("focusRetryButton").dataset.subject);setMode('practice');document.getElementById("subjectSelect").value=state.subject;
  ui.examiner.textContent=`${subjects[state.subject].label}を重点練習します。飛行前点検から始めてください。`;
  document.getElementById('checklistPanel').scrollIntoView({block:'start',behavior:'smooth'});
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
const initialSubject=new URLSearchParams(location.search).get("subject");
if(subjects[initialSubject]) {state.subject=initialSubject;document.getElementById("subjectSelect").value=initialSubject;}
fetch("/api/status").then(response=>response.json()).then(status=>{
  accessGranted=Boolean(status.access);
  if(!accessGranted && state.phase==='preflight' && !state.presentation)ui.examiner.textContent="登録不要の無料体験を利用できます。他の科目は検証参加者・契約者向けです。";
}).catch(()=>{if(state.phase==='preflight' && !state.presentation)ui.examiner.textContent="無料体験を利用できます。全科目の利用には専用サーバーから起動してください。";});

initThreeWorld();
reset();
setMode("practice");
requestAnimationFrame(loop);
