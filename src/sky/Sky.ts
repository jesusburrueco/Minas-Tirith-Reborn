import {
  BackSide, Color, DirectionalLight, MathUtils, Mesh, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry,
  type Texture, type Vector3, type WebGLRenderTarget, type WebGLRenderer,
} from 'three';
import type { QualityPreset } from '../app/Quality';
import { ATMO, GLSL_ATMO } from './atmosphere';
import type { TimeOfDay } from './TimeOfDay';

const SKY_FRAG = /* glsl */ `
${GLSL_ATMO}
uniform sampler2D tNoise;
uniform float uCloudCover;
uniform vec3 uWind;
uniform float uCloudDetail;
uniform vec3 uMoonDir;
uniform float uNight;
varying vec3 vWorld;

float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }

float clouds(vec2 p) {
  vec4 n = texture2D(tNoise, p);
  float d = n.r * 0.5 + n.g * 0.27 + n.b * 0.14 * uCloudDetail + n.a * 0.07 * uCloudDetail;
  return d / (0.77 + 0.21 * uCloudDetail);
}

void main() {
  vec3 rd = normalize(vWorld - cameraPosition);
  vec3 col = atmoHaze(rd);
  float sd = dot(rd, uSunDir);
  float night = uNight;

  // Disco solar y halo
  float disc = smoothstep(0.99986, 0.99993, sd);
  col += uSunColor * disc * 30.0 * step(0.0, rd.y + 0.02);

  // Estrellas y luna (de noche)
  if (night > 0.01 && rd.y > 0.0) {
    vec3 g = floor(rd * 420.0);
    float h = hash3(g);
    float tw = 0.65 + 0.35 * sin(uTime * (2.0 + h * 5.0) + h * 40.0);
    col += vec3(0.85, 0.9, 1.0) * step(0.9975, h) * tw * night * 1.6 * smoothstep(0.0, 0.25, rd.y);
    float md = dot(rd, uMoonDir);
    col += vec3(0.75, 0.8, 0.9) * smoothstep(0.99935, 0.99955, md) * 1.8 * night;
    col += vec3(0.08, 0.1, 0.16) * pow(max(md, 0.0), 30.0) * night;
  }

  // Nubes: capa a 2,5 km que se desplaza con el viento.
  if (rd.y > 0.0) {
    float t = 2500.0 / max(rd.y, 0.02);
    vec2 p = (cameraPosition.xz + rd.xz * t) / 26000.0 + uWind.xy * uTime * 0.0016;
    float d = clouds(p);
    float cov = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.32, d);
    if (cov > 0.001) {
      float d2 = clouds(p + uSunDir.xz * 0.012);
      float lit = clamp(0.55 + (d - d2) * 4.0, 0.0, 1.0);
      vec3 sunlit = uSunColor * (0.9 + 0.6 * pow(max(sd, 0.0), 6.0)) + uZenith * 0.5;
      vec3 shade = mix(uHorizon, uZenith, 0.5) * 0.55 + uGloom * 0.2;
      vec3 cc = mix(shade, sunlit, lit) * mix(0.05, 1.0, uDaylight);
      float fade = smoothstep(0.0, 0.12, rd.y);
      col = mix(col, cc, cov * 0.92 * fade);
    }
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SKY_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // siempre en el fondo
}`;

// Paletas (espacio lineal)
const ZENITH_DAY = new Color(0.12, 0.3, 0.72);
const ZENITH_DUSK = new Color(0.16, 0.2, 0.42);
const ZENITH_NIGHT = new Color(0.003, 0.005, 0.014);
const HORIZON_DAY = new Color(0.56, 0.68, 0.84);
const HORIZON_DUSK = new Color(0.95, 0.5, 0.26);
const HORIZON_NIGHT = new Color(0.01, 0.014, 0.028);
const SUN_DAY = new Color(1.0, 0.95, 0.86);
const SUN_DUSK = new Color(1.0, 0.48, 0.2);
const GLOOM_DAY = new Color(0.2, 0.18, 0.17);
const GLOOM_NIGHT = new Color(0.03, 0.012, 0.01); // un rescoldo rojizo sobre Mordor
const MOON_COLOR = new Color(0.5, 0.6, 0.9);

/**
 * Cielo, sol y luz ambiental. El entorno (IBL) se genera desde el propio cielo con PMREM
 * y se rehace cuando cambia la hora, así la luz ambiental siempre coincide con el cielo
 * (un HDRI fijo no casaría con el ciclo día/noche).
 */
export class Sky {
  readonly sun = new DirectionalLight(0xffffff, 3);
  readonly dome: Mesh;
  private mat: ShaderMaterial;
  private pmrem: PMREMGenerator;
  private envScene = new Scene();
  private env: WebGLRenderTarget | null = null;
  private lastEnvHours = -100;
  private envTimer = 0;
  private range = 28;
  private texel = 0.05;
  private moonDir = ATMO.uSunDir.value.clone();
  private tmp = new Color();
  private tmp2 = new Color();

