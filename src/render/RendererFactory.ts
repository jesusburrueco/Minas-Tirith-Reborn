import { ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';

export type RendererKind = 'webgl' | 'webgpu';

/**
 * Punto único de creación del renderer.
 *
 * Hoy solo WebGL2 (el único con WebXR maduro en Cardboard y con todos los shaders
 * GLSL del proyecto). Para probar WebGPU más adelante:
 *   import { WebGPURenderer } from 'three/webgpu';
 *   const r = new WebGPURenderer({ canvas, antialias: true }); await r.init();
 * …y portar a TSL los materiales a medida (viven en src/render y en los módulos de materiales de cada sistema).
 */
export function createRenderer(canvas: HTMLCanvasElement, kind: RendererKind = 'webgl'): WebGLRenderer {
  if (kind === 'webgpu') console.warn('WebGPURenderer aún no está soportado; se usa WebGL.');
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local'); // Cardboard: 3DoF, sin suelo real
  renderer.info.autoReset = false; // contamos draw calls de ambos ojos manualmente
  return renderer;
}
