import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { QualityPreset } from '../../app/Quality';
import type { SettingsStore } from '../../app/Settings';
import type { DeviceOrientationInput } from '../../input/DeviceOrientationInput';
import type { TouchInput } from '../../input/TouchInput';

export type ModeKind = 'xr' | 'stereo' | 'desktop';

export interface ModeContext {
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  settings: SettingsStore;
  touch: TouchInput;
  orientation: DeviceOrientationInput;
  getQuality: () => QualityPreset;
}

export interface ViewMode {
  readonly kind: ModeKind;
  /** Número de vistas por fotograma (para dividir las draw calls). */
  readonly eyes: number;
  /** ¿La cabeza la orienta algo externo (XR o giroscopio) en vez del ratón? */
  externalHead(): boolean;
  /** Debe invocarse directamente desde un gesto del usuario (click/tap). */
  start(): Promise<void>;
  stop(): void;
  /** Se llama si el modo termina por su cuenta (p. ej. el usuario sale de WebXR). */
  onEnd: () => void;
  resize(): void;
  applyQuality(p: QualityPreset): void;
  render(scene: Scene): void;
}

export async function requestWakeLock(): Promise<() => void> {
  type WakeLockSentinelLike = { release: () => Promise<void> };
  const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
  if (!nav.wakeLock) return () => {};
  let sentinel: WakeLockSentinelLike | null = null;
  const acquire = async () => {
    try {
      sentinel = await nav.wakeLock!.request('screen');
    } catch {
      sentinel = null;
    }
  };
  const onVis = () => {
    if (document.visibilityState === 'visible') void acquire();
  };
  await acquire();
  document.addEventListener('visibilitychange', onVis);
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    void sentinel?.release();
  };
}
