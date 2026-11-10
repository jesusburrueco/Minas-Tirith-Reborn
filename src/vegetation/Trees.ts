import {
  BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide,
  DynamicDrawUsage, Euler, Group, InstancedBufferAttribute, InstancedBufferGeometry, InstancedMesh, LinearMipmapLinearFilter,
  Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, OrthographicCamera, PlaneGeometry, Quaternion, SRGBColorSpace, Scene, ShaderMaterial,
  Vector2, Vector3, WebGLRenderTarget, type Texture, type WebGLRenderer,
} from 'three';
import type { QualityPreset } from '../app/Quality';
import { addPatch, ATMO, GLSL_ATMO, matteSpecular, withAtmosphere } from '../sky/atmosphere';
import { box, merge, positionsOnly } from '../utils/geometry';
import { Crop, fieldCell, FIELD, hash2, NEAR, TEST_ZONE_XZ, fieldCenter } from '../world/geo';
import type { TerrainData } from '../world/terrain/TerrainData';

export const BROADLEAF = 0;
export const CONIFER = 1;

/** Tamaño del encuadre del impostor (ancho, alto) a escala 1. */
const IMPOSTOR_SIZE: [number, number][] = [[7.4, 9.2], [5.8, 12.4]];
const MAX_NEAR = 260;
const MAX_FAR = 16000;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ textura de hojas

function leafAtlas(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  const r = rng(7);
  // Izquierda: racimo de hojas anchas.
  g.strokeStyle = '#4a3622';
  g.lineWidth = 6;
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    g.beginPath();
    g.moveTo(256, 256);
    g.lineTo(256 + Math.cos(a) * 180, 256 + Math.sin(a) * 180);
    g.stroke();
  }
  for (let i = 0; i < 260; i++) {
    const rad = Math.sqrt(r()) * 225;
    const a = r() * Math.PI * 2;
    const x = 256 + Math.cos(a) * rad, y = 256 + Math.sin(a) * rad;
    const len = 30 + r() * 22, wid = 13 + r() * 9;
    g.save();
    g.translate(x, y);
    g.rotate(a + (r() - 0.5) * 1.2);
    const h = 78 + r() * 34, s = 35 + r() * 25, l = 16 + r() * 18;
    g.fillStyle = `hsl(${h},${s}%,${l}%)`;
    g.beginPath();
    g.ellipse(len / 2, 0, len / 2, wid / 2, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `hsl(${h},${s}%,${l + 10}%)`;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(2, 0);
    g.lineTo(len - 3, 0);
    g.stroke();
    g.restore();
  }
  // Derecha: rama de conífera (tallo + acículas).
  g.save();
  g.translate(512, 0);
  for (let k = 0; k < 9; k++) {
    const x0 = 256 + (r() - 0.5) * 60, y0 = 500;
    const x1 = 256 + (r() - 0.5) * 420, y1 = 30 + r() * 120;
    g.strokeStyle = '#3b2c1c';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    for (let i = 0; i < 160; i++) {
      const t = r();
      const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
      const a = Math.atan2(y1 - y0, x1 - x0) + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6);
      const l = 18 + r() * 16;
      g.strokeStyle = `hsl(${120 + r() * 30},${30 + r() * 20}%,${12 + r() * 12}%)`;
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
      g.stroke();
    }
  }
  g.restore();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ geometría de las especies

/** Pone normales "esféricas" (desde el centro de la copa): iluminación suave y creíble. */
function sphericalNormals(g: BufferGeometry, center: Vector3, yBias: number): void {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal') as BufferAttribute;
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).sub(center);
    v.y += yBias;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
}

function card(w: number, h: number, pos: Vector3, rot: Euler, uvHalf: number, pivotBottom = false): BufferGeometry {
  const g = new PlaneGeometry(w, h);
  if (pivotBottom) g.translate(0, h / 2, 0);
  g.applyMatrix4(new Matrix4().compose(pos, new Quaternion().setFromEuler(rot), new Vector3(1, 1, 1)));
  const uv = g.getAttribute('uv') as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + uvHalf * 0.5);
  return g;
}

function cylinder(r0: number, r1: number, h: number, seg: number, m: Matrix4): BufferGeometry {
  const g = new CylinderGeometry(r1, r0, h, seg, 2, true);
  g.translate(0, h / 2, 0);
  const uv = g.getAttribute('uv') as BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.5, uv.getY(i) * h * 0.6);
  g.applyMatrix4(m);
  return g;
}

