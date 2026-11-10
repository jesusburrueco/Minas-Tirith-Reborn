import {
  type Camera, ConeGeometry, CylinderGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, type Scene, type Vector3, type WebGLRenderer,
} from 'three';
import type { QualityPreset } from '../app/Quality';
import { CollisionWorld } from '../physics/CollisionWorld';
import { Lighting } from '../sky/Lighting';
import { TimeOfDay } from '../sky/TimeOfDay';
import { merge, paint } from '../utils/geometry';
import { gridTexture } from '../utils/textures';
import { InteractionSystem } from './Interactables';
import { CITY_CENTER, FIRST_WALL_RADIUS } from './layout';
import { TestCourse } from './TestCourse';

export interface WorldDeps {
  scene: Scene;
  renderer: WebGLRenderer;
  camera: Camera;
  showText: (title: string, body: string) => void;
}

export type Progress = (fraction: number, label: string) => void;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Mundo de la fase 1: llanura plana con rejilla, zona de pruebas y una maqueta
 * de referencia de la ciudad (para comprobar orientación y escala desde el inicio).
 */
export class World {
  readonly collision = new CollisionWorld();
  readonly interactions = new InteractionSystem();
  readonly time = new TimeOfDay();
  readonly lighting: Lighting;
  private course!: TestCourse;

  private constructor(private deps: WorldDeps) {
    this.lighting = new Lighting(deps.scene);
  }

  static async build(deps: WorldDeps, progress: Progress): Promise<World> {
    const w = new World(deps);
    progress(0.1, 'Preparando el terreno…');
    await nextFrame();
    w.buildGround();
    progress(0.35, 'Levantando la zona de pruebas…');
    await nextFrame();
    w.course = new TestCourse({
      collision: w.collision,
      interactions: w.interactions,
      gridMap: gridTexture(deps.renderer, '#cfc8b6', '#a59d89'),
      showText: deps.showText,
    });
    deps.scene.add(w.course.group);
    progress(0.65, 'Trazando la silueta de Minas Tirith…');
    await nextFrame();
    w.buildCityPlaceholder();
    progress(0.9, 'Compilando sombreadores…');
    await nextFrame();
    deps.renderer.compile(deps.scene, deps.camera);
    progress(1, 'Listo');
    return w;
  }

  private buildGround(): void {
    const size = 12000;
    const g = new PlaneGeometry(size, size, 1, 1);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size, uv.getY(i) * size);
    const map = gridTexture(this.deps.renderer);
    const ground = new Mesh(g, new MeshStandardMaterial({ map, roughness: 1 }));
    ground.receiveShadow = true;
    ground.position.set(CITY_CENTER.x + 1500, 0, 0);
    ground.name = 'ground';
    this.deps.scene.add(ground);
    this.collision.heightAt = () => 0;
  }

  /** Maqueta provisional: 7 niveles de 30 m + torre, y la falda del Mindolluin detrás. Fase 3 la sustituye. */
  private buildCityPlaceholder(): void {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const r = FIRST_WALL_RADIUS - i * 55;
      const c = new CylinderGeometry(r, r, 30, 48, 1);
      c.translate(CITY_CENTER.x - i * 12, 15 + i * 30, CITY_CENTER.z);
      parts.push(paint(c, 0xe9e5da));
    }
    const tower = new CylinderGeometry(7, 9, 90, 16);
    tower.translate(CITY_CENTER.x - 7 * 12 + 20, 210 + 45, 0);
    parts.push(paint(tower, 0xf4f1ea));
    for (const p of parts) p.deleteAttribute('uv');
    const city = new Mesh(merge(parts), new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    city.castShadow = city.receiveShadow = true;
    city.name = 'city-placeholder';

    const mountain = new Mesh(
      new ConeGeometry(2600, 2400, 24, 1),
      new MeshStandardMaterial({ color: 0x6e6a63, roughness: 1, flatShading: true }),
    );
    mountain.position.set(CITY_CENTER.x - 1900, 1200 - 300, 0);
    mountain.name = 'mindolluin-placeholder';
    this.deps.scene.add(city, mountain);
  }

  applyQuality(p: QualityPreset): void {
    this.lighting.applyQuality(p);
  }

  update(dt: number, timeAxis: number, focus: Vector3): void {
    this.time.update(dt, timeAxis);
    this.lighting.update(this.time, focus);
    this.course.update(dt);
  }
}
