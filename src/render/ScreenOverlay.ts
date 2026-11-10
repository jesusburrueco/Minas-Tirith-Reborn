import { Mesh, PlaneGeometry, ShaderMaterial } from 'three';

/**
 * Las capas de pantalla (viñeta, fundido, HUD) se dibujan como quads en espacio de
 * recorte: ignoran la cámara, así que en estéreo y en WebXR aparecen en cada ojo,
 * centradas y sin el retraso de un fotograma de los objetos hijos de la cámara.
 */
export const UI_UNIFORMS = {
  /** Compensa el tone mapping del pase final cuando hay corrección de lente. */
  uUiGain: { value: 1.0 },
};

export function clipSpaceMesh(material: ShaderMaterial, renderOrder: number): Mesh {
  const m = new Mesh(new PlaneGeometry(2, 2), material);
  m.frustumCulled = false;
  m.renderOrder = renderOrder;
  m.matrixAutoUpdate = false;
  return m;
}

/** Viñeta de confort + fundido a negro (teletransporte, transiciones). */
export class ScreenOverlay {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;
  vignette = 0;
  fade = 0;

  constructor() {
    this.mat = new ShaderMaterial({
      uniforms: { uVignette: { value: 0 }, uFade: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() {
          float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
          vP = position.xy * vec2(aspect, 1.0);
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uVignette;
        uniform float uFade;
        varying vec2 vP;
        void main() {
          float r = length(vP);
          float inner = mix(1.6, 0.42, uVignette);
          float v = uVignette > 0.001 ? smoothstep(inner, inner + 0.38, r) : 0.0;
          float a = max(v, uFade);
          if (a < 0.002) discard;
          gl_FragColor = vec4(0.0, 0.0, 0.0, a);
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = clipSpaceMesh(this.mat, 1000);
  }

  update(): void {
    this.mat.uniforms.uVignette.value = this.vignette;
    this.mat.uniforms.uFade.value = this.fade;
    this.mesh.visible = this.vignette > 0.001 || this.fade > 0.001;
  }
}
