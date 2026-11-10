import { Euler, MathUtils, Quaternion, Vector3 } from 'three';

type PermissionCapable = { requestPermission?: () => Promise<'granted' | 'denied'> };

const Z_AXIS = new Vector3(0, 0, 1);
const Y_AXIS = new Vector3(0, 1, 0);
// Gira el sistema del dispositivo (pantalla mirando hacia arriba) a "mirando al frente".
const Q_SCREEN_TO_CAMERA = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

/**
 * Orientación de la cabeza a partir de DeviceOrientation (modo estéreo propio).
 * En iOS 13+ hay que pedir permiso desde un gesto del usuario.
 */
export class DeviceOrientationInput {
  private alpha = 0;
  private beta = 0;
  private gamma = 0;
  private hasData = false;
  private listening = false;
  private yawOffset = new Quaternion();
  private euler = new Euler();
  private qTmp = new Quaternion();
  private vTmp = new Vector3();

  get available(): boolean {
    return this.hasData;
  }

  /** Debe llamarse de forma síncrona dentro de un gesto (click/touchend). */
  static requestPermission(): Promise<boolean> {
    const D = (window as unknown as { DeviceOrientationEvent?: PermissionCapable }).DeviceOrientationEvent;
    if (D && typeof D.requestPermission === 'function') {
      return D.requestPermission().then((r) => r === 'granted').catch(() => false);
    }
    return Promise.resolve(typeof DeviceOrientationEvent !== 'undefined');
  }

  start(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('deviceorientation', this.onEvent);
  }

  stop(): void {
    this.listening = false;
    this.hasData = false;
    window.removeEventListener('deviceorientation', this.onEvent);
  }

  private onEvent = (e: DeviceOrientationEvent) => {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    const first = !this.hasData;
    this.alpha = e.alpha;
    this.beta = e.beta;
    this.gamma = e.gamma;
    this.hasData = true;
    if (first) this.recenter();
  };

  private screenAngle(): number {
    const so = screen.orientation?.angle;
    if (typeof so === 'number') return so;
    const legacy = (window as unknown as { orientation?: number }).orientation;
    return typeof legacy === 'number' ? legacy : 0;
  }

  private raw(out: Quaternion): Quaternion {
    const a = MathUtils.degToRad(this.alpha);
    const b = MathUtils.degToRad(this.beta);
    const g = MathUtils.degToRad(this.gamma);
    const orient = MathUtils.degToRad(this.screenAngle());
    this.euler.set(b, a, -g, 'YXZ');
    out.setFromEuler(this.euler);
    out.multiply(Q_SCREEN_TO_CAMERA);
    out.multiply(this.qTmp.setFromAxisAngle(Z_AXIS, -orient));
    return out;
  }

  /** Orientación relativa al recentrado. Devuelve false si aún no hay datos. */
  getQuaternion(out: Quaternion): boolean {
    if (!this.hasData) return false;
    this.raw(out);
    out.premultiply(this.yawOffset);
    return true;
  }

  /** Hace que la dirección actual de la mirada sea "al frente" (solo guiñada). */
  recenter(): void {
    if (!this.hasData) return;
    const q = this.raw(new Quaternion());
    const f = this.vTmp.set(0, 0, -1).applyQuaternion(q);
    const yaw = Math.atan2(-f.x, -f.z);
    this.yawOffset.setFromAxisAngle(Y_AXIS, -yaw);
  }
}
