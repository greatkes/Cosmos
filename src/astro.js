// 천구 좌표와 서울 하늘 사이의 변환, 태양계 천체 위치 계산
import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';

export const SEOUL = { lat: 37.5665, lon: 126.978, height: 38 };
export const SKY_RADIUS = 100;

const DEG = Math.PI / 180;
const observer = new Astronomy.Observer(SEOUL.lat, SEOUL.lon, SEOUL.height);

// 적경·적위(도) → 천구 좌표계 벡터
// 천구 좌표계: x는 적경 0h, y는 적경 6h, z는 천구 북극
export function raDecToVec(raDeg, decDeg, r = SKY_RADIUS, out = new THREE.Vector3()) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return out.set(r * Math.cos(dec) * Math.cos(ra), r * Math.cos(dec) * Math.sin(ra), r * Math.sin(dec));
}

// 천구 좌표계 → 서울의 지평 좌표계(화면 좌표)로 돌리는 행렬
// 화면 좌표: +x 동쪽, +y 천정, -z 북쪽
export function skyMatrix(date) {
  const lst = (Astronomy.SiderealTime(date) * 15 + SEOUL.lon) * DEG;
  const lat = SEOUL.lat * DEG;
  const cL = Math.cos(lst), sL = Math.sin(lst);
  const cP = Math.cos(lat), sP = Math.sin(lat);
  return new THREE.Matrix4().set(
    -sL, cL, 0, 0,
    cP * cL, cP * sL, sP, 0,
    sP * cL, sP * sL, -cP, 0,
    0, 0, 0, 1,
  );
}

const BODIES = [
  { id: 'Sun', name: '태양', kind: 'sun' },
  { id: 'Moon', name: '달', kind: 'moon' },
  { id: 'Mercury', name: '수성', kind: 'planet', color: 0xc9bfb3 },
  { id: 'Venus', name: '금성', kind: 'planet', color: 0xfff4d6 },
  { id: 'Mars', name: '화성', kind: 'planet', color: 0xff9a6b },
  { id: 'Jupiter', name: '목성', kind: 'planet', color: 0xffe9c4 },
  { id: 'Saturn', name: '토성', kind: 'planet', color: 0xf3dca2 },
];

// 서울에서 본 태양·달·행성의 적경·적위(J2000, 도)와 밝기
export function solarSystem(date) {
  return BODIES.map((b) => {
    const eq = Astronomy.Equator(b.id, date, observer, false, true);
    const mag = b.kind === 'planet' ? Astronomy.Illumination(b.id, date).mag : null;
    return { ...b, ra: eq.ra * 15, dec: eq.dec, mag };
  });
}

// 황도: 태양이 1년 동안 지나는 길 (J2000 황도 경사 23.4393°)
export function eclipticPoints(steps = 360) {
  const eps = 23.4393 * DEG;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const lam = (i / steps) * Math.PI * 2;
    const x = Math.cos(lam);
    const y = Math.sin(lam) * Math.cos(eps);
    const z = Math.sin(lam) * Math.sin(eps);
    pts.push(new THREE.Vector3(x, y, z).multiplyScalar(SKY_RADIUS * 0.99));
  }
  return pts;
}

// B-V 색지수 → 별빛 색 (온도로 바꾼 뒤 흑체 색 근사)
export function bvToColor(bv) {
  const b = Math.min(Math.max(bv, -0.4), 2.0);
  const t = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
  const k = t / 100;
  let r, g, bl;
  if (k <= 66) {
    r = 255;
    g = 99.47 * Math.log(k) - 161.12;
    bl = k <= 19 ? 0 : 138.52 * Math.log(k - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(k - 60, -0.1332);
    g = 288.12 * Math.pow(k - 60, -0.0755);
    bl = 255;
  }
  const c = new THREE.Color(clamp255(r) / 255, clamp255(g) / 255, clamp255(bl) / 255);
  // 맨눈에는 별 색이 옅게 보이므로 흰색 쪽으로 섞는다
  return c.lerp(new THREE.Color(1, 1, 1), 0.35);
}

function clamp255(v) {
  return Math.min(Math.max(v, 0), 255);
}
