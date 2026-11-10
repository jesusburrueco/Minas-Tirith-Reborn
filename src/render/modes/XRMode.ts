import type { Scene } from 'three';
import type { QualityPreset } from '../../app/Quality';
import type { ModeContext, ViewMode } from './ViewMode';

/** WebXR immersive-vr (Chrome Android con Cardboard). */
export class XRMode implements ViewMode {
  readonly kind = 'xr' as const;
  readonly eyes = 2;
  onEnd = () => {};
  private session: XRSession | null = null;

  constructor(private ctx: ModeContext) {}

  static async isSupported(): Promise<boolean> {
    try {
      return !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-vr'));
    } catch {
      return false;
    }
  }

  externalHead(): boolean {
    return true;
  }

  async start(): Promise<void> {
    const { renderer, touch } = this.ctx;
    // La escala del framebuffer solo puede fijarse antes de iniciar la sesión.
    renderer.xr.setFramebufferScaleFactor(this.ctx.getQuality().xrFramebufferScale);
    const session = await navigator.xr!.requestSession('immersive-vr');
    this.session = session;
    session.addEventListener('end', () => {
      this.session = null;
      touch.enabled = false;
      this.onEnd();
    });
    await renderer.xr.setSession(session);
    touch.attachXRSession(session);
    touch.enabled = true;
  }

  stop(): void {
    void this.session?.end();
  }

  applyQuality(_p: QualityPreset): void {
    // Resolución: se aplica en la próxima sesión. Sombras y demás, en tiempo real (App).
  }

  resize(): void {}

  render(scene: Scene): void {
    this.ctx.renderer.render(scene, this.ctx.camera);
  }
}
