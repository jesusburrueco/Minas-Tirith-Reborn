import type { InputFrame } from './actions';

/** Ranuras de teletransporte: 1–9 y 0 (por código físico, independiente del idioma del teclado). */
const TELEPORT_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];

/**
 * Teclado + ratón (modo escritorio).
 * WASD/flechas mover · Shift correr · Espacio saltar · E interactuar · M/Tab menú
 * R/F adelantar/retrasar hora · C recentrar · 1–0 teletransporte · ratón mirar (clic = capturar).
 */
export class KeyboardMouseInput {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private clicked = false;
  pointerLockEnabled = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.pressedThisFrame.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.pointerLockEnabled && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      } else {
        this.clicked = true;
      }
    });
  }

  releasePointer(): void {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  read(f: InputFrame, menuOpen: boolean): void {
    const k = (c: string) => this.down.has(c);
    const p = (c: string) => this.pressedThisFrame.has(c);

    if (!menuOpen) {
      let x = 0, y = 0;
      if (k('KeyW') || k('ArrowUp')) y += 1;
      if (k('KeyS') || k('ArrowDown')) y -= 1;
      if (k('KeyD') || k('ArrowRight')) x += 1;
      if (k('KeyA') || k('ArrowLeft')) x -= 1;
      const m = Math.hypot(x, y);
      if (m > 0) {
        f.move.x += x / m;
        f.move.y += y / m;
      }
      f.run ||= k('ShiftLeft') || k('ShiftRight');
      f.jump ||= p('Space');
      f.interact ||= p('KeyE');
      f.recenter ||= p('KeyC');
      if (k('KeyR')) f.timeAxis += 1;
      if (k('KeyF')) f.timeAxis -= 1;
      f.look.x += this.lookX;
      f.look.y += this.lookY;
      for (let i = 0; i < TELEPORT_CODES.length; i++) if (p(TELEPORT_CODES[i])) f.teleportSlot = i;
    } else {
      f.up ||= p('ArrowUp') || p('KeyW');
      f.down ||= p('ArrowDown') || p('KeyS');
      f.left ||= p('ArrowLeft') || p('KeyA');
      f.right ||= p('ArrowRight') || p('KeyD');
      f.confirm ||= p('Enter') || p('Space') || this.clicked;
      f.back ||= p('Escape') || p('Backspace');
    }
    f.menu ||= p('KeyM') || p('Tab');

    this.pressedThisFrame.clear();
    this.lookX = this.lookY = 0;
    this.clicked = false;
  }
}
