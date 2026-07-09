import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const smallScreen = window.matchMedia("(max-width: 720px)").matches;

const canvas = document.createElement("canvas");
canvas.id = "finsight-scene";
canvas.setAttribute("aria-hidden", "true");
document.body.prepend(canvas);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, smallScreen ? 1.35 : 1.75));
renderer.setClearColor(0x02040a, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02040a, 0.022);

const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 140);
camera.position.set(0, 12, 31);
camera.lookAt(0, 0, 0);

const rig = new THREE.Group();
scene.add(rig);

const keyLight = new THREE.DirectionalLight(0x5d8dff, 2.1);
keyLight.position.set(-7, 18, 14);
scene.add(keyLight);
scene.add(new THREE.AmbientLight(0x39d0d8, 0.55));

const floorLines = new THREE.Group();
const gridMaterial = new THREE.LineBasicMaterial({
  color: 0x29456e,
  transparent: true,
  opacity: 0.52,
});
const gridAccent = new THREE.LineBasicMaterial({
  color: 0x39d0d8,
  transparent: true,
  opacity: 0.3,
});

function addLine(a, b, material) {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
  floorLines.add(new THREE.Line(geometry, material));
}

for (let i = -28; i <= 28; i += 2) {
  const material = i % 8 === 0 ? gridAccent : gridMaterial;
  addLine(new THREE.Vector3(i, -3.4, -32), new THREE.Vector3(i, -3.4, 18), material);
  addLine(new THREE.Vector3(-28, -3.4, i - 10), new THREE.Vector3(28, -3.4, i - 10), material);
}
rig.add(floorLines);

const barCount = smallScreen ? 54 : 96;
const barGeometry = new THREE.BoxGeometry(0.24, 1, 0.24);
const barMaterial = new THREE.MeshStandardMaterial({
  color: 0x5d8dff,
  emissive: 0x17345e,
  metalness: 0.26,
  roughness: 0.48,
  transparent: true,
  opacity: 0.84,
});
const bars = new THREE.InstancedMesh(barGeometry, barMaterial, barCount);
const barSeeds = [];
const dummy = new THREE.Object3D();

for (let i = 0; i < barCount; i += 1) {
  const col = i % 16;
  const row = Math.floor(i / 16);
  barSeeds.push({
    x: (col - 7.5) * 1.52,
    z: -22 + row * 2.45,
    phase: Math.random() * Math.PI * 2,
    amp: 0.72 + Math.random() * 1.8,
  });
}
rig.add(bars);

const tracePoints = [];
for (let i = 0; i < 160; i += 1) {
  const x = (i / 159 - 0.5) * 33;
  const y = Math.sin(i * 0.22) * 1.2 + Math.sin(i * 0.051) * 2.2 + 1.4;
  const z = -16 + Math.cos(i * 0.075) * 2.8;
  tracePoints.push(new THREE.Vector3(x, y, z));
}
const traceGeometry = new THREE.BufferGeometry().setFromPoints(tracePoints);
const traceMaterial = new THREE.LineBasicMaterial({
  color: 0x39d0d8,
  transparent: true,
  opacity: 0.92,
});
const trace = new THREE.Line(traceGeometry, traceMaterial);
rig.add(trace);

const glowTrace = new THREE.Line(
  traceGeometry.clone(),
  new THREE.LineBasicMaterial({
    color: 0x8b7cf7,
    transparent: true,
    opacity: 0.38,
  }),
);
glowTrace.scale.set(1.002, 1.045, 1.002);
rig.add(glowTrace);
const ribbonGeometries = [];
const ribbonSettings = [
  { color: 0x39d0d8, opacity: 0.54, baseY: 5.8, z: -17, phase: 0.2 },
  { color: 0x5d8dff, opacity: 0.42, baseY: 3.6, z: -13, phase: 1.7 },
  { color: 0x8b7cf7, opacity: 0.32, baseY: 7.4, z: -22, phase: 3.1 },
];
for (const setting of ribbonSettings) {
  const points = [];
  for (let i = 0; i < 220; i += 1) {
    const x = (i / 219 - 0.5) * 52;
    const y = setting.baseY + Math.sin(i * 0.13 + setting.phase) * 0.72;
    const z = setting.z + Math.cos(i * 0.08 + setting.phase) * 1.4;
    points.push(new THREE.Vector3(x, y, z));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: setting.color,
    transparent: true,
    opacity: setting.opacity,
  });
  ribbonGeometries.push({ geometry, setting });
  rig.add(new THREE.Line(geometry, material));
}

