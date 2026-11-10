import {
  HalfFloatType, Matrix4, Mesh, OrthographicCamera, PerspectiveCamera, PlaneGeometry, Scene,
  UnsignedByteType, Vector2, WebGLRenderTarget,
} from 'three';
import type { QualityPreset } from '../../app/Quality';
import { DeviceOrientationInput } from '../../input/DeviceOrientationInput';
import { createLensMaterial } from '../LensDistortion';
import { UI_UNIFORMS } from '../ScreenOverlay';
import { requestWakeLock, type ModeContext, type ViewMode } from './ViewMode';

/** Tamaño aproximado de un píxel CSS en un móvil moderno (iPhone 13: 139.8 mm / 844 px). */
const MM_PER_CSS_PX = 0.1657;

/**
 * Estéreo propio para iOS y navegadores sin WebXR: pantalla partida, una cámara por ojo,
 * cabeza orientada con DeviceOrientation. Dos caminos:
 *  - sin corrección de lente: cada ojo se dibuja directo en su mitad del canvas (lo más barato);
 *  - con corrección: ambos ojos a un render target HDR + pase final de distorsión y tone mapping.
 */
export class StereoMode implements ViewMode {
  readonly kind = 'stereo' as const;
  readonly eyes = 2;
  onEnd = () => {};

  private eyeL = new PerspectiveCamera();
  private eyeR = new PerspectiveCamera();
  private offset = new Matrix4();
  private size = new Vector2();
  private rt: WebGLRenderTarget | null = null;
  private msaa = 0;
  private pixelRatio = 1;
  private lensMat = createLensMaterial();
  private quadScene = new Scene();
  private quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private releaseWakeLock: () => void = () => {};
  private gear = document.getElementById('gear')!;
  private portrait = document.getElementById('portrait')!;
  onGear: () => void = () => {};

  constructor(private ctx: ModeContext) {
    for (const c of [this.eyeL, this.eyeR]) {
      c.matrixAutoUpdate = false;
      c.matrixWorldAutoUpdate = false;
    }
    const quad = new Mesh(new PlaneGeometry(2, 2), this.lensMat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
    this.gear.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onGear();
    });
  }

  externalHead(): boolean {
    return this.ctx.orientation.available;
  }

  async start(): Promise<void> {
    // 1) Permiso del giroscopio: tiene que ser lo primero dentro del gesto (iOS).
    const permission = DeviceOrientationInput.requestPermission();
    // 2) Pantalla completa y bloqueo en horizontal (Android; en iPhone no existe).
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else el.webkitRequestFullscreen?.();
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
    } catch {
      /* no soportado: se avisa con el indicador de "gira el móvil" */
    }
    const granted = await permission;
    if (!granted) throw new Error('Sin permiso para usar el giroscopio. Actívalo y vuelve a intentarlo.');
    this.ctx.orientation.start();
    this.ctx.touch.enabled = true;
    this.releaseWakeLock = await requestWakeLock();
    this.gear.classList.remove('hidden');
    window.addEventListener('resize', this.checkPortrait);
    this.checkPortrait();
    this.resize();
  }

  stop(): void {
    this.ctx.orientation.stop();
    this.ctx.touch.enabled = false;
    this.releaseWakeLock();
    this.gear.classList.add('hidden');
    this.portrait.classList.add('hidden');
    window.removeEventListener('resize', this.checkPortrait);
    this.ctx.renderer.shadowMap.autoUpdate = true;
    UI_UNIFORMS.uUiGain.value = 1;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    this.rt?.dispose();
    this.rt = null;
  }

  private checkPortrait = () => {
    this.portrait.classList.toggle('hidden', window.innerWidth >= window.innerHeight);
  };

  applyQuality(p: QualityPreset): void {
    this.pixelRatio = p.pixelRatio;
    if (p.msaa !== this.msaa) {
      this.msaa = p.msaa;
      this.rt?.dispose();
      this.rt = null;
    }
    this.resize();
  }

  resize(): void {
    const r = this.ctx.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatio));
    r.setSize(window.innerWidth, window.innerHeight, false);
  }

  private ensureTarget(w: number, h: number): WebGLRenderTarget {
    if (this.rt && (this.rt.width !== w || this.rt.height !== h)) {
      this.rt.setSize(w, h);
    }
    if (!this.rt) {
      const hdr = this.ctx.renderer.extensions.has('EXT_color_buffer_float');
      this.rt = new WebGLRenderTarget(w, h, {
        type: hdr ? HalfFloatType : UnsignedByteType,
        samples: this.msaa,
        depthBuffer: true,
      });
      this.rt.scissorTest = true;
    }
    return this.rt;
  }

  private updateEyes(): void {
    const { camera, settings } = this.ctx;
    const s = settings.values;
    const ipd = s.ipdMm / 1000;
    const aspect = (window.innerWidth / 2) / window.innerHeight;
    for (const [eye, sign] of [[this.eyeL, -1], [this.eyeR, 1]] as const) {
      if (eye.fov !== s.stereoFovDeg || eye.aspect !== aspect || eye.near !== camera.near || eye.far !== camera.far) {
        eye.fov = s.stereoFovDeg;
        eye.aspect = aspect;
        eye.near = camera.near;
        eye.far = camera.far;
        eye.updateProjectionMatrix();
      }
      this.offset.makeTranslation((sign * ipd) / 2, 0, 0);
      eye.matrixWorld.multiplyMatrices(camera.matrixWorld, this.offset);
      eye.matrixWorldInverse.copy(eye.matrixWorld).invert();
    }
  }

  render(scene: Scene): void {
    const r = this.ctx.renderer;
    const s = this.ctx.settings.values;
    scene.updateMatrixWorld();
    this.updateEyes();

    // Las sombras se calculan una vez por fotograma, no una por ojo.
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    scene.matrixWorldAutoUpdate = false;

    if (s.lensCorrection) {
      UI_UNIFORMS.uUiGain.value = 1.9; // compensa el ACES del pase final para el texto blanco
      r.getDrawingBufferSize(this.size);
      const w = this.size.x, h = this.size.y, hw = Math.floor(w / 2);
      const rt = this.ensureTarget(w, h);
      r.setRenderTarget(rt);
      rt.viewport.set(0, 0, hw, h);
      rt.scissor.set(0, 0, hw, h);
      r.render(scene, this.eyeL);
      rt.viewport.set(hw, 0, w - hw, h);
      rt.scissor.set(hw, 0, w - hw, h);
      r.render(scene, this.eyeR);
      r.setRenderTarget(null);

      const screenMm = window.innerWidth * MM_PER_CSS_PX;
      const u = this.lensMat.uniforms;
      u.tScene.value = rt.texture;
      u.uEyeAspect.value = this.eyeL.aspect;
      u.uLensOffset.value = Math.max(-0.2, Math.min(0.2, 0.5 - s.lensSeparationMm / screenMm));
      r.render(this.quadScene, this.quadCam);
    } else {
      UI_UNIFORMS.uUiGain.value = 1;
      const w = window.innerWidth, h = window.innerHeight, hw = Math.floor(w / 2);
      r.setRenderTarget(null);
      r.setScissorTest(true);
      r.setViewport(0, 0, hw, h);
      r.setScissor(0, 0, hw, h);
      r.render(scene, this.eyeL);
      r.setViewport(hw, 0, w - hw, h);
      r.setScissor(hw, 0, w - hw, h);
      r.render(scene, this.eyeR);
      r.setScissorTest(false);
      r.setViewport(0, 0, w, h);
    }
    scene.matrixWorldAutoUpdate = true;
  }
}
