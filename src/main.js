import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { SKY_RADIUS, raDecToVec, skyMatrix, solarSystem } from './astro.js';
import {
  createMilkyWay, createStars, createConstellationLines, setConstellationHighlight,
  createEcliptic, createSolarSystem, updateSolarSystem,
} from './sky.js';
import './style.css';

const [starData, constellations, milkyWayTexture] = await Promise.all([
  fetch('data/stars.json').then((r) => r.json()),
  fetch('data/constellations.json').then((r) => r.json()),
  new THREE.TextureLoader().loadAsync('data/milkyway.jpg'),
]);

// ── 장면 ─────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x02030a);
document.body.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.className = 'labels';
document.body.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(fovFor(window.innerWidth / window.innerHeight), window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

// 세로로 긴 화면(휴대폰)은 좌우가 너무 좁아지지 않게 시야를 넓힌다
function fovFor(aspect) {
  return aspect < 1 ? 95 : 70;
}

// 천구: 별·별자리·태양계를 적도 좌표로 담고, 시각에 맞춰 통째로 돌린다
const sky = new THREE.Group();
sky.matrixAutoUpdate = false;
scene.add(sky);

sky.add(createMilkyWay(milkyWayTexture));
sky.add(createStars(starData.stars, renderer.getPixelRatio()));
const constellationLines = createConstellationLines(constellations);
sky.add(constellationLines);
sky.add(createEcliptic());
const solar = createSolarSystem();
sky.add(solar.group);

// ── 땅과 지평선 ──────────────────────────────────────
const ground = new THREE.Mesh(
  new THREE.SphereGeometry(SKY_RADIUS * 0.9, 64, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x07090b, side: THREE.BackSide }),
);
scene.add(ground);

