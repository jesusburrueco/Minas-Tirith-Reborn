import {
  BoxGeometry, Color, Group, MathUtils, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry, type Texture,
} from 'three';
import type { CollisionWorld } from '../physics/CollisionWorld';
import { box, merge, positionsOnly } from '../utils/geometry';
import type { InteractionSystem } from './Interactables';
import { TEST_ZONE } from './layout';

export interface TestCourseDeps {
  collision: CollisionWorld;
  interactions: InteractionSystem;
  gridMap: Texture;
  showText: (title: string, body: string) => void;
}

const STONE = new Color(0xd9d3c4);
const GREEN = new Color(0x8fbf7a);
const YELLOW = new Color(0xe0c46a);
const RED = new Color(0xd07a6a);
const BLUE = new Color(0x8aa6cf);

const SIGN_TEXT =
  'Zona de pruebas de la fase 1.\n' +
  '• Rampas: verde 20° y amarilla 35° (se suben); roja 55° (no se puede).\n' +
  '• Escalera de 12 peldaños con rellano.\n' +
  '• Cajas de 0,4 / 0,8 / 1,2 m: salta con X (las dos primeras se alcanzan).\n' +
  '• Pasillo estrecho de 1 m y una casa con puerta (Círculo para abrir).\n' +
  'Los muros no se pueden atravesar.';

/** Circuito para validar movimiento, colisiones, escaleras, salto e interacción. */
export class TestCourse {
  readonly group = new Group();
  private door = new Group();
  private doorAngle = 0;
  private doorTarget = 0;

