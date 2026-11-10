import { BufferAttribute, BufferGeometry, Mesh, ShaderMaterial } from 'three';
import { ATMO, GLSL_ATMO } from '../sky/atmosphere';
import { merge } from '../utils/geometry';
import { RIVER_HALF_WIDTH, STREAMS, WATER_Y, riverX, type Polyline } from './geo';
import type { TerrainData } from './terrain/TerrainData';

const VERT = /* glsl */ `
attribute vec2 aFlow;
varying vec3 vWp;
varying vec2 vFlow;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vFlow = aFlow;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
${GLSL_ATMO}
uniform sampler2D tNoise;
varying vec3 vWp;
varying vec2 vFlow;
void main() {
  vec2 p = vWp.xz;
  vec2 f = vFlow * uTime;
  vec4 a = texture2D(tNoise, p / 38.0 - f / 38.0);
  vec4 b = texture2D(tNoise, p.yx / 17.0 - f.yx / 17.0 + 0.37);
  vec2 slope = (a.gb - 0.5) * 0.55 + (b.ba - 0.5) * 0.35;
  vec3 n = normalize(vec3(slope.x, 1.0, slope.y));
  vec3 v = normalize(cameraPosition - vWp);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 sky = atmoHaze(r);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 deep = vec3(0.025, 0.05, 0.05) * (0.25 + 0.75 * uDaylight) + uSunColor * 0.015;
  vec3 col = mix(deep, sky, fres);
  float spec = pow(max(dot(r, uSunDir), 0.0), 260.0);
  col += uSunColor * spec * 6.0;
  gl_FragColor = vec4(atmoFog(col, vWp), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** El Anduin y los arroyos del Pelennor: cintas de agua con reflejo del cielo y corriente. */
export class Water {
  readonly mesh: Mesh;

  constructor(data: TerrainData) {
    const parts = [this.river(), ...STREAMS.map((s) => this.stream(s, data))];
    const mat = new ShaderMaterial({
      uniforms: { ...ATMO },
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    this.mesh = new Mesh(merge(parts), mat);
    this.mesh.name = 'water';
    this.mesh.frustumCulled = false;
  }

  private strip(left: number[][], right: number[][], flow: number[][]): BufferGeometry {
    const n = left.length;
    const pos = new Float32Array(n * 2 * 3);
    const fl = new Float32Array(n * 2 * 2);
    for (let i = 0; i < n; i++) {
      pos.set(left[i], i * 6);
      pos.set(right[i], i * 6 + 3);
      fl.set(flow[i], i * 4);
      fl.set(flow[i], i * 4 + 2);
    }
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aFlow', new BufferAttribute(fl, 2));
    g.setIndex(idx);
    return g;
  }

  /** El Anduin fluye de norte a sur. */
  private river(): BufferGeometry {
    const L: number[][] = [], R: number[][] = [], F: number[][] = [];
    const half = RIVER_HALF_WIDTH + 70;
    for (let z = -30000; z <= 30000; z += 100) {
      const x = riverX(z);
      const dx = (riverX(z + 50) - riverX(z - 50)) / 100;
      const len = Math.hypot(dx, 1);
      L.push([x - half, WATER_Y, z]);
      R.push([x + half, WATER_Y, z]);
      F.push([(dx / len) * 0.9, (1 / len) * 0.9]);
    }
    return this.strip(L, R, F);
  }

  private stream(line: Polyline, data: TerrainData): BufferGeometry {
    const L: number[][] = [], R: number[][] = [], F: number[][] = [];
    const half = 5;
    let prevY = Infinity;
    for (let s = 0; s < line.length - 1; s++) {
      const [ax, az] = line[s], [bx, bz] = line[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const tx = (bx - ax) / len, tz = (bz - az) / len;
      const nx = -tz, nz = tx;
      for (let d = 0; d < len; d += 4) {
        const x = ax + tx * d, z = az + tz * d;
        // nivel: 0,6 m por debajo de la orilla más baja; nunca sube aguas abajo
        const bank = Math.min(data.heightAt(x + nx * 9, z + nz * 9), data.heightAt(x - nx * 9, z - nz * 9));
        const y = Math.min(prevY, bank - 0.6);
        prevY = y;
        L.push([x + nx * half, y, z + nz * half]);
        R.push([x - nx * half, y, z - nz * half]);
        F.push([tx * 0.6, tz * 0.6]);
      }
    }
    return this.strip(L, R, F);
  }
}
