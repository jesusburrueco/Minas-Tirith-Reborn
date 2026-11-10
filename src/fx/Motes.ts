import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, type Vector3 } from 'three';
import { ATMO } from '../sky/atmosphere';
import { hash2 } from '../world/geo';

const BOX = 24;

/** Polen y motas de polvo que flotan alrededor del jugador y brillan a contraluz. */
export class Motes {
  readonly points: Points;
  private mat: ShaderMaterial;

  constructor(count = 220) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) pos.set([hash2(i, 1, 61) * BOX, hash2(i, 2, 61) * 7, hash2(i, 3, 61) * BOX], i * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    this.mat = new ShaderMaterial({
      uniforms: { uCenter: { value: null as Vector3 | null }, uTime: ATMO.uTime, uSunDir: ATMO.uSunDir, uDaylight: ATMO.uDaylight, uWind: ATMO.uWind },
      vertexShader: /* glsl */ `
        uniform vec3 uCenter;
        uniform float uTime;
        uniform vec3 uWind;
        varying float vA;
        void main() {
          vec3 p = position;
          p.xz += uWind.xy * uTime * 0.35 + vec2(sin(uTime * 0.3 + p.y), cos(uTime * 0.27 + p.x)) * 0.6;
          p.y += sin(uTime * 0.5 + p.x * 1.7) * 0.4;
          vec3 wp = vec3(uCenter.x - ${BOX / 2}.0 + mod(p.x - uCenter.x, ${BOX}.0), uCenter.y - 1.0 + p.y,
                         uCenter.z - ${BOX / 2}.0 + mod(p.z - uCenter.z, ${BOX}.0));
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = clamp(40.0 / d, 1.0, 3.0);
          vA = smoothstep(${BOX / 2}.0, 4.0, d) * smoothstep(0.3, 1.5, d);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform float uDaylight;
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(c)) * vA * uDaylight * 0.3;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    this.points = new Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.name = 'motes';
  }

  update(center: Vector3): void {
    this.mat.uniforms.uCenter.value = center;
  }
}