const particleCount = smallScreen ? 240 : 440;
const particlePositions = new Float32Array(particleCount * 3);
const particleSeeds = [];
for (let i = 0; i < particleCount; i += 1) {
  const x = (Math.random() - 0.5) * 48;
  const y = Math.random() * 17 - 1;
  const z = Math.random() * -42 + 12;
  particlePositions[i * 3] = x;
  particlePositions[i * 3 + 1] = y;
  particlePositions[i * 3 + 2] = z;
  particleSeeds.push(Math.random() * Math.PI * 2);
}
const particleGeometry = new THREE.BufferGeometry();
particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
const particles = new THREE.Points(
  particleGeometry,
  new THREE.PointsMaterial({
    color: 0x9cbcff,
    size: smallScreen ? 0.036 : 0.05,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  }),
);
scene.add(particles);

function resize() {
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.position.z = width < 760 ? 38 : 31;
  camera.position.y = width < 760 ? 15 : 12;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize, { passive: true });

let pointerX = 0;
let pointerY = 0;
window.addEventListener(
  "pointermove",
  (event) => {
    pointerX = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
    pointerY = (event.clientY / Math.max(window.innerHeight, 1) - 0.5) * 2;
  },
  { passive: true },
);

function animateBars(time) {
  for (let i = 0; i < barCount; i += 1) {
    const seed = barSeeds[i];
    const height = 0.45 + Math.abs(Math.sin(time * 0.0017 + seed.phase)) * seed.amp;
    dummy.position.set(seed.x, -3.25 + height * 0.5, seed.z);
    dummy.scale.set(1, height, 1);
    dummy.rotation.y = time * 0.00008 + seed.phase * 0.05;
    dummy.updateMatrix();
    bars.setMatrixAt(i, dummy.matrix);
  }
  bars.instanceMatrix.needsUpdate = true;
}

function animateTrace(time) {
  const position = traceGeometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const wave = Math.sin(i * 0.2 + time * 0.0018) * 0.85;
    const macro = Math.sin(i * 0.047 + time * 0.00075) * 2.1;
    position.setY(i, wave + macro + 1.4);
    position.setZ(i, -16 + Math.cos(i * 0.075 + time * 0.00065) * 2.8 + x * 0.018);
  }
  position.needsUpdate = true;
}


function animateRibbons(time) {
  for (const { geometry, setting } of ribbonGeometries) {
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const wave = Math.sin(i * 0.13 + setting.phase + time * 0.0011) * 0.72;
      const pulse = Math.sin(i * 0.041 + time * 0.0007) * 0.44;
      position.setY(i, setting.baseY + wave + pulse);
      position.setZ(i, setting.z + Math.cos(i * 0.08 + setting.phase + time * 0.00055) * 1.4 + x * 0.012);
    }
    position.needsUpdate = true;
  }
}
function animateParticles(time) {
  const position = particleGeometry.attributes.position;
  for (let i = 0; i < particleCount; i += 1) {
    const idx = i * 3;
    const seed = particleSeeds[i];
    particlePositions[idx + 1] += Math.sin(time * 0.0007 + seed) * 0.0018;
    particlePositions[idx] += Math.cos(time * 0.0005 + seed) * 0.001;
    if (particlePositions[idx + 1] > 17) particlePositions[idx + 1] = -1;
  }
  position.needsUpdate = true;
}

function render(time = 0) {
  if (!reducedMotion) {
    animateBars(time);
    animateTrace(time);
    animateParticles(time);
    rig.rotation.y = Math.sin(time * 0.00018) * 0.08 + pointerX * 0.035;
    rig.rotation.x = -0.08 + pointerY * 0.018;
    floorLines.position.z = ((time * 0.0012) % 2) - 1;
  } else {
    animateBars(1400);
  }

  renderer.render(scene, camera);
  if (!reducedMotion) window.requestAnimationFrame(render);
}

render();