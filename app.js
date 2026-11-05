import {fitCourseCamera} from './src/course-camera.js';
import {createPresentationNarrator} from './src/presentation-narrator.js';
import {aircraftDimensions,fitAircraftBounds} from './src/aircraft-geometry.js';
import {createControllerInput,keyboardInput,inputCentered} from './src/controller-input.js';
import {summarizeFlight} from './src/flight-results.js';
import {advanceFlightFrame} from './src/flight-frame.js';
import {evaluateFlightCoaching,coachingMessages} from './src/flight-coaching.js';
import {createFlightState, transitionFlightPhase, navigationTarget, desiredAltitude, landedAt, pauseFlight, recordSessionInput, phaseMission, taskLimits, squareTargets, figureEightTargets} from "./src/session-rules.js";
import {evaluateFlightSafety, safetyMessages, coneDimensions} from "./src/flight-safety.js";
import { flightModel, createFlightPhysics, usesPositionHold } from "./src/flight-physics.js";
import { windPresets, windBearingLabel, stepEnvironment } from "./src/flight-environment.js";
import { createMotorAudio, motorAudioParameters } from "./src/motor-audio.js";
import { layouts, expectedHeading, figureEightLap, abnormalTargets } from "./src/course-layout.js";
import { createCourseScene, addExamField, setExamField } from "./src/course-scene.js";
import { createDemonstration } from "./src/demonstration.js";
import { versions, course, evaluateSample, subjects, historyStore } from "./src/training.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

const canvas = document.getElementById("simCanvas");
let narrationRequest=0;
function speakNarration(text) {
  const status=document.getElementById('narrationStatus');
  if(!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    status.textContent='この環境では音声を利用できません。字幕で確認してください。';return;
  }
  const request=++narrationRequest;
  const speech=new SpeechSynthesisUtterance(text);speech.lang='ja-JP';
  const report=message=>{if(request===narrationRequest)status.textContent=message;};
  speech.onstart=()=>report('読み上げ中');
  speech.onend=()=>report('この区間の読み上げが終了しました');
  speech.onerror=()=>report('音声を再生できません。字幕で確認してください。');
  status.textContent='音声を準備中';speechSynthesis.speak(speech);
}
function stopNarration() {
  narrationRequest++;
  if('speechSynthesis' in window)speechSynthesis.cancel();
  document.getElementById('narrationStatus').textContent=document.getElementById('voiceEnabled').checked?'音声停止中':'音声オフ';
}
const presentationNarrator=createPresentationNarrator({speak:speakNarration,stop:stopNarration});

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
  wind: document.getElementById("windReadout"),
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
const motorAudio = createMotorAudio();
const windHeading = from => (from + 180) * Math.PI / 180;



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
  insetCamera: null,
  insetRect: null,
  compactFrames: null,
  framedCourse: null,
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
  world.scene.background = new THREE.Color(0xa9c3d6);
  world.scene.fog = new THREE.Fog(0xc4d3da, 70, 240);

  world.camera = new THREE.PerspectiveCamera(54, 1, 0.1, 320);
  world.insetCamera=new THREE.PerspectiveCamera(34,1,.1,20);
  world.insetCamera.layers.set(1);
  world.insetBackground=new THREE.Color(0x152126);
  world.clock = new THREE.Clock();
  world.cameraLookTarget = new THREE.Vector3(0, 1, 0);
  world.cameraDesiredTarget = new THREE.Vector3(0, 1, 0);
  world.pilotEye = new THREE.Vector3(0, 2.05, -8.5);
  world.camera.position.copy(world.pilotEye);

  const hemi = new THREE.HemisphereLight(0xd8f0ff, 0x465044, 0.55);
  hemi.layers.enable(1);
  world.scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d2, 2.8);
  sun.position.set(-18, 28, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36;
  sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  sun.layers.enable(1);
  world.scene.add(sun);

  loadEnvironment();
  buildTrainingField();
  buildDrone();
  window.addEventListener("resize", resizeRenderer);
  const layoutObserver=new ResizeObserver(resizeRenderer);
  for(const element of document.querySelectorAll('.sim-stage,.top-left,.course-legend,.bottom-center,.telemetry-status'))layoutObserver.observe(element);
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
      world.scene.backgroundBlurriness = .12;
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
  const textures=new THREE.TextureLoader();
  const groundMaterial=new THREE.MeshStandardMaterial({color:0x8f9c78,roughness:1});
  const groundMap=(file,property,srgb=false)=>{
    const texture=textures.load(`assets/textures/grass/${file}`,()=>{groundMaterial.needsUpdate=true;});
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(90,90);
    texture.anisotropy=world.renderer.capabilities.getMaxAnisotropy();
    if(srgb)texture.colorSpace=THREE.SRGBColorSpace;
    groundMaterial[property]=texture;
  };
  groundMap('diffuse.jpg','map',true);groundMap('normal.jpg','normalMap');groundMap('roughness.jpg','roughnessMap');
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(420,420),groundMaterial);
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;world.scene.add(ground);
  // Texture repeats read as a grid from above; only the pilot's low view needs it.
  world.ground={mesh:ground,textured:groundMaterial,plain:new THREE.MeshStandardMaterial({color:0x56663f,roughness:1})};
  buildWindsock();
  for(const id of Object.keys(layouts)) {
    world.fields[id]=createCourseScene(id,addCourseCone);
    world.scene.add(world.fields[id].group);
  }
}

