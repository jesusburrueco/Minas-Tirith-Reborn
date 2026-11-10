import {
  CylinderGeometry, Mesh, MeshStandardMaterial, Vector3, type Camera, type Material, type Object3D, type Scene,
  type WebGLRenderer,
} from 'three';
import type { QualityPreset } from '../app/Quality';
import { Motes } from '../fx/Motes';
import { CollisionWorld } from '../physics/CollisionWorld';
import { TextureLibrary } from '../render/Textures';
import { installAtmosphereChunks, withAtmosphere } from '../sky/atmosphere';
import { Sky } from '../sky/Sky';
import { TimeOfDay } from '../sky/TimeOfDay';
import { merge, paint } from '../utils/geometry';
import { createNoiseTexture } from '../utils/noiseTexture';
import { gridTexture } from '../utils/textures';
import { Grass } from '../vegetation/Grass';
import { Trees } from '../vegetation/Trees';
import { buildOsgiliath } from './Distant';
import { Farms } from './Farms';
import { testZoneHeight } from './geo';
import { InteractionSystem } from './Interactables';
import { CITY_CENTER, FIRST_WALL_RADIUS, TEST_ZONE } from './layout';
import { Rammas } from './Rammas';
import { TerrainData } from './terrain/TerrainData';
import { TerrainMesh } from './terrain/TerrainMesh';
import { TestCourse } from './TestCourse';
import { Water } from './Water';

export interface WorldDeps {
  scene: Scene;
  renderer: WebGLRenderer;
  camera: Camera;
  showText: (title: string, body: string) => void;
}

export type Progress = (fraction: number, label: string) => void;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Fase 2: el Pelennor. Terreno (CDLOD), cielo y atmósfera, agua, hierba, árboles,
 * granjas, el Rammas Echor y Osgiliath a lo lejos. La ciudad sigue siendo una maqueta
 * provisional (fase 3).
 */
export class World {
  readonly collision = new CollisionWorld();
  readonly interactions = new InteractionSystem();
  readonly time = new TimeOfDay();
  sky!: Sky;
  terrainData!: TerrainData;
  private terrain!: TerrainMesh;
  private grass!: Grass;
  private trees!: Trees;
  private rammas!: Rammas;
  private farms!: Farms;
  private motes!: Motes;
  private course!: TestCourse;
  private camPos = new Vector3();
  stats = { trees: 0, farms: 0 };

  private constructor() {}

  static async build(deps: WorldDeps, progress: Progress): Promise<World> {
    installAtmosphereChunks();
    const w = new World();
    const { scene, renderer } = deps;

    const lib = new TextureLibrary(renderer);
    const ids = ['grass', 'soil', 'dirt', 'rock', 'road', 'bark', 'wall', 'plaster', 'roof'] as const;
    const texPromise = Promise.all(ids.map((id) => lib.load(id)));

    progress(0.02, 'Levantando el Mindolluin y las Ephel Dúath…');
    w.terrainData = await TerrainData.generate((f) => progress(0.02 + f * 0.53, 'Modelando el terreno del Pelennor…'));
    w.collision.heightAt = (x, z) => w.terrainData.heightAt(x, z);

    progress(0.58, 'Cargando texturas…');
    const [grass, soil, dirt, rock, road, bark, wall, plaster, roof] = await texPromise;
    const noise = createNoiseTexture();

    progress(0.64, 'Encendiendo el cielo…');
    await nextFrame();
    w.sky = new Sky(scene, renderer, noise);
    w.terrain = new TerrainMesh(w.terrainData, { grass, soil, dirt, rock, road, noise });
    scene.add(w.terrain.mesh);
    scene.add(new Water(w.terrainData).mesh);

    progress(0.7, 'Sembrando los campos…');
    await nextFrame();
    w.grass = new Grass(w.terrainData);
    scene.add(w.grass.mesh);
    w.trees = new Trees(renderer, w.terrainData, bark.albedo);
    scene.add(w.trees.group);
    const trunks = w.trees.trunkColliders();
    if (trunks) w.collision.addStatic(trunks);

    progress(0.8, 'Construyendo granjas y el Rammas Echor…');
    await nextFrame();
    const farms = new Farms(w.terrainData, { plaster, roof, bark });
    w.farms = farms;
    scene.add(farms.group);
    if (farms.colliders.length) w.collision.addStatic(merge(farms.colliders));
    w.rammas = new Rammas(w.terrainData, wall);
    scene.add(w.rammas.group);
    w.collision.addStatic(w.rammas.collider);
    scene.add(buildOsgiliath(w.terrainData, wall));
    w.stats = { trees: w.trees.count, farms: farms.count };

    progress(0.88, 'Zona de pruebas y maqueta de la ciudad…');
    await nextFrame();
    TEST_ZONE.y = testZoneHeight();
    w.course = new TestCourse({
      collision: w.collision,
      interactions: w.interactions,
      gridMap: gridTexture(renderer, '#cfc8b6', '#a59d89'),
      showText: deps.showText,
    });
    scene.add(w.course.group);
    scene.add(w.buildCityPlaceholder());
    atmosphereFor(w.course.group);

    w.motes = new Motes();
    scene.add(w.motes.points);

    progress(0.94, 'Compilando sombreadores…');
    await nextFrame();
    w.update(0, 0, deps.camera, new Vector3(TEST_ZONE.x, 0, 0), false);
    renderer.compile(scene, deps.camera);
    progress(1, 'Listo');
    return w;
  }

  /** Maqueta provisional: 7 niveles + torre, apoyada en la falda del Mindolluin. La fase 3 la sustituye. */
  private buildCityPlaceholder(): Mesh {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const r = FIRST_WALL_RADIUS - i * 55;
      const c = new CylinderGeometry(r, r, 30, 64, 1);
      c.translate(CITY_CENTER.x - i * 12, 15 + i * 30, CITY_CENTER.z);
      parts.push(paint(c, 0xe9e5da));
    }
    const tower = new CylinderGeometry(7, 9, 90, 16);
    tower.translate(CITY_CENTER.x - 7 * 12 + 20, 210 + 45, 0);
    parts.push(paint(tower, 0xf4f1ea));
    for (const p of parts) p.deleteAttribute('uv');
    const city = new Mesh(merge(parts), withAtmosphere(new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));
    city.castShadow = city.receiveShadow = true;
    city.name = 'city-placeholder';
    return city;
  }

  applyQuality(p: QualityPreset): void {
    this.sky.applyQuality(p);
    this.terrain.applyQuality(p);
    this.grass.applyQuality(p);
    this.trees.applyQuality(p);
  }

  update(dt: number, timeAxis: number, camera: Camera, focus: Vector3, scrubbing: boolean): void {
    this.time.update(dt, timeAxis);
    camera.getWorldPosition(this.camPos);
    this.sky.update(dt, this.time, focus, scrubbing);
    this.terrain.update(camera);
    this.grass.update(camera);
    this.trees.update(dt, this.camPos);
    this.rammas.update(dt, this.camPos);
    this.farms.update(dt, this.camPos);
    this.motes.update(this.camPos);
    this.course.update(dt);
  }

  get terrainNodes(): number {
    return this.terrain.nodeCount;
  }
}

/** Aplica la niebla atmosférica a los materiales estándar de un grupo ya construido. */
function atmosphereFor(root: Object3D): void {
  root.traverse((o) => {
    const m = (o as Mesh).material as Material | Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) if ((mat as MeshStandardMaterial).isMeshStandardMaterial) withAtmosphere(mat);
  });
}