  constructor(deps: TestCourseDeps) {
    const O = TEST_ZONE;
    const vis: BufferGeometry[] = [];
    const col: BufferGeometry[] = [];
    const add = (g: BufferGeometry, collide = true) => {
      vis.push(g);
      if (collide) col.push(positionsOnly(g));
    };
    const at = (x: number, y: number, z: number) => new Vector3(O.x + x, O.y + y, O.z + z);

    // --- Rampas (suben hacia el norte, −Z) con plataforma arriba ---
    const ramp = (x: number, deg: number, color: Color, platform: boolean) => {
      const L = 6, W = 3, T = 0.3, a = MathUtils.degToRad(deg);
      const top = L * Math.sin(a);
      add(box(W, T, L, at(x, (L / 2) * Math.sin(a) - (T / 2) * Math.cos(a), -(L / 2) * Math.cos(a)), { rotX: a, color }));
      if (platform) add(box(W, top, 3, at(x, top / 2, -L * Math.cos(a) - 1.5 + 0.05), { color: STONE }));
    };
    ramp(-12, 20, GREEN, true);
    ramp(-7.5, 35, YELLOW, true);
    ramp(-3, 55, RED, false);

    // --- Escalera: peldaños macizos (visuales y colisión) + rampa invisible sobre las narices ---
    {
      const n = 12, rise = 0.18, run = 0.3, W = 2.4, x = 3;
      for (let i = 1; i <= n; i++) {
        const h = i * rise;
        add(box(W, h, run, at(x, h / 2, -(i - 0.5) * run), { color: i % 2 ? STONE : BLUE }));
      }
      const H = n * rise;
      add(box(W, H, 3, at(x, H / 2, -n * run - 1.5), { color: STONE })); // rellano
      // Rampa de colisión: de (z=+run, y=0) a (z=−(n−1)·run, y=H)
      const z0 = run, z1 = -(n - 1) * run;
      const len = Math.hypot(H, z0 - z1);
      const a = Math.atan2(H, z0 - z1);
      const T = 0.1;
      const mid = at(x, H / 2 - (T / 2) * Math.cos(a), (z0 + z1) / 2 - (T / 2) * Math.sin(a));
      col.push(positionsOnly(box(W, T, len, mid, { rotX: a })));
    }

    // --- Cajas para saltar ---
    [0.4, 0.8, 1.2].forEach((h, i) => add(box(1.5, h, 1.5, at(8 + i * 2.2, h / 2, -2), { color: i === 2 ? RED : GREEN })));

    // --- Pasillo estrecho (1 m libre) ---
    add(box(0.3, 2.5, 8, at(15.35, 1.25, -4), { color: STONE }));
    add(box(0.3, 2.5, 8, at(16.65, 1.25, -4), { color: STONE }));

    // --- Casa con puerta (6×6 m, puerta al sur) ---
    {
      const cx = -2, cz = -20, s = 6, h = 3, t = 0.3, dw = 1.2, dh = 2.2;
      add(box(s, h, t, at(cx, h / 2, cz - s / 2), { color: STONE })); // norte
      add(box(t, h, s, at(cx - s / 2, h / 2, cz), { color: STONE })); // oeste
      add(box(t, h, s, at(cx + s / 2, h / 2, cz), { color: STONE })); // este
      const side = (s - dw) / 2;
      add(box(side, h, t, at(cx - dw / 2 - side / 2, h / 2, cz + s / 2), { color: STONE })); // sur izq.
      add(box(side, h, t, at(cx + dw / 2 + side / 2, h / 2, cz + s / 2), { color: STONE })); // sur dcha.
      add(box(dw, h - dh, t, at(cx, dh + (h - dh) / 2, cz + s / 2), { color: STONE })); // dintel
      add(box(s + 0.6, 0.25, s + 0.6, at(cx, h + 0.125, cz), { color: BLUE })); // tejado plano

      // Puerta: pivote en la jamba oeste.
      const doorGeom = new BoxGeometry(dw - 0.04, dh - 0.02, 0.08);
      doorGeom.translate((dw - 0.04) / 2, (dh - 0.02) / 2, 0);
      const doorMat = new MeshStandardMaterial({ color: 0x7a5636, roughness: 0.8 });
      const doorMesh = new Mesh(doorGeom, doorMat);
      doorMesh.castShadow = doorMesh.receiveShadow = true;
      this.door.add(doorMesh);
      this.door.position.copy(at(cx - dw / 2 + 0.02, 0, cz + s / 2));
      this.group.add(this.door);
      this.door.updateMatrixWorld(true);
      deps.collision.addDynamic(positionsOnly(doorGeom), this.door);
      const doorCenter = at(cx, 1.2, cz + s / 2);
      deps.interactions.add({
        position: doorCenter,
        radius: 2.6,
        prompt: () => (this.doorTarget === 0 ? 'Abrir puerta' : 'Cerrar puerta'),
        interact: () => (this.doorTarget = this.doorTarget === 0 ? MathUtils.degToRad(105) : 0), // abre hacia dentro
      });
    }

    // --- Cartel ---
    {
      add(box(0.12, 1.4, 0.12, at(0, 0.7, 6), { color: 0x6b4f33 }));
      add(box(1.4, 0.8, 0.06, at(0, 1.6, 6.05), { color: 0xc9b48a }), false);
      deps.interactions.add({
        position: at(0, 1.6, 6.05),
        radius: 3,
        prompt: () => 'Leer cartel',
        interact: () => deps.showText('Zona de pruebas', SIGN_TEXT),
      });
    }

    const mat = new MeshStandardMaterial({ vertexColors: true, map: deps.gridMap, roughness: 0.92 });
    const mesh = new Mesh(merge(vis), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = 'test-course';
    this.group.add(mesh);
    deps.collision.addStatic(merge(col));
  }

  update(dt: number): void {
    if (this.doorAngle !== this.doorTarget) {
      const k = 1 - Math.exp(-dt / 0.25);
      this.doorAngle += (this.doorTarget - this.doorAngle) * k;
      if (Math.abs(this.doorTarget - this.doorAngle) < 0.002) this.doorAngle = this.doorTarget;
      this.door.rotation.y = this.doorAngle;
      this.door.updateMatrixWorld(true);
    }
  }
}