function addCourseCone(THREE, x, z, label, keys, missions, subtitle = "", parent = world.scene) {
  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xf07824, roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(coneDimensions.baseWidth, coneDimensions.baseHeight, coneDimensions.baseWidth), orange);
  base.position.y = coneDimensions.baseHeight / 2;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(coneDimensions.tipRadius, coneDimensions.baseRadius, coneDimensions.bodyHeight, 32), orange);
  body.position.y = coneDimensions.bodyBottom + coneDimensions.bodyHeight / 2;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(coneDimensions.baseRadius*.43, coneDimensions.baseRadius*.57, coneDimensions.bodyHeight*.18, 32), white);
  band.position.y = coneDimensions.bodyBottom + coneDimensions.bodyHeight*.66;
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
    const face = new THREE.Mesh(new THREE.PlaneGeometry(coneDimensions.bodyHeight*.4, coneDimensions.bodyHeight*.4), labelMaterial);
    const labelY=coneDimensions.bodyHeight*.27;
    const radius=coneDimensions.baseRadius-(coneDimensions.baseRadius-coneDimensions.tipRadius)*.27+.006;
    face.position.set(Math.sin(angle)*radius, coneDimensions.bodyBottom+labelY, Math.cos(angle)*radius);
    face.rotation.set(-Math.atan2(coneDimensions.baseRadius-coneDimensions.tipRadius, coneDimensions.bodyHeight), angle, 0, "YXZ");
    group.add(face);
  }
  group.position.set(x, 0, z);
  group.userData = { keys, missions, label };
  parent.add(group);
  world.courseMarkers.push(group);
}

function fitDroneModel(model,rotors) {
  model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model);
  // Expand the horizontal sweep at every rotor angle; local Y rotation keeps mesh height.
  for(const rotor of rotors) {
    rotor.geometry.computeBoundingSphere();
    const sphere=rotor.geometry.boundingSphere.clone();
    // Both supported assets spin these meshes around their local Y axis.
    sphere.radius+=Math.hypot(sphere.center.x,sphere.center.z);
    sphere.center.x=0;sphere.center.z=0;
    sphere.applyMatrix4(rotor.matrixWorld);
    bounds.union(new THREE.Box3().setFromCenterAndSize(sphere.center,new THREE.Vector3(2*sphere.radius,0,2*sphere.radius)));
  }
  const fit=fitAircraftBounds(bounds.min,bounds.max);
  model.scale.setScalar(fit.scale);
  model.position.set(fit.offset.x,fit.offset.y,fit.offset.z);
}

// A real cue for the wind the physics applies: the sock lifts and swings with it.
function buildWindsock() {
  const group=new THREE.Group();
  group.position.set(-7,0,20);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.05,4.2,10),new THREE.MeshStandardMaterial({color:0xd8dde0,roughness:.5}));
  pole.position.y=2.1;pole.castShadow=true;group.add(pole);
  const pivot=new THREE.Group();pivot.position.y=4.2;group.add(pivot);
  const sock=new THREE.Group();pivot.add(sock);
  for(let i=0;i<5;i++) {
    const radius=.26-.036*i,next=.26-.036*(i+1);
    const band=new THREE.Mesh(new THREE.CylinderGeometry(next,radius,.32,14,1,true),new THREE.MeshStandardMaterial({color:i%2?0xf4f1ea:0xe2522f,side:THREE.DoubleSide,roughness:.8}));
    band.rotation.x=Math.PI/2;band.position.z=.16+.32*i;band.castShadow=true;sock.add(band);
  }
  world.scene.add(group);
  world.windsock={pivot,sock};
}

function updateWindsock(dt) {
  if(!world.windsock)return;
  const environment=state.environment;
  const mean=windPresets[environment.preset].meanSpeed;
  const speed=state.running?environment.wind.speed:mean;
  const heading=state.running&&speed>.01?Math.atan2(environment.wind.x,environment.wind.z):windHeading(environment.windFromDeg);
  const lift=Math.min(1,speed/4.5);
  // The scene mirrors logical x so that the pilot's right matches the screen.
  world.windsock.pivot.rotation.y=-heading;
  const time=performance.now()/1000;
  const flutter=lift>0?Math.sin(time*(3+lift*5))*.05+Math.sin(time*7.3)*.03:0;
  const target=(1-lift)*1.45+flutter-.04;
  world.windsock.sock.rotation.x+=(target-world.windsock.sock.rotation.x)*(1-Math.exp(-dt*4));
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
  fitDroneModel(fallback,world.propellers);
  group.add(fallback);
  world.headingArrow=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(0,aircraftDimensions.halfHeight+.06,0),aircraftDimensions.radius*1.8,0x58ffb0,.22,.16);
  group.add(world.headingArrow);

  world.shadow = new THREE.Mesh(
    new THREE.CircleGeometry(aircraftDimensions.radius, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false })
  );
  world.shadow.rotation.x = -Math.PI / 2;
  world.shadow.position.y = 0.035;
  world.scene.add(world.shadow);

  group.traverse(child=>child.layers.enable(1));
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
      const rotors=[];
      model.traverse(child=>{if(child.isMesh && child.name.startsWith('Prop'))rotors.push(child);});
      fitDroneModel(model,rotors);
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

      model.traverse(child=>child.layers.enable(1));
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
  const inset=document.getElementById('aircraftInsetViewport').getBoundingClientRect();
  world.insetRect={x:inset.left-rect.left,y:rect.bottom-inset.bottom,width:inset.width,height:inset.height};
  world.compactFrames=null;
  if(width<=1200&&!examSession) {
    const local=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top-rect.top,bottom:r.bottom-rect.top};};
    const headerBottom=Math.max(...['.top-left','.view-controls','.telemetry-status'].map(selector=>local(selector).bottom),document.getElementById('aircraftInset').hidden?0:local('.aircraft-inset').bottom);
    const footerTop=Math.min(...['.course-legend','.top-right','.bottom-center'].map(selector=>local(selector).top));
    const area={left:12,right:width-12,top:headerBottom+12,bottom:Math.max(headerBottom+112,footerTop-12)};
    const group=world.fields[state.courseId].group;
    world.compactFrames={overview:fitCourseCamera(world.camera,group,area,width,height,'overview'),top:fitCourseCamera(world.camera,group,area,width,height,'top')};
  }
  world.framedCourse=state.courseId;world.snapCamera=true;
}

