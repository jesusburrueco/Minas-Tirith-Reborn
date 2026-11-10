import { Color, DirectionalLight, FogExp2, HemisphereLight, type Scene, type Vector3 } from 'three';
import type { QualityPreset } from '../app/Quality';
import { SKY_DAY, SKY_DUSK, SKY_NIGHT, type TimeOfDay } from './TimeOfDay';

/**
 * Sol direccional con una sombra que sigue al jugador (fase 1: una cascada),
 * luz hemisférica y niebla exponencial. La fase 2 añade cielo físico, HDRI y niebla por altura.
 */
export class Lighting {
  readonly sun = new DirectionalLight(0xffffff, 3);
  readonly hemi = new HemisphereLight(0xbfd4ee, 0x6b5f48, 1.0);
  readonly fog = new FogExp2(0x9ab8d8, 0.00022);
  private sky = new Color();
  private range = 28;
  private texel = 0.05;

  constructor(scene: Scene) {
    scene.add(this.sun, this.sun.target, this.hemi);
    scene.fog = this.fog;
    scene.background = this.sky;
    const sh = this.sun.shadow;
    sh.bias = -0.0005;
    sh.normalBias = 0.03;
    sh.camera.near = 1;
    sh.camera.far = 400;
  }

  applyQuality(p: QualityPreset): void {
    this.sun.castShadow = p.shadows;
    this.range = p.shadowRange;
    const sh = this.sun.shadow;
    if (sh.mapSize.x !== p.shadowMapSize) {
      sh.mapSize.set(p.shadowMapSize, p.shadowMapSize);
      sh.map?.dispose();
      sh.map = null;
    }
    const cam = sh.camera;
    cam.left = cam.bottom = -this.range;
    cam.right = cam.top = this.range;
    cam.updateProjectionMatrix();
    this.texel = (2 * this.range) / p.shadowMapSize;
  }

  update(time: TimeOfDay, focus: Vector3): void {
    const day = time.daylight;
    const dusk = time.twilight;

    this.sky.copy(SKY_NIGHT).lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.6);
    this.fog.color.copy(this.sky);

    // Sol (o luna tenue de noche, desde la dirección opuesta).
    const dir = time.sunDir;
    const moon = dir.y < 0;
    const lx = moon ? -dir.x : dir.x, ly = moon ? -dir.y : dir.y, lz = moon ? -dir.z : dir.z;
    this.sun.intensity = moon ? 0.4 : 3.2 * day;
    this.sun.color.setRGB(1, 0.95 - dusk * 0.3, 0.88 - dusk * 0.5);
    if (moon) this.sun.color.setRGB(0.6, 0.7, 1.0);
    // Con luces físicas la hemisférica rinde ~1/π en difuso: hace falta más intensidad.
    this.hemi.intensity = 0.7 + 2.3 * day;
    this.hemi.color.copy(this.sky);

    // Encuadre de la sombra alrededor del jugador, ajustado a la rejilla de texels (sin parpadeo).
    const t = this.texel;
    const fx = Math.round(focus.x / t) * t;
    const fz = Math.round(focus.z / t) * t;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + lx * 150, focus.y + Math.max(ly, 0.05) * 150, fz + lz * 150);
  }
}