// 지평선 바로 위의 옅은 빛띠
const glowGeometry = new THREE.CylinderGeometry(SKY_RADIUS * 0.89, SKY_RADIUS * 0.89, 9, 64, 1, true);
glowGeometry.translate(0, 4.5, 0);
scene.add(new THREE.Mesh(glowGeometry, new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    varying float vH;
    void main() {
      vH = position.y / 9.0;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying float vH;
    void main() {
      gl_FragColor = vec4(0.16, 0.22, 0.34, (1.0 - vH) * (1.0 - vH) * 0.45);
    }`,
  side: THREE.BackSide, transparent: true, depthWrite: false,
})));

const horizonPoints = [];
for (let i = 0; i <= 128; i++) {
  const a = (i / 128) * Math.PI * 2;
  horizonPoints.push(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(SKY_RADIUS * 0.88));
}
scene.add(new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(horizonPoints),
  new THREE.LineBasicMaterial({ color: 0x5a6b80 }),
));

for (const [text, x, z] of [['북', 0, -1], ['동', 1, 0], ['남', 0, 1], ['서', -1, 0]]) {
  const label = makeLabel(text, 'cardinal');
  label.position.set(x, 0, z).multiplyScalar(SKY_RADIUS * 0.88);
  label.center.set(0.5, -0.3);
  scene.add(label);
}

// ── 늘 보이는 이름: 북극성, 황도 12궁 ──────────────────
const fixedLabels = [];
for (const c of constellations.filter((c) => c.zodiac)) {
  const label = makeLabel(c.name, 'always zodiac');
  label.position.copy(raDecToVec(c.ra, c.dec));
  sky.add(label);
  fixedLabels.push(label);
}
for (const s of starData.named.filter((s) => s.always)) {
  const label = makeLabel(s.name, 'always star');
  label.position.copy(raDecToVec(s.ra, s.dec));
  label.center.set(-0.15, 0.5);
  sky.add(label);
  fixedLabels.push(label);
}

// ── 가리키면 뜨는 이름 ────────────────────────────────
const hoverLabel = makeLabel('', 'hover');
hoverLabel.visible = false;
sky.add(hoverLabel);

// 가리킬 수 있는 것: 이름 붙은 별, 태양계 천체, 별자리
const pickStars = starData.named.map((s) => ({
  kind: 'star', title: s.name, sub: `${s.mag.toFixed(1)}등급`, pos: raDecToVec(s.ra, s.dec),
}));
const pickConstellations = constellations.map((c) => ({
  kind: 'constellation', id: c.id, title: c.name, sub: c.latin,
  pos: raDecToVec(c.ra, c.dec),
  segments: c.lines.flatMap((seg) => seg.slice(1).map((p, i) => [
    raDecToVec(seg[i][0], seg[i][1]), raDecToVec(p[0], p[1]),
  ])),
}));
let pickBodies = [];

// ── 시각에 맞춰 하늘 돌리기 ───────────────────────────
const timeEl = document.getElementById('time');

function updateSky() {
  const now = new Date();
  sky.matrix.copy(skyMatrix(now));
  sky.matrixWorldNeedsUpdate = true;
  sky.updateMatrixWorld(true);

  const bodies = solarSystem(now);
  updateSolarSystem(solar, bodies, sky.matrixWorld);
  pickBodies = bodies.map((b) => ({
    kind: 'body', title: b.name, sub: b.mag == null ? '' : `${b.mag.toFixed(1)}등급`, pos: b.position,
  }));

  timeEl.textContent = `서울 · ${now.toLocaleString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })}`;
}
updateSky();
setInterval(updateSky, 60 * 1000);

// ── 둘러보기: 드래그로 고개 돌리기만 ──────────────────
const view = { yaw: Math.PI, pitch: 30 * THREE.MathUtils.DEG2RAD }; // 처음에는 남쪽 하늘
const PITCH_MIN = -10 * THREE.MathUtils.DEG2RAD;
const PITCH_MAX = 90 * THREE.MathUtils.DEG2RAD;
const DRAG_THRESHOLD = 6;

let drag = null;
const canvas = renderer.domElement;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, moved: false };
});

canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    drag.x = e.clientX;
    drag.y = e.clientY;
    // 화면 높이만큼 끌면 시야각만큼 돈다
    const perPixel = (camera.fov * THREE.MathUtils.DEG2RAD) / window.innerHeight;
    view.yaw += dx * perPixel;
    view.pitch = THREE.MathUtils.clamp(view.pitch + dy * perPixel, PITCH_MIN, PITCH_MAX);
    if (e.pointerType === 'mouse') hidePick();
  } else if (e.pointerType === 'mouse') {
    showPick(pick(e.clientX, e.clientY));
  }
});

canvas.addEventListener('pointerup', (e) => {
  // 끌지 않고 짧게 누르면 그 자리의 이름을 보여 준다 (터치 기기용)
  if (drag && !drag.moved) showPick(pick(e.clientX, e.clientY));
  drag = null;
});
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !drag) hidePick(); });

// ── 화면 위 가장 가까운 것 고르기 ─────────────────────
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function toScreen(skyPos, out) {
  out.copy(skyPos).applyMatrix4(sky.matrixWorld);
  if (out.y < 0) return null; // 지평선 아래
  out.project(camera);
  if (out.z > 1) return null; // 등 뒤
  return { x: (out.x + 1) / 2 * window.innerWidth, y: (1 - out.y) / 2 * window.innerHeight };
}

function pick(x, y) {
  let best = null;
  let bestDist = 18;
  for (const item of [...pickBodies, ...pickStars]) {
    const p = toScreen(item.pos, tmpA);
    if (!p) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestDist) { best = item; bestDist = d; }
  }
  if (best) return best;

  // 별이나 행성이 없으면 가까운 별자리 선을 찾는다
  bestDist = 14;
  for (const c of pickConstellations) {
    for (const [a, b] of c.segments) {
      const pa = toScreen(a, tmpA);
      const pb = toScreen(b, tmpB);
      if (!pa || !pb) continue;
      const d = distToSegment(x, y, pa, pb);
      if (d < bestDist) { best = c; bestDist = d; }
    }
  }
  return best;
}

function distToSegment(x, y, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? THREE.MathUtils.clamp(((x - a.x) * dx + (y - a.y) * dy) / len2, 0, 1) : 0;
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

function showPick(item) {
  if (!item) return hidePick();
  hoverLabel.element.innerHTML = `${item.title}${item.sub ? `<small>${item.sub}</small>` : ''}`;
  hoverLabel.position.copy(item.pos);
  hoverLabel.center.set(item.kind === 'constellation' ? 0.5 : -0.12, item.kind === 'constellation' ? 0.5 : 0.5);
  hoverLabel.visible = true;
  setConstellationHighlight(constellationLines, item.kind === 'constellation' ? item.id : null);
}

function hidePick() {
  hoverLabel.visible = false;
  setConstellationHighlight(constellationLines, null);
}

// ── 그리기 ───────────────────────────────────────────
function makeLabel(text, className) {
  const el = document.createElement('div');
  el.className = `label ${className}`;
  el.textContent = text;
  return new CSS2DObject(el);
}

// 지평선 아래로 내려간 이름은 숨긴다
const worldPos = new THREE.Vector3();
function hideBelowHorizon(label) {
  label.getWorldPosition(worldPos);
  label.element.style.opacity = worldPos.y < 0 ? '0' : '';
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = fovFor(camera.aspect);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  camera.rotation.set(view.pitch, view.yaw, 0);
  fixedLabels.forEach(hideBelowHorizon);
  if (hoverLabel.visible) hideBelowHorizon(hoverLabel);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});