function updateThreeWorld(dt) {
  if (!state.threeReady) return;
  const d = state.drone;
  const layout=layouts[state.courseId];
  if(world.framedCourse!==state.courseId)resizeRenderer();
  for(const [id,field] of Object.entries(world.fields)) {
    field.group.visible=id===state.courseId;
    // Keep the real cone lettering; floating captions would hide a landed aircraft.
    field.annotations.visible=state.cameraMode!=='pilot';
    field.markerLabels.visible=state.cameraMode!=='pilot';
    field.guides.visible=state.mode==='practice' || Boolean(state.presentation);
    if(examSession&&!field.exam)addExamField(field);
    if(field.exam)setExamField(field,Boolean(examSession));
  }
  world.pilotEye.set(layout.pilot.x, 1.65, layout.pilot.z);
  world.drone.position.set(-d.x, d.y + aircraftDimensions.centerHeight, d.z);
  world.drone.rotation.set(d.pitch, -d.yaw, -d.roll);
  world.headingArrow.visible=!examSession&&(state.mode==='practice' || Boolean(state.presentation));

  if (world.droneMixer) {
    world.droneMixer.timeScale = clamp((d.thrustNewtons - 0.5) / 4.5, 0, 3.2);
    world.droneMixer.update(dt);
  }
  world.propellers.forEach((prop, index) => {
    // Fallback mesh order is rear/front in scene x, which mirrors logical x.
    const motorThrust = d.motors?.[[3,2,0,1][index]] ?? d.thrustNewtons / 4;
    const rotorSpeed = 8 + motorThrust * 7.2;
    prop.rotation.y += (index % 2 ? -1 : 1) * rotorSpeed * dt;
  });
  world.rotorDiscs.forEach((disc) => {
    const thrustAcceleration = d.thrustNewtons / flightModel.massKg;
    disc.material.opacity = clamp((thrustAcceleration - 3) / 55, 0, 0.22);
  });

  updateWindsock(dt);
  world.ground.mesh.material=state.cameraMode==='pilot'?world.ground.textured:world.ground.plain;
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
    ? state.courseId
    : mission;
  for (const marker of world.courseMarkers) {
    marker.visible = marker.userData.missions.includes(markerMission);
    const active = state.mode === "practice" && marker.userData.keys.includes(activeKey);
    // Fixed physical markers stay visible in mock exams; only practice adds a highlight.
    marker.children[0].material.color.setHex(examSession?0xeac52b:0xf07824);
    marker.children[0].material.emissive.setHex(active ? 0x572500 : 0x000000);
  }

  const cameraBlend=world.snapCamera?1:1-Math.exp(-dt*7);
  const positionBlend=world.snapCamera?1:1-Math.exp(-dt*5);
  const target=new THREE.Vector3(0,0.5,layout.centerZ);
  const compactFrame=world.compactFrames?.[state.cameraMode];
  world.camera.far=compactFrame?.far??320;
  // Keep the entire fitted course clear; distant background may still fade.
  world.scene.fog.near=compactFrame?compactFrame.far:70;
  world.scene.fog.far=compactFrame?compactFrame.far+50:240;
  if(!compactFrame)world.camera.clearViewOffset();
  if(compactFrame) {
    world.camera.setViewOffset(canvas.clientWidth,canvas.clientHeight,compactFrame.offset.x,compactFrame.offset.y,canvas.clientWidth,canvas.clientHeight);
    target.copy(compactFrame.target);world.camera.position.lerp(compactFrame.position,positionBlend);
  } else if(state.cameraMode==='pilot') {
    world.camera.position.lerp(world.pilotEye,cameraBlend);
    target.set(-d.x,Math.max(.45,d.y+.18),d.z);
  } else if(state.cameraMode==='top') {
    // Include the pilot and dimension captions below the course, clear of HUDs.
    const centerZ=(layout.pilot.z-1.5+layout.centerZ+layout.fieldDepth/2+1)/2;
    target.set(0,0,centerZ);
    world.camera.position.lerp(new THREE.Vector3(0,32.5,centerZ-.01),positionBlend);
  } else {
    world.camera.position.lerp(new THREE.Vector3(12,16,layout.centerZ-19),positionBlend);
  }
  world.cameraLookTarget.lerp(target,cameraBlend);
  world.snapCamera=false;
  world.camera.lookAt(world.cameraLookTarget);
  updateCourseReadouts();

  const renderer=world.renderer;
  const teachingView=state.mode==='practice' || Boolean(state.presentation);
  const zoomControl=document.getElementById('aircraftZoomEnabled');
  zoomControl.disabled=!teachingView;
  const visualOnly=document.getElementById('visualOnly').checked;
  const showInset=!examSession&&teachingView && zoomControl.checked && !visualOnly;
  const insetPanel=document.getElementById('aircraftInset');
  if(insetPanel.dataset.view!==state.cameraMode) {insetPanel.dataset.view=state.cameraMode;resizeRenderer();}
  if(insetPanel.hidden===showInset) {insetPanel.hidden=!showInset;resizeRenderer();}
  renderer.setViewport(0,0,canvas.clientWidth,canvas.clientHeight);
  renderer.render(world.scene, world.camera);
  if(showInset && world.insetRect?.width>0) {
    const box=world.insetRect,camera=world.insetCamera;
    camera.aspect=box.width/box.height;camera.updateProjectionMatrix();
    camera.position.copy(world.drone.position).add(new THREE.Vector3(0,2.8,-2.8));
    camera.lookAt(world.drone.position);
    // Render the same animated aircraft and heading arrow; layer 1 excludes the course.
    renderer.setViewport(box.x,box.y,box.width,box.height);
    renderer.setScissor(box.x,box.y,box.width,box.height);renderer.setScissorTest(true);
    const updateShadows=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;
    // The close-up keeps a plain backdrop so the aircraft stands out from the sky.
    const background=world.scene.background;world.scene.background=world.insetBackground;
    renderer.render(world.scene,camera);
    world.scene.background=background;
    renderer.shadowMap.autoUpdate=updateShadows;renderer.setScissorTest(false);
    renderer.setViewport(0,0,canvas.clientWidth,canvas.clientHeight);
    document.getElementById('insetHeading').textContent=`${Math.round(((d.yaw*180/Math.PI)%360+360)%360)}°`;
  }
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
  presentationNarrator.reset();
  if(document.getElementById("voiceEnabled").checked)speakNarration(copy.line);
  const missionIndex = missionOrder.indexOf(nextMission);
  ui.missions.forEach((item) => {
    const itemIndex = missionOrder.indexOf(item.dataset.mission);
    item.classList.toggle("current", item.dataset.mission === nextMission);
    item.classList.toggle("done", itemIndex < missionIndex);
  });
}

