import { emptyFrame, resetFrame, type InputFrame } from './actions';
import { GamepadInput } from './GamepadInput';
import { KeyboardMouseInput } from './KeyboardMouseInput';
import { TouchInput } from './TouchInput';

/** Combina todas las fuentes en un único InputFrame por fotograma. */
export class InputManager {
  readonly gamepad = new GamepadInput();
  readonly keyboard: KeyboardMouseInput;
  readonly touch = new TouchInput();
  readonly frame: InputFrame = emptyFrame();

  constructor(canvas: HTMLCanvasElement) {
    this.keyboard = new KeyboardMouseInput(canvas);
    this.touch.attachCanvas(canvas);
  }

  update(deadzone: number, menuOpen: boolean): InputFrame {
    const f = this.frame;
    resetFrame(f);
    this.gamepad.read(f, deadzone, menuOpen);
    this.keyboard.read(f, menuOpen);
    this.touch.read(f, menuOpen);
    const m = Math.hypot(f.move.x, f.move.y);
    if (m > 1) {
      f.move.x /= m;
      f.move.y /= m;
    }
    f.turnAxis = Math.max(-1, Math.min(1, f.turnAxis));
    f.timeAxis = Math.max(-1, Math.min(1, f.timeAxis));
    return f;
  }
}
