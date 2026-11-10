import { BufferAttribute, Color, Mesh } from 'three';
import { pbrMaterial, type MaterialMaps } from '../render/Textures';
import { withAtmosphere } from '../sky/atmosphere';
import { box, merge, paint } from '../utils/geometry';
import { hash2, riverX } from './geo';
import type { TerrainData } from './terrain/TerrainData';

/**
 * Osgiliath en ruinas, a ambos lados del Anduin al nordeste, con el puente roto.
 * Solo se ve a lo lejos: geometría sencilla fusionada en una malla.
 */
export function buildOsgiliath(terrain: TerrainData, maps: MaterialMaps): Mesh {
  const parts = [];
  const cz = -4000;
  const rx = riverX(cz);
  const stone = new Color(0.62, 0.6, 0.57);
  for (let i = 0; i < 170; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = rx + side * (220 + hash2(i, 1, 801) * 650);
    const z = cz + (hash2(i, 2, 801) - 0.5) * 1300;
    const w = 8 + hash2(i, 3, 801) * 22, d = 8 + hash2(i, 4, 801) * 20;
    const tall = hash2(i, 5, 801) > 0.9;
    const h = tall ? 25 + hash2(i, 6, 801) * 30 : 4 + hash2(i, 7, 801) * 14;
    const g = terrain.heightAt(x, z);
    const b = box(tall ? 9 : w, h, tall ? 9 : d, [x, g + h / 2 - 1.5, z], { rotY: hash2(i, 8, 801) * 0.6 - 0.3 });
    // remate irregular: hunde algunos vértices superiores (aspecto derruido)
    const p = b.getAttribute('position') as BufferAttribute;
    for (let v = 0; v < p.count; v++) if (p.getY(v) > g + h / 2) p.setY(v, p.getY(v) - hash2(i, v, 802) * h * 0.45);
    b.computeVertexNormals();
    const tint = stone.clone().multiplyScalar(0.8 + hash2(i, 9, 801) * 0.3);
    parts.push(paint(b, tint));
  }
  // Pilares del puente roto sobre el río
  for (let k = -4; k <= 4; k++) {
    if (k === 0 || k === 1) continue; // el vano central caído
    const x = rx + k * 42;
    parts.push(paint(box(9, 30, 14, [x, -30 + 15, cz]), stone));
    if (k !== -1 && k !== 2) parts.push(paint(box(42, 3, 12, [x + 21, 0, cz]), stone));
  }
  for (const p of parts) {
    const uv = p.getAttribute('uv') as BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
  }
  const mesh = new Mesh(merge(parts), withAtmosphere(pbrMaterial(maps, { vertexColors: true, roughness: 1 })));
  mesh.name = 'osgiliath';
  return mesh;
}
