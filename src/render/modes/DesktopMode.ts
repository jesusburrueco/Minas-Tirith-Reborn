import type { Scene } from 'three';
import type { QualityPreset } from '../../app/Quality';
import type { ModeContext, ViewMode } from './ViewMode';

/** Ratón + teclado, una sola vista. También se usa como vista previa tras la pantalla inicial. */
export class DesktopMode implements ViewMode {
  readonly kind = 'desktop' as const;
  readonly eyes = 1;
  onEnd = () => {};
  private pixelRatio = 1;

  constructor(private ctx: ModeContext) {}

  externalHead(): boolean {
    return false;
  }

  async start(): Promise<void> {
    this.resize();
  }

  stop(): void {}

  applyQuality(p: QualityPreset): void {
    this.pixelRatio = p.pixelRatio;
    this.resize();
  }

  resize(): void {
    const { renderer, camera } = this.ctx;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  render(scene: Scene): void {
    const { renderer, camera } = this.ctx;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }
}
