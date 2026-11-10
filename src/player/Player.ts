import { Euler, Group, MathUtils, Quaternion, Vector3, type PerspectiveCamera } from 'three';
import type { Settings } from '../app/Settings';
import type { InputFrame } from '../input/actions';
import type { CollisionWorld } from '../physics/CollisionWorld';
import { CharacterController } from './CharacterController';

export const WALK_SPEED = 2.0; // m/s — moderado por confort
export const RUN_SPEED = 4.2;
const JUMP_SPEED = 4.4; // ≈ 1 m de altura (alcanza 0,8 m; no 1,2 m)
const ACCEL_TAU = 0.15; // s — rampa suave, sin tirones
const AIR_CONTROL = 0.35;

export type HeadSource = { kind: 'xr' } | { kind: 'external'; q: Quaternion } | { kind: 'mouse' };

/**
 * Jugador: rig (pies + guiñada del cuerpo) → head (altura de ojos) → cámara (orientación de la cabeza).
 * El movimiento es relativo a la dirección en que mira la cabeza.
 */
export class Player {
  readonly rig = new Group();
  readonly head = new Group();
  readonly controller: CharacterController;
  yaw = 0;
  pitch = 0;
  /** Intensidad de viñeta deseada (0–1), antes del ajuste del usuario. */
  comfort = 0;
  /** Se llama si cae fuera del mundo (App lo devuelve al último punto seguro). */
  onFell: () => void = () => {};

  private euler = new Euler(0, 0, 0, 'YXZ');
  private fwd = new Vector3();
  private headBefore = new Vector3();
  private headAfter = new Vector3();

  constructor(readonly camera: PerspectiveCamera, world: CollisionWorld) {
    this.controller = new CharacterController(world);
    this.rig.name = 'player-rig';
    this.rig.add(this.head);
    this.head.add(camera);
  }

  get position(): Vector3 {
    return this.controller.position;
  }

  teleport(pos: Vector3, yawRad: number): void {
    this.controller.position.copy(pos);
    this.controller.velocity.set(0, 0, 0);
    this.controller.grounded = false;
    this.yaw = yawRad;
    this.pitch = 0;
    this.syncRig();
  }

  /** Gira el cuerpo alrededor de la cabeza (en XR la cabeza no está en el eje del rig). */
  private turn(angle: number): void {
    this.camera.getWorldPosition(this.headBefore);
    this.yaw += angle;
    this.rig.rotation.y = this.yaw;
    this.rig.updateMatrixWorld(true);
    this.camera.getWorldPosition(this.headAfter);
    this.controller.position.x += this.headBefore.x - this.headAfter.x;
    this.controller.position.z += this.headBefore.z - this.headAfter.z;
  }

  private syncRig(): void {
    this.rig.position.copy(this.controller.position);
    this.rig.rotation.y = this.yaw;
    this.rig.updateMatrixWorld(true);
  }

  update(dt: number, f: InputFrame, s: Settings, head: HeadSource, frozen: boolean): void {
    this.head.position.y = s.eyeHeight;

    // --- Orientación de la cabeza y giro del cuerpo ---
    if (!frozen) {
      if (head.kind === 'mouse') {
        this.yaw -= f.look.x * s.mouseSensitivity;
        this.pitch = MathUtils.clamp(this.pitch - f.look.y * s.mouseSensitivity, -1.48, 1.48);
      }
      if (s.turnMode === 'snap') {
        if (f.snapTurn !== 0) this.turn(-f.snapTurn * MathUtils.degToRad(s.snapAngleDeg));
      } else if (f.turnAxis !== 0) {
        this.turn(-f.turnAxis * MathUtils.degToRad(s.smoothTurnDegPerSec) * dt);
      }
    }
    if (head.kind === 'mouse') {
      this.euler.set(this.pitch, 0, 0);
      this.camera.quaternion.setFromEuler(this.euler);
      this.camera.position.set(0, 0, 0);
    } else if (head.kind === 'external') {
      this.camera.quaternion.copy(head.q);
      this.camera.position.set(0, 0, 0);
    }
    this.syncRig();

    // --- Movimiento relativo a la mirada ---
    const c = this.controller;
    const fwd = this.camera.getWorldDirection(this.fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    fwd.normalize();
    const mx = frozen ? 0 : f.move.x;
    const my = frozen ? 0 : f.move.y;
    const speed = f.run ? RUN_SPEED : WALK_SPEED;
    // derecha = (-fwd.z, 0, fwd.x)
    const wx = (fwd.x * my - fwd.z * mx) * speed;
    const wz = (fwd.z * my + fwd.x * mx) * speed;
    const k = 1 - Math.exp(-dt / ACCEL_TAU);
    const kk = c.grounded ? k : k * AIR_CONTROL;
    c.velocity.x += (wx - c.velocity.x) * kk;
    c.velocity.z += (wz - c.velocity.z) * kk;

    if (!frozen && f.jump && c.grounded) {
      c.velocity.y = JUMP_SPEED;
      c.grounded = false;
    }

    c.step(dt);
    if (c.position.y < -200) this.onFell();
    this.syncRig();

    // --- Confort: más viñeta cuanto más rápido te desplazas o giras ---
    const hs = Math.hypot(c.velocity.x, c.velocity.z);
    const turning = s.turnMode === 'smooth' && !frozen ? Math.abs(f.turnAxis) : 0;
    this.comfort = Math.min(1, hs / RUN_SPEED + turning * 0.8);
  }
}