function broadleaf(): { trunk: BufferGeometry; leaves: BufferGeometry } {
  const r = rng(11);
  const parts = [cylinder(0.4, 0.22, 4.2, 8, new Matrix4())];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.5;
    const m = new Matrix4().compose(
      new Vector3(0, 2.8 + r() * 1.1, 0),
      new Quaternion().setFromEuler(new Euler(0.75 + r() * 0.3, a, 0, 'YXZ')),
      new Vector3(1, 1, 1),
    );
    parts.push(cylinder(0.15, 0.06, 2.6 + r(), 5, m));
  }
  const trunk = merge(parts);
  const center = new Vector3(0, 5.7, 0);
  const cards: BufferGeometry[] = [];
  for (let i = 0; i < 64; i++) {
    const u = r() * Math.PI * 2, v = Math.acos(2 * r() - 1);
    const rr = 0.55 + 0.45 * Math.cbrt(r());
    const p = new Vector3(Math.sin(v) * Math.cos(u) * 3.1 * rr, Math.cos(v) * 2.3 * rr, Math.sin(v) * Math.sin(u) * 3.1 * rr).add(center);
    cards.push(card(2.0, 2.0, p, new Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI), 0));
  }
  const leaves = merge(cards);
  sphericalNormals(leaves, center, 0.6);
  return { trunk, leaves };
}

function conifer(): { trunk: BufferGeometry; leaves: BufferGeometry } {
  const r = rng(23);
  const trunk = cylinder(0.32, 0.08, 11, 7, new Matrix4());
  const cards: BufferGeometry[] = [];
  const tiers = 10;
  for (let k = 0; k < tiers; k++) {
    const y = 1.6 + k * 0.98;
    const rad = 2.7 * (1 - k / (tiers + 0.6)) + 0.3;
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * 0.7 + r() * 0.3;
      const p = new Vector3(Math.cos(a) * 0.15, y, Math.sin(a) * 0.15);
      // Tarjeta que sale del tronco hacia fuera y se inclina hacia abajo.
      const rot = new Euler(-Math.PI / 2 + 0.55, -a + Math.PI / 2, 0, 'YXZ');
      cards.push(card(rad * 1.25, rad * 1.1, p, rot, 1, true));
    }
  }
  cards.push(card(1.4, 2.2, new Vector3(0, 10.4, 0), new Euler(0, 0, 0), 1));
  cards.push(card(1.4, 2.2, new Vector3(0, 10.4, 0), new Euler(0, Math.PI / 2, 0), 1));
  const leaves = merge(cards);
  sphericalNormals(leaves, new Vector3(0, 5.5, 0), 1.4);
  return { trunk, leaves };
}

// ------------------------------------------------------------------ materiales

const WIND_VERT = (leaves: boolean) => /* glsl */ `
  {
    vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
    float ph = ip.x * 0.071 + ip.z * 0.053;
    float hk = max(position.y - 1.2, 0.0) / 9.0;
    float sway = (sin(uTime * 0.85 + ph) * 0.6 + sin(uTime * 2.05 + ph * 1.7) * 0.25) * uWind.z;
    transformed.x += sway * hk * hk * 0.9;
    transformed.z += sway * 0.35 * hk * hk;
    ${leaves ? 'transformed += objectNormal * sin(uTime * 5.3 + position.x * 3.7 + position.z * 2.9 + ph) * 0.045 * uWind.z * 2.0;' : ''}
  }`;