  constructor(private scene: Scene, private renderer: WebGLRenderer, noise: Texture) {
    ATMO.tNoise.value = noise;
    this.mat = new ShaderMaterial({
      uniforms: { ...ATMO, uCloudDetail: { value: 1 }, uMoonDir: { value: this.moonDir }, uNight: { value: 0 } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new Mesh(new SphereGeometry(1000, 32, 16), this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.dome.name = 'sky';
    scene.add(this.dome, this.sun, this.sun.target);
    scene.background = null;

    const envDome = new Mesh(new SphereGeometry(10, 32, 16), this.mat);
    this.envScene.add(envDome);
    this.pmrem = new PMREMGenerator(renderer);

    const sh = this.sun.shadow;
    sh.bias = -0.0004;
    sh.normalBias = 0.04;
    sh.camera.near = 1;
    sh.camera.far = 600;
  }

  applyQuality(p: QualityPreset): void {
    this.sun.castShadow = p.shadows;
    this.range = p.shadowRange;
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== p.shadowMapSize) {
      sh.mapSize.set(p.shadowMapSize, p.shadowMapSize);
      sh.map?.dispose();
      sh.map = null;
    }
    const cam = sh.camera;
    cam.left = cam.bottom = -this.range;
    cam.right = cam.top = this.range;
    cam.updateProjectionMatrix();
    this.texel = (2 * this.range) / p.shadowMapSize;
    this.mat.uniforms.uCloudDetail.value = p.level === 'low' ? 0 : 1;
  }

  update(dt: number, time: TimeOfDay, focus: Vector3, scrubbing: boolean): void {
    const s = time.sunDir;
    const e = s.y;
    const day = MathUtils.smoothstep(e, -0.1, 0.12);
    const dusk = Math.max(0, 1 - Math.abs(e - 0.02) / 0.22) * MathUtils.smoothstep(e, -0.2, 0.0);

    const zen = this.tmp.copy(ZENITH_NIGHT).lerp(ZENITH_DAY, day).lerp(ZENITH_DUSK, dusk * 0.55);
    ATMO.uZenith.value.copy(zen);
    const hor = this.tmp2.copy(HORIZON_NIGHT).lerp(HORIZON_DAY, day).lerp(HORIZON_DUSK, dusk * 0.75);
    ATMO.uHorizon.value.copy(hor);
    ATMO.uSunColor.value.copy(SUN_DAY).lerp(SUN_DUSK, Math.min(1, dusk * 1.3)).multiplyScalar(MathUtils.smoothstep(e, -0.06, 0.04));
    ATMO.uGloom.value.copy(GLOOM_NIGHT).lerp(GLOOM_DAY, day);
    ATMO.uSunDir.value.copy(s);
    ATMO.uDaylight.value = day;
    ATMO.uTime.value += dt;

    // Neblina matinal: más densa y baja al amanecer.
    const h = time.hours;
    const morning = Math.max(0, 1 - Math.abs(h - 6.8) / 2.2);
    ATMO.uFogDensity.value = 0.00007 * (1 + morning * 2.5) * (0.7 + 0.3 * day);
    ATMO.uFogFalloff.value = 1 / (1100 - morning * 650);

    // Luna: aproximadamente opuesta al sol.
    this.moonDir.set(-s.x, Math.abs(s.y) * 0.8 + 0.25, -s.z * 0.6).normalize();

    // Luz direccional: el sol, o la luna de noche.
    const moon = e < -0.04;
    const L = moon ? this.moonDir : s;
    this.sun.intensity = moon ? 0.35 : 3.4 * MathUtils.smoothstep(e, -0.04, 0.08);
    if (moon) this.sun.color.copy(MOON_COLOR);
    else this.sun.color.copy(ATMO.uSunColor.value).multiplyScalar(1 / Math.max(0.05, MathUtils.smoothstep(e, -0.06, 0.04)));
    this.scene.environmentIntensity = 0.3 + 0.7 * MathUtils.smoothstep(e, -0.22, 0.08);
    this.mat.uniforms.uNight.value = 1 - MathUtils.smoothstep(e, -0.22, -0.06);
    this.renderer.toneMappingExposure = 1.0 + (1 - day) * 0.6;

    // Sombra centrada en el jugador, ajustada a la rejilla de texels.
    const t = this.texel;
    const fx = Math.round(focus.x / t) * t;
    const fz = Math.round(focus.z / t) * t;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + L.x * 300, focus.y + Math.max(L.y, 0.08) * 300, fz + L.z * 300);
    this.dome.position.copy(focus);

    // Entorno: se rehace al cambiar la hora (limitado para no dar tirones).
    this.envTimer -= dt;
    const changed = Math.abs(h - this.lastEnvHours) > (scrubbing ? 0.35 : 0.08);
    if (this.envTimer <= 0 && (changed || !this.env)) this.rebuildEnv(h);
  }

  private rebuildEnv(hours: number): void {
    this.lastEnvHours = hours;
    this.envTimer = 0.4;
    const xr = this.renderer.xr.enabled;
    this.renderer.xr.enabled = false;
    const rt = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 100, { size: 256 });
    this.renderer.xr.enabled = xr;
    this.env?.dispose();
    this.env = rt;
    this.scene.environment = rt.texture;
  }
}
