import {
  DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace,
  type Texture, type WebGLRenderer,
} from 'three';
import { addPatch } from '../sky/atmosphere';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { assetUrl, BASIS_TRANSCODER_PATH } from '../utils/assets';

/**
 * Material estándar con las texturas empaquetadas del proyecto: normal en RG (z se
 * reconstruye) y rugosidad en B. Las UV de la geometría van en metros / `tile`.
 */
export function pbrMaterial(maps: MaterialMaps, opts: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ map: maps.albedo, normalMap: maps.nrm, roughnessMap: maps.nrm, metalness: 0, ...opts });
  return addPatch(mat, 'packed-nrm', (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        'vec2 nxy = texture2D( normalMap, vNormalMapUv ).xy * 2.0 - 1.0;\n\tvec3 mapN = vec3( nxy, sqrt( max( 0.0, 1.0 - dot( nxy, nxy ) ) ) );',
      )
      .replace('roughnessFactor *= texelRoughness.g;', 'roughnessFactor *= texelRoughness.b;');
  });
}

export interface MaterialMaps {
  albedo: Texture;
  /** R,G = normal (OpenGL), B = rugosidad. */
  nrm: Texture;
}

/** Carga las texturas KTX2 de public/assets/textures (con relleno neutro si fallan). */
export class TextureLibrary {
  private loader: KTX2Loader;
  private cache = new Map<string, MaterialMaps>();
  private anisotropy: number;

  constructor(renderer: WebGLRenderer) {
    this.loader = new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_PATH).detectSupport(renderer);
    this.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  }

  private prep(t: Texture, srgb: boolean): Texture {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    t.anisotropy = this.anisotropy;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.needsUpdate = true;
    return t;
  }

  private async one(file: string, srgb: boolean, fallback: [number, number, number, number]): Promise<Texture> {
    try {
      return this.prep(await this.loader.loadAsync(assetUrl(`textures/${file}`)), srgb);
    } catch (e) {
      console.warn(`No se pudo cargar ${file}; se usa un color neutro.`, e);
      const t = new DataTexture(new Uint8Array(fallback), 1, 1);
      t.needsUpdate = true;
      return this.prep(t, srgb);
    }
  }

  async load(id: string): Promise<MaterialMaps> {
    const hit = this.cache.get(id);
    if (hit) return hit;
    const [albedo, nrm] = await Promise.all([
      this.one(`${id}_albedo.ktx2`, true, [128, 128, 128, 255]),
      this.one(`${id}_nrm.ktx2`, false, [128, 128, 200, 255]),
    ]);
    const m = { albedo, nrm };
    this.cache.set(id, m);
    return m;
  }

  dispose(): void {
    this.loader.dispose();
  }
}
