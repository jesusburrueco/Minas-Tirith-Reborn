import { BoxGeometry, BufferAttribute, Color, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const m = new Matrix4();
const q = new Quaternion();
const e = new Euler();

/** Caja colocada en mundo, con color por vértice (para fusionar muchas en una draw call). */
export function box(
  w: number, h: number, d: number,
  pos: Vector3 | [number, number, number],
  opts: { rotX?: number; rotY?: number; rotZ?: number; color?: Color | number } = {},
): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  const p = Array.isArray(pos) ? new Vector3(...pos) : pos;
  e.set(opts.rotX ?? 0, opts.rotY ?? 0, opts.rotZ ?? 0);
  m.compose(p, q.setFromEuler(e), new Vector3(1, 1, 1));
  g.applyMatrix4(m);
  // UV en metros reales (aprox.) para que las texturas no se estiren.
  scaleUvsByBox(g, w, h, d);
  if (opts.color !== undefined) paint(g, opts.color);
  return g;
}

function scaleUvsByBox(g: BufferGeometry, w: number, h: number, d: number): void {
  const uv = g.getAttribute('uv') as BufferAttribute;
  // BoxGeometry: 6 caras × 4 vértices, en orden +x −x +y −y +z −z.
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
}

export function paint(g: BufferGeometry, color: Color | number): BufferGeometry {
  const c = color instanceof Color ? color : new Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(arr, i * 3);
  g.setAttribute('color', new BufferAttribute(arr, 3));
  return g;
}

export function merge(geoms: BufferGeometry[]): BufferGeometry {
  const out = mergeGeometries(geoms, false);
  if (!out) throw new Error('mergeGeometries falló (atributos incompatibles)');
  for (const g of geoms) g.dispose();
  return out;
}

/** Copia solo posiciones (para colisionadores: más ligeros que la malla visual). */
export function positionsOnly(g: BufferGeometry): BufferGeometry {
  const c = g.clone();
  for (const name of Object.keys(c.attributes)) if (name !== 'position') c.deleteAttribute(name);
  return c;
}
