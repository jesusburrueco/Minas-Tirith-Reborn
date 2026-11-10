import type { InputFrame } from './actions';

const HOLD_MS = 180;
const TAP_MAX_MS = 260;
const DOUBLE_TAP_MS = 350;

/**
 * El botón del Cardboard (o un dedo en la pantalla):
 * - mantener pulsado → caminar hacia donde miras
 * - doble toque → abrir/cerrar menú
 * - toque simple → interactuar (o, con el menú abierto, seleccionar la fila que miras)
 * Sirve para toques en pantalla y para los eventos select de WebXR.
 */
export class TouchInput {
  private isDown = false;
  private downAt = 0;
  private lastTapAt = -1e9;
  private pendingTap = false;
  private menuToggle = false;
  private confirm = false;
  enabled = false;

  attachCanvas(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') this.press();
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') this.release();
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  attachXRSession(session: XRSession): void {
    session.addEventListener('selectstart', () => this.press());
    session.addEventListener('selectend', () => this.release());
  }

  press(): void {
    if (!this.enabled) return;
    this.isDown = true;
    this.downAt = performance.now();
  }

  release(): void {
    if (!this.enabled || !this.isDown) return;
    this.isDown = false;
    const now = performance.now();
    if (now - this.downAt > TAP_MAX_MS) return; // fue un "mantener", no un toque
    if (this.pendingTap && now - this.lastTapAt < DOUBLE_TAP_MS) {
      this.pendingTap = false;
      this.menuToggle = true;
    } else {
      this.pendingTap = true;
      this.lastTapAt = now;
    }
  }

  read(f: InputFrame, menuOpen: boolean): void {
    const now = performance.now();
    // Un toque simple se confirma cuando expira la ventana del doble toque.
    if (this.pendingTap && now - this.lastTapAt >= DOUBLE_TAP_MS) {
      this.pendingTap = false;
      this.confirm = true;
    }
    if (!menuOpen && this.isDown && now - this.downAt > HOLD_MS) f.move.y = Math.max(f.move.y, 1);
    if (this.menuToggle) f.menu = true;
    if (this.confirm) {
      if (menuOpen) f.confirm = true;
      else f.interact = true;
    }
    this.menuToggle = false;
    this.confirm = false;
  }
}
