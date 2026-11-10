import type { ModeKind } from './ViewMode';
import { XRMode } from './XRMode';

export interface Capabilities {
  xr: boolean;
  isIOS: boolean;
  isMobile: boolean;
  orientation: boolean;
  secure: boolean;
  recommended: ModeKind;
}

export async function detectCapabilities(): Promise<Capabilities> {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = isIOS || /Android|Mobi/i.test(ua) || (matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
  const orientation = typeof DeviceOrientationEvent !== 'undefined';
  const xr = await XRMode.isSupported();
  const recommended: ModeKind = isMobile ? (xr && !isIOS ? 'xr' : 'stereo') : 'desktop';
  return { xr, isIOS, isMobile, orientation, secure: window.isSecureContext, recommended };
}