function windPatch(mat: MeshStandardMaterial, leaves: boolean): void {
  addPatch(mat, leaves ? 'wind-leaves' : 'wind-trunk', (shader) => {
    Object.assign(shader.uniforms, { uTime: ATMO.uTime, uWind: ATMO.uWind });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_VERT(leaves)}`);
    if (leaves)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\nnormal *= faceDirection;',
      );
  });
}

const BILLBOARD_VERT = /* glsl */ `
attribute vec4 aPos;   // x, y, z, escala
attribute vec2 aInfo;  // especie, aleatorio
uniform vec2 uSize[2];
varying vec2 vUv;
varying vec3 vWp;
varying float vTint;
void main() {
  vec3 toCam = cameraPosition - aPos.xyz;
  toCam.y = 0.0;
  vec3 f = normalize(toCam + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(f.z, 0.0, -f.x);
  vec2 size = (aInfo.x < 0.5 ? uSize[0] : uSize[1]) * aPos.w;
  vec3 wp = aPos.xyz + right * position.x * size.x + vec3(0.0, position.y * size.y - 0.15, 0.0);
  vUv = vec2((position.x + 0.5) * 0.5 + step(0.5, aInfo.x) * 0.5, position.y);
  vWp = wp;
  vTint = aInfo.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const BILLBOARD_FRAG = /* glsl */ `
${GLSL_ATMO}
uniform sampler2D tAtlas;
varying vec2 vUv;
varying vec3 vWp;
varying float vTint;
void main() {
  vec4 c = texture2D(tAtlas, vUv);
  if (c.a < 0.5) discard;
  // Mismo modelo de luz aproximado que las mallas cercanas: sol + cielo.
  vec3 light = uSunColor * (0.9 + 0.7 * max(uSunDir.y, 0.0)) + (uZenith * 0.5 + uHorizon * 0.7) * 1.1;
  vec3 col = c.rgb * light * (0.8 + 0.4 * vTint) * (0.7 + 0.3 * vUv.y);
  col = mix(col, vec3(dot(col, vec3(0.333))), 0.25);
  gl_FragColor = vec4(atmoFog(col, vWp), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------ sistema

interface Species {
  trunk: InstancedMesh;
  leaves: InstancedMesh;
}

/**
 * Árboles: mallas instanciadas cerca del jugador e impostores (billboards) más lejos.
 * Las posiciones se reparten al cargar a partir de las máscaras del terreno.
 */
export class Trees {
  readonly group = new Group();
  private species: Species[] = [];
  private bill: Mesh;
  private billGeo = new InstancedBufferGeometry();
  private aPos: InstancedBufferAttribute;
  private aInfo: InstancedBufferAttribute;
  // Instancias: x, y, z, escala, giro, especie
  private data: Float32Array;
  readonly count: number;
  private nearDist = 110;
  private farDist = 3000;
  private timer = 0;
  private last = new Vector3(1e9, 0, 0);
  private m = new Matrix4();
  private q = new Quaternion();
  private s = new Vector3();
  private p = new Vector3();
  private up = new Vector3(0, 1, 0);

  constructor(renderer: WebGLRenderer, terrain: TerrainData, bark: Texture) {
    const atlas = leafAtlas();
    const geos = [broadleaf(), conifer()];
    const trunkMat = withAtmosphere(new MeshStandardMaterial({ map: bark, roughness: 0.95 }));
    windPatch(trunkMat, false);
    const leafMat = withAtmosphere(new MeshStandardMaterial({ map: atlas, alphaTest: 0.5, side: DoubleSide, roughness: 0.8 }));
    windPatch(leafMat, true);
    matteSpecular(leafMat, 0.15, 0.6);
    matteSpecular(trunkMat, 0.1, 0.5);
    for (const g of geos) {
      const trunk = new InstancedMesh(g.trunk, trunkMat, MAX_NEAR);
      const leaves = new InstancedMesh(g.leaves, leafMat, MAX_NEAR);
      for (const im of [trunk, leaves]) {
        im.instanceMatrix.setUsage(DynamicDrawUsage);
        im.frustumCulled = false;
        im.castShadow = true;
        im.receiveShadow = true;
        im.count = 0;
        this.group.add(im);
      }
      this.species.push({ trunk, leaves });
    }

    // Impostores
    const impostor = this.bakeImpostors(renderer, geos, bark, atlas);
    const quad = new PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    this.billGeo.index = quad.index;
    this.billGeo.setAttribute('position', quad.getAttribute('position'));
    this.aPos = new InstancedBufferAttribute(new Float32Array(MAX_FAR * 4), 4);
    this.aInfo = new InstancedBufferAttribute(new Float32Array(MAX_FAR * 2), 2);
    this.aPos.setUsage(DynamicDrawUsage);
    this.aInfo.setUsage(DynamicDrawUsage);
    this.billGeo.setAttribute('aPos', this.aPos);
    this.billGeo.setAttribute('aInfo', this.aInfo);
    this.billGeo.instanceCount = 0;
    const billMat = new ShaderMaterial({
      uniforms: {
        ...ATMO,
        tAtlas: { value: impostor },
        uSize: { value: IMPOSTOR_SIZE.map(([w, h]) => new Vector2(w, h)) },
      },
      vertexShader: BILLBOARD_VERT,
      fragmentShader: BILLBOARD_FRAG,
    });
    this.bill = new Mesh(this.billGeo, billMat);
    this.bill.frustumCulled = false;
    this.bill.name = 'tree-impostors';
    this.group.add(this.bill);

    this.data = scatter(terrain);
    this.count = this.data.length / 6;
  }

  private bakeImpostors(renderer: WebGLRenderer, geos: { trunk: BufferGeometry; leaves: BufferGeometry }[], bark: Texture, atlas: Texture): Texture {
    const rt = new WebGLRenderTarget(1024, 512, { generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
    rt.texture.colorSpace = SRGBColorSpace;
    const scene = new Scene();
    const trunkM = new MeshBasicMaterial({ map: bark });
    const leafM = new MeshBasicMaterial({ map: atlas, alphaTest: 0.5, side: DoubleSide });
    const prevTarget = renderer.getRenderTarget();
    const prevXR = renderer.xr.enabled;
    renderer.xr.enabled = false;
    const prevClear = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rt);
    renderer.clear();
    geos.forEach((g, i) => {
      const grp = new Group();
      grp.add(new Mesh(g.trunk, trunkM), new Mesh(g.leaves, leafM));
      scene.add(grp);
      const [w, h] = IMPOSTOR_SIZE[i];
      const cam = new OrthographicCamera(-w / 2, w / 2, h, 0, 0.1, 50);
      cam.position.set(0, 0, 20);
      rt.viewport.set(i * 512, 0, 512, 512);
      rt.scissor.set(i * 512, 0, 512, 512);
      rt.scissorTest = true;
      renderer.render(scene, cam);
      scene.remove(grp);
    });
    rt.scissorTest = false;
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(0x000000, prevClear);
    renderer.xr.enabled = prevXR;
    return rt.texture;
  }

  applyQuality(p: QualityPreset): void {
    this.nearDist = p.level === 'low' ? 45 : p.level === 'medium' ? 75 : 130;
    this.farDist = p.level === 'low' ? 1500 : p.level === 'medium' ? 2600 : 5000;
    this.last.set(1e9, 0, 0);
  }

  /** Colisionadores de los troncos de la llanura (en el mapa cercano). */
  trunkColliders(): BufferGeometry | null {
    const boxes: BufferGeometry[] = [];
    for (let i = 0; i < this.count; i++) {
      const o = i * 6;
      if (this.data[o + 1] > 150) continue;
      const s = this.data[o + 3];
      boxes.push(positionsOnly(box(0.55 * s, 3, 0.55 * s, [this.data[o], this.data[o + 1] + 1.5, this.data[o + 2]])));
    }
    return boxes.length ? merge(boxes) : null;
  }

  update(dt: number, cam: Vector3): void {
    this.timer -= dt;
    if (this.timer > 0 && cam.distanceToSquared(this.last) < 36) return;
    this.timer = 0.3;
    this.last.copy(cam);
    const near2 = this.nearDist ** 2, far2 = this.farDist ** 2;
    const nNear = [0, 0];
    let nFar = 0;
    const pos = this.aPos.array as Float32Array, info = this.aInfo.array as Float32Array;
    const d = this.data;
    // Cubos por anillos de distancia: si hay más árboles que hueco, ganan los cercanos.
    const RINGS = 24;
    const buckets: number[][] = Array.from({ length: RINGS }, () => []);
    for (let i = 0; i < this.count; i++) {
      const o = i * 6;
      const dx = d[o] - cam.x, dz = d[o + 2] - cam.z;
      const dd = dx * dx + dz * dz;
      if (dd > far2) continue;
      buckets[Math.min(RINGS - 1, Math.floor((Math.sqrt(dd) / this.farDist) * RINGS))].push(i);
    }
    for (const bucket of buckets) for (const i of bucket) {
      const o = i * 6;
      const dx = d[o] - cam.x, dz = d[o + 2] - cam.z;
      const dd = dx * dx + dz * dz;
      const sp = d[o + 5];
      if (dd < near2 && nNear[sp] < MAX_NEAR) {
        this.p.set(d[o], d[o + 1], d[o + 2]);
        this.q.setFromAxisAngle(this.up, d[o + 4]);
        this.s.setScalar(d[o + 3]);
        this.m.compose(this.p, this.q, this.s);
        this.species[sp].trunk.setMatrixAt(nNear[sp], this.m);
        this.species[sp].leaves.setMatrixAt(nNear[sp], this.m);
        nNear[sp]++;
      } else if (nFar < MAX_FAR) {
        pos[nFar * 4] = d[o];
        pos[nFar * 4 + 1] = d[o + 1];
        pos[nFar * 4 + 2] = d[o + 2];
        pos[nFar * 4 + 3] = d[o + 3];
        info[nFar * 2] = sp;
        info[nFar * 2 + 1] = hash2(i, 0, 3);
        nFar++;
      }
    }
    this.species.forEach((s, i) => {
      s.trunk.count = s.leaves.count = nNear[i];
      s.trunk.instanceMatrix.needsUpdate = s.leaves.instanceMatrix.needsUpdate = true;
    });
    this.billGeo.instanceCount = nFar;
    this.aPos.needsUpdate = this.aInfo.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ reparto

function scatter(t: TerrainData): Float32Array {
  const out: number[] = [];
  const m = { road: 0, field: 0, wet: 0, forest: 0 };
  const add = (x: number, z: number, sp: number, s: number, seed: number) => {
    out.push(x, t.heightAt(x, z) - 0.15, z, s, hash2(seed, 9, 41) * Math.PI * 2, sp);
  };
  const orchards = new Set<string>();
  const step = 10;
  for (let z = NEAR.z0 + 5; z < NEAR.z0 + NEAR.size - 5; z += step)
    for (let x = NEAR.x0 + 5; x < NEAR.x0 + NEAR.size - 5; x += step) {
      const ix = Math.round(x), iz = Math.round(z);
      const r = hash2(ix, iz, 31);
      const jx = x + (hash2(ix, iz, 32) - 0.5) * step * 0.9, jz = z + (hash2(ix, iz, 33) - 0.5) * step * 0.9;
      if (Math.hypot(jx, jz) < 520) continue;
      if (Math.hypot(jx - TEST_ZONE_XZ[0], jz - TEST_ZONE_XZ[1]) < 95) continue;
      t.maskAt(jx, jz, m);
      if (m.road > 0.02) continue;
      const ny = t.normalYAt(jx, jz);
      if (ny < 0.8) continue;
      const h = t.heightAt(jx, jz);
      const fc = fieldCell(jx, jz);
      if (m.field > 0.6 && fc.crop === Crop.Orchard) {
        if (hash2(fc.col, fc.row, 75) < 0.45) orchards.add(`${fc.col},${fc.row}`); // el resto, barbecho
        continue;
      }
      const sBig = 0.8 + hash2(ix, iz, 34) * 0.55;
      if (m.forest > 0.05 && r < m.forest * 0.16) add(jx, jz, h > 220 ? CONIFER : r < 0.15 ? CONIFER : BROADLEAF, sBig, ix * 7 + iz);
      else if (m.wet > 0.25 && m.wet < 0.9 && r < 0.08) add(jx, jz, BROADLEAF, sBig * 1.1, ix + iz * 3);
      else if (m.field > 0.4 && fc.edge < 2.5 && r < 0.05) add(jx, jz, BROADLEAF, sBig, ix * 5 + iz);
      else if (m.field < 0.2 && m.forest < 0.05 && h < 120 && r < 0.004) add(jx, jz, BROADLEAF, sBig * 1.15, ix + iz);
    }
  // Huertos: árboles frutales en hileras, dentro de cada parcela.
  const c = Math.cos(FIELD.angle), s = Math.sin(FIELD.angle);
  for (const key of orchards) {
    const [col, row] = key.split(',').map(Number);
    const [cx, cz] = fieldCenter(col, row);
    for (let a = -FIELD.w / 2 + 9; a <= FIELD.w / 2 - 9; a += 9.5)
      for (let b = -FIELD.h / 2 + 9; b <= FIELD.h / 2 - 9; b += 9.5) {
        // ejes locales de la parcela: u = (c, -s), v = (s, c)
        const x = cx + a * c + b * s, z = cz - a * s + b * c;
        t.maskAt(x, z, m);
        if (m.field < 0.5) continue;
        add(x, z, BROADLEAF, 0.5 + hash2(Math.round(x), Math.round(z), 35) * 0.15, Math.round(x * 3 + z));
      }
  }
  // Laderas del Mindolluin fuera del mapa cercano: coníferas dispersas.
  for (let z = -6000; z < 6000; z += 40)
    for (let x = -7000; x < NEAR.x0; x += 40) {
      const ix = Math.round(x), iz = Math.round(z);
      const jx = x + (hash2(ix, iz, 36) - 0.5) * 36, jz = z + (hash2(ix, iz, 37) - 0.5) * 36;
      const h = t.heightAt(jx, jz);
      if (h < 60 || h > 1450 || t.normalYAt(jx, jz) < 0.82) continue;
      if (hash2(ix, iz, 38) > 0.3 * (1 - h / 1600)) continue;
      add(jx, jz, CONIFER, 0.9 + hash2(ix, iz, 39) * 0.5, ix + iz);
    }
  return new Float32Array(out);
}