function reset(nextSubject) {
  if(examScreen){examScreen.destroy();examScreen=null;examSession=null;examFlightStage=null;state.running=false;state.mode=examReturnMode;}
  presentationNarrator.reset();
  const selectedSubject=typeof nextSubject==="string"?nextSubject:state.subject;
  state.presentation=null;
  document.getElementById("presentationControls").hidden=true;
  if(state.running && state.elapsed>0) {
    state.interrupted=true;
    state.evaluation.events.push({type:"interrupted",points:0,phase:state.phase,time:state.elapsed,position:{x:state.drone.x,z:state.drone.z}});
    finishExam();
  }
  Object.assign(state,createFlightState(selectedSubject,{preset:document.getElementById("windSelect").value,seed:crypto.getRandomValues(new Int32Array(1))[0]}));
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
  const examSubject=isExamSubject(selectedSubject);
  document.getElementById('checklistPanel').hidden=examSubject;
  if(examSubject){ui.start.disabled=false;ui.start.textContent=selectedSubject==='exam'?'本番形式の受付へ':'飛行を開始';}
  if(subjects[selectedSubject]?.examStage)ui.examiner.textContent='受付と口述を省き、本番と同じ画面と採点でこの飛行だけを行います。';
}

async function startExam() {
  if(state.running || state.presentation) return;
  if(isExamSubject(state.subject)){await startFullExam();return;}
  // Browsers only allow audio to begin from the user's start click.
  if(document.getElementById("motorSoundEnabled").checked)motorAudio.start();
  pollController(0);
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
    ui.examiner.textContent = controllerStatus.connected?controllerStatus.instruction:"外部コントローラーを接続してください。開発者モードではキーボード操作で開始できます。";
    return;
  }
  if (!state.threeReady) { ui.examiner.textContent = "3D画面の準備が完了していません。再読み込みしてください。"; return; }
  if (!state.developerMode && (!controllerStatus.canFly || !controllerStatus.centered)) { ui.examiner.textContent="操作確認を終え、両方のスティックを中立へ戻してから開始してください。";return; }
  if(state.developerMode&&!inputCentered(keyboardInput(state.keys))){ui.examiner.textContent="操縦キーを離してから開始してください。";return;}
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
  recordSessionInput(state,state.developerMode?null:state.calibration,state.developerMode?'keyboard':'controller');
}

function connectedPads() {
  try {return navigator.getGamepads?Array.from(navigator.getGamepads()):[];}catch{return [];}
}
function readInput() {
  return state.developerMode?keyboardInput(state.keys):controllerStatus.input;
}

const updatePhysics = createFlightPhysics({state,clamp,trainingNow,targetAltitude,currentNavigationTarget,angleDifference});

