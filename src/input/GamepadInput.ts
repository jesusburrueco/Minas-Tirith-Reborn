import { applyDeadzone, type InputFrame } from './actions';

/** Índices del layout "standard" de la Gamepad API (DualShock 4 / PS4). */
export const PAD = {
  CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3,
  L1: 4, R1: 5, L2: 6, R2: 7,
  SHARE: 8, OPTIONS: 9, L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, PS: 16,
} as const;

export type PadStatus = { connected: true; id: string } | { connected: false };

/**
 * Lee el primer mando disponible (preferentemente con mapping "standard").
 * Se sondea cada fotograma, así que una desconexión/reconexión se recupera sola.
 */
export class GamepadInput {
  private index: number | null = null;
  private prev: boolean[] = [];
  private snapArmed = true;
  private navArmedY = true;
  private navArmedX = true;
  onStatus: (s: PadStatus) => void = () => {};

  get connected(): boolean {
    return this.index !== null;
  }

  constructor() {
    // Los eventos solo aceleran la detección; el sondeo es la fuente de verdad.
    window.addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this.index) this.setPad(null);
    });
  }

  private find(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.index !== null) {
      const p = pads[this.index];
      if (p && p.connected) return p;
    }
    let fallback: Gamepad | null = null;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (p.mapping === 'standard') return p;
      fallback ??= p;
    }
    return fallback;
  }

  private setPad(p: Gamepad | null): void {
    const newIndex = p ? p.index : null;
    if (newIndex === this.index) return;
    this.index = newIndex;
    this.prev = [];
    this.onStatus(p ? { connected: true, id: p.id } : { connected: false });
  }

  read(f: InputFrame, deadzone: number, menuOpen: boolean): void {
    const p = this.find();
    this.setPad(p);
    if (!p) return;

    const btn = (i: number) => {
      const b = p.buttons[i];
      return !!b && (b.pressed || b.value > 0.5);
    };
    const pressed = (i: number) => btn(i) && !this.prev[i];

    const ax = (i: number) => p.axes[i] ?? 0;
    const left = applyDeadzone(ax(0), ax(1), deadzone);
    const rx = Math.abs(ax(2)) > deadzone ? ax(2) : 0;

    if (!menuOpen) {
      f.move.x += left.x;
      f.move.y += -left.y;
      f.run ||= (p.buttons[PAD.R2]?.value ?? 0) > 0.3 || btn(PAD.R2);
      f.turnAxis += rx;
      if (this.snapArmed && Math.abs(ax(2)) > 0.7) {
        f.snapTurn = ax(2) > 0 ? 1 : -1;
        this.snapArmed = false;
      }
      f.jump ||= pressed(PAD.CROSS);
      f.interact ||= pressed(PAD.CIRCLE);
      f.recenter ||= pressed(PAD.TRIANGLE);
      if (btn(PAD.R1)) f.timeAxis += 1;
      if (btn(PAD.L1)) f.timeAxis -= 1;
    } else {
      f.confirm ||= pressed(PAD.CROSS);
      f.back ||= pressed(PAD.CIRCLE);
      // Navegación con cruceta o stick izquierdo (con rearme para no saltar filas).
      const ly = ax(1);
      const lx = ax(0);
      if (this.navArmedY && Math.abs(ly) > 0.6) {
        if (ly < 0) f.up = true; else f.down = true;
        this.navArmedY = false;
      }
      if (this.navArmedX && Math.abs(lx) > 0.6) {
        if (lx < 0) f.left = true; else f.right = true;
        this.navArmedX = false;
      }
      if (Math.abs(ly) < 0.3) this.navArmedY = true;
      if (Math.abs(lx) < 0.3) this.navArmedX = true;
    }
    if (Math.abs(ax(2)) < 0.35) this.snapArmed = true;

    f.up ||= pressed(PAD.UP);
    f.down ||= pressed(PAD.DOWN);
    f.left ||= pressed(PAD.LEFT);
    f.right ||= pressed(PAD.RIGHT);
    f.menu ||= pressed(PAD.OPTIONS);

    for (let i = 0; i < p.buttons.length; i++) this.prev[i] = btn(i);
  }
}
