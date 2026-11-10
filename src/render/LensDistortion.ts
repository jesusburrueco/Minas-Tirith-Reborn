import { ShaderMaterial, type Texture } from 'three';

/** Coeficientes de Google Cardboard v2 (modelo polinómico radial). */
export const CARDBOARD_K1 = 0.34;
export const CARDBOARD_K2 = 0.55;

/**
 * Pase final del modo estéreo propio: toma los dos ojos (lado a lado en una textura HDR),
 * aplica la predistorsión en barril centrada en cada lente, y después el tone mapping
 * y la conversión a sRGB (el renderer no los aplica al dibujar en un render target).
 */
export function createLensMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      tScene: { value: null as Texture | null },
      uDistort: { value: 1.0 },
      uK1: { value: CARDBOARD_K1 },
      uK2: { value: CARDBOARD_K2 },
      uLensOffset: { value: 0.0 }, // desplazamiento del centro de la lente hacia dentro, en UV de ojo
      uEyeAspect: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tScene;
      uniform float uDistort, uK1, uK2, uLensOffset, uEyeAspect;
      varying vec2 vUv;
      void main() {
        float eye = step(0.5, vUv.x);                      // 0 = izquierdo, 1 = derecho
        vec2 e = vec2(vUv.x * 2.0 - eye, vUv.y);           // UV dentro del ojo
        vec2 c = vec2(0.5 + mix(uLensOffset, -uLensOffset, eye), 0.5);
        vec2 k = vec2(uEyeAspect, 1.0) * 2.0;              // unidades: semialtura = 1
        vec2 d = (e - c) * k;
        float r2 = dot(d, d);
        float f = mix(1.0, (1.0 + uK1 * r2 + uK2 * r2 * r2) / (1.0 + uK1 + uK2), uDistort);
        vec2 s = c + d * f / k;
        vec4 col = vec4(0.0, 0.0, 0.0, 1.0);
        if (all(greaterThanEqual(s, vec2(0.0))) && all(lessThanEqual(s, vec2(1.0)))) {
          col = texture2D(tScene, vec2((s.x + eye) * 0.5, s.y));
        }
        gl_FragColor = col;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
  });
}