function updateMission(dt) {
  if(examSession){if(state.running)advanceExam(dt,true);return;}
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
  if(examSession){sendExam({type:"interrupt",reason:"入力・利用権の中断"});return;}
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
  const record={participantId:getParticipantId(),environment:{userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight]},id:crypto.randomUUID(),at:new Date().toISOString(),versions,conditions:flightConditions(),subject:state.subject,mode:state.mode,score:result.score,elapsed:state.elapsed,endingPhase,progress:result.progress,retrySubject:result.retrySubject,interrupted:state.interrupted,developerMode:state.developerMode,calibration:state.sessionCalibration,inputConfigurations:state.inputConfigurations,events:state.evaluation.events,feedback:result.feedback,flightRecords:state.flightRecords};
  try { savedHistory.append(record);document.getElementById("saveStatus").textContent="このブラウザに履歴を保存しました。"; }
  catch {document.getElementById("saveStatus").textContent="履歴を保存できません。今回のログをダウンロードしてください。";}
  renderHistory();renderEvents(record);
}

function flightConditions() {
  const {preset,seed,windFromDeg}=state.environment;
  return {windPreset:preset,windMeanMps:windPresets[preset].meanSpeed,windFromDeg,seed};
}

function recordTelemetry() {
  const second = Math.floor(state.elapsed);
  if (second === state.lastLogSecond) return;
  state.lastLogSecond = second;
  const d = state.drone;
  const positionHold = usesPositionHold(state.phase);
  const airflow = state.environment.wind;
  state.flightRecords.push({
    scenario_id: phaseMission[state.phase] === "abnormal" ? "S01_SENSOR_FAIL" : "N01_NORMAL",
    elapsed_s: second,
    timestamp_jst: formatJstTimestamp(new Date()),
    phase: state.phase,
    input_configuration: state.inputConfigurations.length-1,
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
    wind_speed_mps: Number(airflow.speed.toFixed(2)),
    wind_from_deg: airflow.speed>0 ? Number(((Math.atan2(-airflow.x,-airflow.z)*180/Math.PI+360)%360).toFixed(1)) : null,
  });
}

