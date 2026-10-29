// 천구에 붙는 것들: 은하수, 별, 별자리 선, 황도, 태양·달·행성
import * as THREE from 'three';
import { SKY_RADIUS, raDecToVec, bvToColor, eclipticPoints } from './astro.js';

const MAG_LIMIT = 6.5;

export function createMilkyWay(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  // 경도 0/360 이음매에서 밉맵이 튀지 않게 밉맵을 쓰지 않는다
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, strength: { value: 0.55 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    // NASA SVS 지도: 가운데가 적경 0h, 왼쪽으로 갈수록 적경이 커지고, 위가 천구 북극
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float strength;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float ra = atan(d.y, d.x);
        float dec = asin(d.z);
        vec2 uv = vec2(fract(0.5 - ra / 6.2831853), 0.5 + dec / 3.1415927);
        gl_FragColor = vec4(texture2D(map, uv).rgb * strength, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS * 1.05, 96, 48), material);
  mesh.renderOrder = -10;
  return mesh;
}

export function createStars(stars, pixelRatio) {
  const positions = new Float32Array(stars.length * 3);
  const colors = new Float32Array(stars.length * 3);
  const sizes = new Float32Array(stars.length);
  const alphas = new Float32Array(stars.length);
  const v = new THREE.Vector3();
  stars.forEach(([ra, dec, mag, bv], i) => {
    raDecToVec(ra, dec, SKY_RADIUS, v).toArray(positions, i * 3);
    bvToColor(bv).toArray(colors, i * 3);
    // 밝은 별일수록 크게, 어두운 별은 작고 흐리게
    const brightness = MAG_LIMIT - mag;
    sizes[i] = (1.8 + brightness * 1.35) * pixelRatio;
    alphas[i] = Math.min(1, 0.28 + brightness * 0.2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float alpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = alpha;
        gl_PointSize = size;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        // 가운데는 또렷하고 가장자리는 번지는 별빛
        float core = smoothstep(0.45, 0.0, r);
        float glow = exp(-r * r * 4.0) * 0.5;
        float a = (core + glow) * vAlpha;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor, a);
      }`,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

// 별자리마다 선 묶음 하나: 가리킬 때 그 별자리만 밝게 바꾼다
export function createConstellationLines(constellations) {
  const group = new THREE.Group();
  const v = new THREE.Vector3();
  for (const c of constellations) {
    const pts = [];
    for (const seg of c.lines) {
      for (let i = 0; i < seg.length - 1; i++) {
        pts.push(raDecToVec(seg[i][0], seg[i][1], SKY_RADIUS * 0.995, v).clone());
        pts.push(raDecToVec(seg[i + 1][0], seg[i + 1][1], SKY_RADIUS * 0.995, v).clone());
      }
    }
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x6f9bd8, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    lines.userData.id = c.id;
    group.add(lines);
  }
  return group;
}

export function setConstellationHighlight(group, id) {
  for (const lines of group.children) {
    const on = lines.userData.id === id;
    lines.material.opacity = on ? 0.9 : 0.35;
    lines.material.color.set(on ? 0xa9c8ff : 0x6f9bd8);
  }
}

export function createEcliptic() {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(eclipticPoints()),
    new THREE.LineDashedMaterial({
      color: 0xd8b26a, transparent: true, opacity: 0.35, dashSize: 1.2, gapSize: 1.2, depthWrite: false,
    }),
  );
  line.computeLineDistances();
  return line;
}

// 태양·달은 실제(약 0.5°)보다 크게 그린다. 교육용으로 잘 보이게
const SUN_SIZE = 2.2;
const MOON_SIZE = 2.0;

export function createSolarSystem() {
  const group = new THREE.Group();

  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('#fff6d8', '#ffcf6b'), depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sun.scale.setScalar(angularSize(SUN_SIZE) * 3);
  sun.userData.id = 'Sun';
  group.add(sun);

  // 달은 태양 쪽 반구만 밝힌 공으로 그려서 위상(차고 기욺)이 저절로 드러나게 한다
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(angularSize(MOON_SIZE) / 2, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 sunDir;
        varying vec3 vNormal;
        void main() {
          float lit = smoothstep(-0.03, 0.08, dot(normalize(vNormal), sunDir));
          vec3 color = mix(vec3(0.04, 0.045, 0.06), vec3(0.93, 0.91, 0.86), lit);
          gl_FragColor = vec4(color, 1.0);
        }`,
    }),
  );
  moon.userData.id = 'Moon';
  group.add(moon);

  const planets = {};
  for (const id of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('#ffffff', '#ffffff'), depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sprite.userData.id = id;
    planets[id] = sprite;
    group.add(sprite);
  }
  return { group, sun, moon, planets };
}

export function updateSolarSystem(solar, bodies, skyGroupMatrix) {
  const sunWorld = new THREE.Vector3();
  for (const b of bodies) {
    const pos = raDecToVec(b.ra, b.dec, SKY_RADIUS * 0.97);
    b.position = pos;
    if (b.kind === 'sun') {
      solar.sun.position.copy(pos);
      sunWorld.copy(pos).applyMatrix4(skyGroupMatrix).normalize();
    } else if (b.kind === 'moon') {
      solar.moon.position.copy(pos);
    } else {
      const sprite = solar.planets[b.id];
      sprite.position.copy(pos);
      sprite.material.color.set(b.color);
      // 금성(-4등급)이 가장 크게, 토성(+1등급 안팎)은 작게
      sprite.scale.setScalar(angularSize(0.45 + Math.max(0, 2 - b.mag) * 0.22));
    }
  }
  solar.moon.material.uniforms.sunDir.value.copy(sunWorld);
}

// 각도(도) → 천구 반지름에서의 길이
function angularSize(deg) {
  return 2 * SKY_RADIUS * Math.tan((deg * Math.PI) / 360);
}

function glowTexture(inner, outer) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.18, inner);
  g.addColorStop(0.32, outer + 'aa');
  g.addColorStop(1, outer + '00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
