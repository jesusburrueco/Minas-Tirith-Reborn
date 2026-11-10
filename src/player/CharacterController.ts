import { Vector3 } from 'three';
import { WALKABLE_NORMAL_Y, type CollisionWorld } from '../physics/CollisionWorld';

const GRAVITY = -9.81;
const MAX_SUBSTEP = 1 / 120;
/** Altura que el jugador "pega" al suelo al bajar escalones o rampas. */
const STEP_DOWN = 0.4;

/**
 * Cápsula cinemática (pies en `position`). Gravedad, empuje fuera de las mallas,
 * adhesión al suelo al bajar y anulación de la velocidad contra muros y techos.
 */
export class CharacterController {
  readonly radius = 0.3;
  readonly height = 1.75;
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  grounded = false;

  private target = new Vector3();
  private start = new Vector3();
  private end = new Vector3();
  private delta = new Vector3();

  constructor(private world: CollisionWorld) {}

  step(dt: number): void {
    const n = Math.min(6, Math.max(1, Math.ceil(dt / MAX_SUBSTEP)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h);
  }

  private substep(h: number): void {
    const { radius: r, height, velocity: v, world } = this;
    const wasGrounded = this.grounded;
    v.y += GRAVITY * h;

    this.target.copy(this.position).addScaledVector(v, h);
    this.start.copy(this.target).y += r;
    this.end.copy(this.target).y += height - r;
    world.resolveCapsule(this.start, this.end, r);

    const resolved = this.start;
    resolved.y -= r;
    this.delta.subVectors(resolved, this.target);

    let th = world.heightAt(resolved.x, resolved.z);
    // Laderas demasiado empinadas (> ~50°): no se puede subir por ellas.
    const stepXZ = Math.hypot(resolved.x - this.position.x, resolved.z - this.position.z);
    if (stepXZ > 1e-5 && resolved.y < th) {
      const thOld = world.heightAt(this.position.x, this.position.z);
      if (th - thOld > stepXZ * 1.19 + 0.002) {
        resolved.x = this.position.x;
        resolved.z = this.position.z;
        v.x = v.z = 0;
        th = thOld;
      }
    }
    if (resolved.y < th) {
      this.delta.y += th - resolved.y;
      resolved.y = th;
    }
    let grounded = this.delta.y > 1e-5;

    if (!grounded && wasGrounded && v.y <= 0) {
      const hit = world.groundBelow(resolved.x, resolved.y + 0.05, resolved.z, STEP_DOWN);
      if (hit && hit.normalY >= WALKABLE_NORMAL_Y) {
        resolved.y = hit.y;
        grounded = true;
      }
    }

    if (grounded && v.y < 0) v.y = 0;
    if (this.delta.y < -1e-5 && v.y > 0) v.y = 0; // cabeza contra un techo

    // Quita la componente de la velocidad que va contra el muro.
    const dx = this.delta.x, dz = this.delta.z;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-6) {
      const nx = dx / dl, nz = dz / dl;
      const vn = v.x * nx + v.z * nz;
      if (vn < 0) {
        v.x -= nx * vn;
        v.z -= nz * vn;
      }
    }

    this.grounded = grounded;
    this.position.copy(resolved);
  }
}