function downloadFlightLog() {
  if (!state.flightRecords.length) return;
  const payload = {
    metadata: {
      versions,
      subject: state.subject,
      conditions: flightConditions(),
      interrupted: state.interrupted,
      calibration: state.sessionCalibration,
      input_configurations: state.inputConfigurations,
      evaluation_events: state.evaluation.events,
      document_title: "二等無人航空機実地試験 3D再現ログ",
      geodetic_frame: "LOCAL_ENU",
      origin: { name: "A点離着陸基準点", x_east_m: 0, y_north_m: 0, z_up_m: 0 },
      official_course_limits_s: taskLimits,
      note: "位置・センサー周波数・風は3D再現用の仮定です。実測値ではありません。",
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
  // The readout is the barometric altimeter, which can differ from the true height.
  ui.altitude.textContent = `${(state.running ? state.altimeter : d.y).toFixed(1)}m`;
  ui.speed.textContent = `${Math.hypot(d.vx, d.vz, d.vy).toFixed(1)}m/s`;
  ui.time.textContent = formatTime(state.elapsed);
  const mission = phaseMission[state.phase];
  const remaining = taskLimits[mission] ? Math.max(0, taskLimits[mission] - state.taskElapsed) : null;
  ui.taskTime.textContent = remaining === null ? "--:--" : formatTime(remaining);
  ui.battery.textContent = `${state.batteryPct.toFixed(0)}%`;
  const positionHold = state.presentation ? state.courseId!=="abnormal" : usesPositionHold(state.phase);
  const {meanSpeed,label}=windPresets[state.environment.preset];
  ui.wind.textContent = state.presentation ? "見本：風の計算なし" : meanSpeed>0 ? `風 平均${meanSpeed.toFixed(1)}m/s ${windBearingLabel(state.environment.windFromDeg)}から（訓練設定）` : `${label}（訓練設定）`;
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
  const raw=preview?{yaw:0,throttle:0,strafe:0,forward:0}:!state.developerMode&&(!state.running||state.paused)?controllerStatus.preview:input;
  const points=[[raw.yaw,raw.throttle],[raw.strafe,raw.forward],[applied.yaw,applied.throttle],[applied.strafe,applied.forward]];
  points.forEach(([x,y],i)=>{ui.sticks[i].style.transform=`translate(${x*34}px,${-y*34}px)`;});
  ui.inputStatus.textContent=preview ? "見本飛行：操縦入力は使いません" : state.paused ? "一時停止：機体への指令は停止中" : state.developerMode ? "キーボード入力" : controllerStatus.canFly ? "コントローラー入力" : controllerStatus.connected ? "操作確認中：機体は動きません" : "コントローラーを接続してください";
  ui.inputValues.textContent=`高度 ${Math.round(raw.throttle*100)}%・旋回 ${Math.round(raw.yaw*100)}%・前後 ${Math.round(raw.forward*100)}%・左右 ${Math.round(raw.strafe*100)}%`;
}

function updateMotorSound() {
  if(!state.running || state.paused || state.presentation || !document.getElementById("motorSoundEnabled").checked){motorAudio.update(null);return;}
  const d=state.drone,pilot=layouts[state.courseId].pilot;
  motorAudio.update(motorAudioParameters(d.motors,flightModel.maxThrustNewtons/4,{distance:Math.hypot(d.x-pilot.x,d.y-1.65,d.z-pilot.z),lateral:d.x-pilot.x}));
}

function loop() {
  const frameDt = world.clock ? Math.min(0.1, world.clock.getDelta()) : 0.016;
  if(state.presentation) {
    updatePresentation(frameDt);updateThreeWorld(frameDt);renderReadouts();renderInputMonitor({});requestAnimationFrame(loop);return;
  }
  pollController(frameDt);
  const input = readInput();
  renderInputMonitor(input);
  if(examSession&&!examModules.flow.isExamFlight(examSession)){
    if(examSession.stage!=='result')stepEnvironment(state.environment,frameDt,1.5);
    advanceExam(frameDt,false);
  }
  advanceFlightFrame(state,frameDt,input,updatePhysics,updateMission);
  if(examScreen)examScreen.render(examSession,state.environment,state.paused,examPauseReason);
  updateThreeWorld(frameDt);
  updateMotorSound();
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

function currentNavigationTarget() { return examSession?.practical?examModules.practical.practicalTarget(examSession.practical):navigationTarget(state); }
function targetAltitude() { return examSession?.practical?examModules.practical.practicalAltitude(examSession.practical):desiredAltitude(state); }

ui.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
ui.start.addEventListener("click", startExam);
ui.reset.addEventListener("click", reset);
ui.downloadLog.addEventListener("click", downloadFlightLog);
ui.developerMode.addEventListener("click", () => {
  if(state.running) return;
  state.developerMode = !state.developerMode;
  state.keys.clear();
  ui.developerMode.classList.toggle("active", state.developerMode);
  ui.developerMode.textContent = state.developerMode
    ? "開発者モード: キーボード操作 ON"
    : "開発者モード: キーボード操作 OFF";
});
window.addEventListener("keydown", (event) => {
  if (["INPUT","TEXTAREA","SELECT"].includes(event.target.tagName) || event.target.isContentEditable)return;
  if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyE", "KeyQ", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }
  state.keys.add(event.code);
});
window.addEventListener("keyup", (event) => state.keys.delete(event.code));
window.addEventListener('gamepadconnected',()=>pollController(0));
window.addEventListener('gamepaddisconnected',event=>{
  if(event.gamepad.index===controllerStatus.padIndex){controllerInput.requireConfirmation();if(!state.developerMode)pauseTraining('接続が切れました。再接続後に中立を確認してください。');}
  pollController(0);
});
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
  presentationNarrator.update({...sample,enabled:document.getElementById("voiceEnabled").checked,paused:player.paused});
  if(sample.done)player.paused=true;
  if(player.paused)document.getElementById("presentationPause").textContent=sample.done?"もう一度再生":"再生";
}
document.getElementById("watchButton").addEventListener("click",()=>{
  const subject=state.subject==='exam'?'full':subjects[state.subject].demoSubject||state.subject;reset();
  const timeline=createDemonstration(subject);
  state.presentation={timeline,time:0,speed:Number(document.getElementById("presentationSpeed").value),paused:false};
  ui.modeBadge.textContent="解説付き見本";
  document.getElementById("presentationControls").hidden=false;
  document.getElementById("presentationSeek").max=timeline.duration;
  document.getElementById("presentationPause").textContent="一時停止";
  updatePresentation(0);
});
document.getElementById("presentationPause").addEventListener("click",()=>{
  if(!state.presentation)return;const p=state.presentation;if(p.time>=p.timeline.duration)p.time=0;p.paused=!p.paused;document.getElementById("presentationPause").textContent=p.paused?"再生":"一時停止";
  if(p.paused)presentationNarrator.reset();
  updatePresentation(0);
});
document.getElementById("presentationSeek").addEventListener("input",event=>{if(state.presentation){state.presentation.time=Number(event.target.value);world.snapCamera=true;updatePresentation(0);}});
document.getElementById("presentationSpeed").addEventListener("change",event=>{if(state.presentation)state.presentation.speed=Number(event.target.value);});
document.getElementById("presentationStop").addEventListener("click",()=>{reset();setMode(state.mode);});
document.getElementById('voiceEnabled').addEventListener('change',()=>{
  presentationNarrator.reset();
  if(state.presentation)updatePresentation(0);
  else if(document.getElementById('voiceEnabled').checked)speakNarration(ui.examiner.textContent);
});
document.querySelectorAll("[data-camera]").forEach(button=>button.addEventListener("click",()=>{if(examSession)return;state.cameraMode=button.dataset.camera;world.snapCamera=true;document.querySelectorAll("[data-camera]").forEach(item=>item.classList.toggle("active",item===button));}));

function getParticipantId() {
  try {let id=localStorage.getItem("drone.participant.v1");if(!id){id=crypto.randomUUID();localStorage.setItem("drone.participant.v1",id);}return id;}catch{return "unsaved";}
}
function trainingNow() { return state.simulationTime * 1000; }
let accessGranted = false;
let premiumMission = null;
let examSession = null, examScreen = null, examModules = null, examFlightStage = null, examPauseReason = '', examSaved = false, examReturnMode = 'practice';
const savedHistory = historyStore({getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value),removeItem:key=>window.localStorage.removeItem(key)});
const controllerInput=createControllerInput({
  load:()=>JSON.parse(localStorage.getItem('drone.calibration.v2')||'null'),
  save:profile=>localStorage.setItem('drone.calibration.v2',JSON.stringify(profile)),
});
let controllerStatus=controllerInput.update([],0);
function pollController(dt) {
  controllerStatus=controllerInput.update(connectedPads(),dt);
  state.calibration=controllerStatus.calibration;
  state.inputReady=state.developerMode || controllerStatus.canFly;
  if(state.running && !state.developerMode && (controllerStatus.changed || !controllerStatus.canFly))pauseTraining('入力を確認できないため停止しました。接続と中立を確認してから再開してください。');
  ui.controller.textContent=state.developerMode?'開発者モード: キーボード操作':controllerStatus.connected?`${controllerStatus.id} / ${controllerStatus.canFly?'操作確認済み':controllerStatus.compatible?'操作確認が必要':'未対応の入力'}`:'外部コントローラー未接続';
  ui.controller.classList.toggle('ready',state.inputReady);
  const instruction=document.getElementById('controllerInstruction');
  if(instruction.textContent!==controllerStatus.instruction)instruction.textContent=controllerStatus.instruction;
  document.getElementById('axisReadout').textContent=controllerStatus.axes.length===4?controllerStatus.axes.map((v,i)=>`${['左左右','左上下','右左右','右上下'][i]}: ${Number.isFinite(v)?v.toFixed(2):'読取不可'}`).join(' / '):'4軸の入力を待っています';
  document.getElementById('controllerProgress').value=controllerStatus.canFly?8:controllerStatus.step;
  document.getElementById('controllerProgressText').textContent=controllerStatus.canFly?'8方向・中立の確認完了':controllerStatus.hasSaved?'8方向は確認済み。保存設定の中立を再確認':`方向確認 ${controllerStatus.step}/8`;
  const busy=state.running&&!state.paused;
  const button=document.getElementById('calibrateButton');button.disabled=busy||!controllerStatus.compatible;
  button.textContent=controllerStatus.hasSaved?'保存設定の中立を確認':'操作確認と校正を開始';
  const recheck=document.getElementById('recheckButton');recheck.hidden=!controllerStatus.hasSaved;recheck.disabled=busy;
}
function pauseTraining(message) {
  if(examSession){pauseFullExam(message);return;}
  if(!pauseFlight(state))return;
  if(!state.developerMode){controllerInput.requireConfirmation();state.calibration=null;}
  presentationNarrator.reset();
  document.getElementById('pauseButton').textContent=state.mode==='exam'?'中断して結果を確認':'確認して再開';
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
document.getElementById('calibrateButton').addEventListener('click',()=>{
  if(state.running&&!state.paused)return;
  controllerInput.begin();pollController(0);
});
document.getElementById('recheckButton').addEventListener('click',()=>{
  if(state.running&&!state.paused)return;
  controllerInput.begin({full:true});pollController(0);
});
document.getElementById("subjectSelect").addEventListener("change",(event)=>{reset(event.target.value);});
document.getElementById("windSelect").addEventListener("change",()=>{if(!state.running)reset();else document.getElementById("windSelect").value=state.environment.preset;});
document.getElementById("visualOnly").addEventListener("change",event=>{document.querySelector(".top-right").classList.toggle("visual-only",event.target.checked);});
document.getElementById("pauseButton").addEventListener("click",()=>{
  if(!state.paused) {pauseTraining("一時停止しました。");return;}
  pollController(0);
  if(state.mode==="exam") {state.evaluation.events.push({type:"interrupted",points:0,phase:state.phase,time:state.elapsed,position:{x:state.drone.x,z:state.drone.z}});finishExam();return;}
  if(state.developerMode?!inputCentered(keyboardInput(state.keys)):!controllerStatus.canFly||!controllerStatus.centered){ui.examiner.textContent="接続と中立の確認を終え、操縦入力を離してから再開してください。";return;}
  recordSessionInput(state,state.developerMode?null:state.calibration,state.developerMode?'keyboard':'controller');
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
  if((!state.running&&!examSession) || examSession?.stage==='result' || state.subject==="demo") return;
  try {const status=await fetch("/api/status").then(r=>r.json());if(!status.access){accessGranted=false;pauseTraining("利用期間が終了しました。履歴を保存して終了します。");finishExam();}}
  catch {pauseTraining("利用状況を確認できません。一度終了して再接続してください。");}
},30000);
renderHistory();
state.subject=document.getElementById("subjectSelect").value;
const initialSubject=new URLSearchParams(location.search).get("subject");
if(subjects[initialSubject]) {state.subject=initialSubject;document.getElementById("subjectSelect").value=initialSubject;}
fetch("/api/status").then(response=>response.json()).then(status=>{
  accessGranted=Boolean(status.access);
  if(status.localDev) {
    if(!state.developerMode&&!state.running)document.getElementById("developerModeButton").click();
    if(state.phase==='preflight' && !state.presentation)ui.examiner.textContent="ローカル開発用：ログインなしで全科目を利用できます。キーボード操作はONです。";
  }
  if(!accessGranted && state.phase==='preflight' && !state.presentation)ui.examiner.textContent="登録不要の無料体験を利用できます。他の科目は検証参加者・契約者向けです。";
}).catch(()=>{if(state.phase==='preflight' && !state.presentation)ui.examiner.textContent="無料体験を利用できます。全科目の利用には専用サーバーから起動してください。";});

initThreeWorld();
reset();
setMode("practice");
requestAnimationFrame(loop);


function isExamSubject(subject) {return subject==='exam'||Boolean(subjects[subject]?.examStage);}
async function startFullExam() {
  ui.start.disabled=true;
  try {
    const status=await fetch('/api/status').then(r=>r.json());
    if(!status.access){ui.examiner.textContent='本番形式には全科目と同じ利用権が必要です。';return;}
    pollController(0);
    if(!state.threeReady||!state.inputReady||(!state.developerMode&&!controllerStatus.centered)||!inputCentered(readInput())) {ui.examiner.textContent='3Dの読込と入力の操作確認を終え、スティックを中立にしてください。';return;}
    const [flow,practical,screen]=await Promise.all([import('./src/exam-flow.js'),import('./src/exam-practical.js'),import('./src/exam-ui.js')]);
    examModules={flow,practical};
    const now=new Date(),local=new Date(now.getTime()+9*3600000);
    const flightOnly=subjects[state.subject].examStage||null;
    examSession=flow.createExam({seed:crypto.getRandomValues(new Uint32Array(1))[0],date:local.toISOString().slice(0,10),epoch:local.getTime(),wind:{label:windPresets[state.environment.preset].label,speed:state.environment.wind.speed},flightOnly});
    if(document.getElementById('motorSoundEnabled').checked)motorAudio.start();
    examReturnMode=state.mode;state.mode='exam';state.cameraMode='pilot';world.snapCamera=true;state.running=false;state.paused=false;state.keys.clear();
    examSaved=false;examPauseReason='';
    const leave=()=>{reset(state.subject);resizeRenderer();};
    examScreen=screen.createExamUI({stageElement:document.querySelector('.sim-stage'),send:sendExam,resume:resumeFullExam,exit:leave,title:subjects[state.subject].label,retry:flightOnly?()=>{leave();startFullExam();}:null});
    syncExamFlight();examScreen.render(examSession,state.environment);resizeRenderer();
  } catch(error) {ui.examiner.textContent='本番形式の準備に失敗しました。利用権と読込を確認してください。';console.error(error);}
  finally {ui.start.disabled=false;}
}
// One stray click outside the window must not discard a whole exam. Paper stages keep
// running; flight stops the aircraft and resumes only from checked, neutral sticks.
function pauseFullExam(message) {
  if(!examModules.flow.isExamFlight(examSession)||!pauseFlight(state))return;
  if(!state.developerMode){controllerInput.requireConfirmation();state.calibration=null;}
  examPauseReason=message;sendExam({type:'pause',reason:message});
}
function resumeFullExam() {
  if(!examSession||!state.paused)return;
  pollController(0);
  const ready=state.developerMode?inputCentered(keyboardInput(state.keys)):controllerStatus.canFly&&controllerStatus.centered;
  if(!ready){examPauseReason='接続と中立の確認を終え、操縦入力を離してから再開してください。';examScreen?.render(examSession,state.environment,true,examPauseReason);return;}
  state.paused=false;state.physicsAccumulator=0;examPauseReason='';examScreen?.render(examSession,state.environment,false);
}
function saveFullExam() {
  if(examSaved||examSession.stage!=='result')return;
  examSaved=true;
  const result=examModules.flow.examResult(examSession);
  try {savedHistory.append({participantId:getParticipantId(),id:crypto.randomUUID(),at:new Date().toISOString(),versions,conditions:flightConditions(),subject:state.subject,mode:'exam',score:result.fatal?0:result.remaining,elapsed:examSession.elapsed,interrupted:Boolean(examSession.interrupted||examSession.pauses),developerMode:state.developerMode,examRows:result.rows,events:[],flightRecords:[],feedback:[],progress:[]});renderHistory();}catch{}
}
function sendExam(event) {
  if(!examSession)return;
  examSession=examModules.flow.reduceExam(examSession,event);syncExamFlight();saveFullExam();examScreen?.render(examSession,state.environment,state.paused,examPauseReason);
}
function syncExamFlight() {
  const flying=examModules.flow.isExamFlight(examSession),p=examSession.practical;
  if(flying&&p) {
    const phase=examModules.practical.practicalPhase(p);
    if(examFlightStage!==examSession.stage) {
      if(state.drone.y>.001){sendExam({type:'interrupt',reason:'接地前のコース変更を中止'});return;}
      transitionFlightPhase(state,phase);state.hasTakenOff=false;state.groundTime=0;state.touchdowns=[];state.keys.clear();
      examFlightStage=examSession.stage;world.snapCamera=true;resizeRenderer();
    }
    state.phase=phase;state.squareIndex=Math.max(0,p.step-1);state.eightIndex=p.eightIndex;state.abnormalIndex=Math.min(3,Math.max(0,p.step-1));
    Object.assign(takeoffPoint,layouts[p.courseId].takeoff);
  }
  state.running=flying&&examSession.stage!=='result';
  if(!flying){state.keys.clear();state.command={throttle:0,forward:0,strafe:0,yaw:0};}
}
function advanceExam(dt,flight) {
  if(!examSession||state.paused)return;
  const sample=flight?{drone:state.drone,input:state.rawInput,gust:state.environment.gust,touchdowns:state.touchdowns,groundTime:state.groundTime,windSpeed:state.environment.wind.speed,simulationTime:state.simulationTime}:null;
  examSession=examModules.flow.tickExam(examSession,dt,sample);syncExamFlight();saveFullExam();
}
