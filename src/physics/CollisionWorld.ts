import { Box3, BufferGeometry, DoubleSide, Line3, Matrix4, Ray, Vector3, type Object3D } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/** Pendiente máxima caminable: normal.y ≥ cos(50°). */
export const WALKABLE_NORMAL_Y = Math.cos((50 * Math.PI) / 180);

interface Collider {
  bvh: MeshBVH;
  /** Objeto que lo mueve (puertas). null = geometría estática en espacio mundo. */
  object: Object3D | null;
  enabled: boolean;
}

export interface GroundHit {
  y: number;
  normalY: number;
}

/**
 * Colisión del jugador: un campo de alturas analítico (terreno) + mallas con BVH
 * (muros, escaleras como rampas invisibles, edificios). Sin motor de físicas.
 */
export class CollisionWorld {
  private colliders: Collider[] = [];
  heightAt: (x: number, z: number) => number = () => 0;

  private inv = new Matrix4();
  private seg = new Line3();
  private box = new Box3();
  private triPoint = new Vector3();
  private capPoint = new Vector3();
  private dir = new Vector3();
  private ray = new Ray();

  /** Geometría estática ya en coordenadas de mundo. */
  addStatic(geometry: BufferGeometry): MeshBVH {
    const bvh = new MeshBVH(geometry);
    this.colliders.push({ bvh, object: null, enabled: true });
    return bvh;
  }

  /** Geometría local de un objeto móvil; sigue su matrixWorld. Devuelve un interruptor. */
  addDynamic(geometry: BufferGeometry, object: Object3D): { setEnabled: (v: boolean) => void } {
    const c: Collider = { bvh: new MeshBVH(geometry), object, enabled: true };
    this.colliders.push(c);
    return { setEnabled: (v) => (c.enabled = v) };
  }

  /**
   * Empuja una cápsula (segmento start→end, radio r) fuera de todas las mallas.
   * Las superficies caminables empujan en vertical para no resbalar en rampas.
   */
  resolveCapsule(start: Vector3, end: Vector3, radius: number): void {
    for (const c of this.colliders) {
      if (!c.enabled) continue;
      const seg = this.seg;
      seg.start.copy(start);
      seg.end.copy(end);
      if (c.object) {
        this.inv.copy(c.object.matrixWorld).invert();
        seg.start.applyMatrix4(this.inv);
        seg.end.applyMatrix4(this.inv);
      }
      const box = this.box.makeEmpty();
      box.expandByPoint(seg.start).expandByPoint(seg.end);
      box.min.addScalar(-radius);
      box.max.addScalar(radius);
      const local = !!c.object;
      c.bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(box),
        intersectsTriangle: (tri) => {
          const dist = tri.closestPointToSegment(seg, this.triPoint, this.capPoint);
          if (dist >= radius) return false;
          const depth = radius - dist;
          const d = this.dir.subVectors(this.capPoint, this.triPoint);
          if (d.lengthSq() < 1e-12) tri.getNormal(d);
          d.normalize();
          // En mallas locales (puertas, que solo rotan en Y) la vertical coincide.
          if (d.y > WALKABLE_NORMAL_Y) {
            const lift = Math.min(depth / d.y, radius);
            seg.start.y += lift;
            seg.end.y += lift;
          } else if (d.y > 0) {
            // Pendiente demasiado empinada: se comporta como un muro (empuje solo horizontal),
            // si no, la componente vertical del empuje permitiría "trepar" poco a poco.
            const hl = Math.hypot(d.x, d.z);
            if (hl > 1e-6) {
              const push = Math.min(depth / hl, radius);
              seg.start.x += (d.x / hl) * push; seg.start.z += (d.z / hl) * push;
              seg.end.x += (d.x / hl) * push; seg.end.z += (d.z / hl) * push;
            }
          } else {
            seg.start.addScaledVector(d, depth);
            seg.end.addScaledVector(d, depth);
          }
          return false;
        },
      });
      if (local) {
        seg.start.applyMatrix4(c.object!.matrixWorld);
        seg.end.applyMatrix4(c.object!.matrixWorld);
      }
      start.copy(seg.start);
      end.copy(seg.end);
    }
  }

  /** Suelo bajo un punto (terreno o mallas), buscando hacia abajo hasta maxDown. */
  groundBelow(x: number, y: number, z: number, maxDown: number): GroundHit | null {
    let best: GroundHit | null = null;
    const th = this.heightAt(x, z);
    if (y - th <= maxDown && y >= th - 0.05) best = { y: th, normalY: 1 };
    for (const c of this.colliders) {
      if (!c.enabled || c.object) continue;
      this.ray.origin.set(x, y, z);
      this.ray.direction.set(0, -1, 0);
      const hit = c.bvh.raycastFirst(this.ray, DoubleSide);
      if (!hit || hit.distance > maxDown) continue;
      if (!best || hit.point.y > best.y) best = { y: hit.point.y, normalY: Math.abs(hit.face?.normal.y ?? 1) };
    }
    return best;
  }
}
