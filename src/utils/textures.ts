import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type WebGLRenderer } from 'three';

/**
 * Textura de rejilla procedural (1 m por celda), útil en la fase 1 para percibir
 * el movimiento y la escala. Se sustituye por los materiales PBR en la fase 2.
 */
export function gridTexture(renderer: WebGLRenderer, base = '#8d8a7c', line = '#6f6c60', cells = 4): CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  // ruido suave para romper la uniformidad
  for (let i = 0; i < 1400; i++) {
    const v = Math.random() * 30 - 15;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
    g.fillRect(Math.random() * size, Math.random() * size, 3, 3);
  }
  g.strokeStyle = line;
  const step = size / cells;
  for (let i = 0; i <= cells; i++) {
    g.lineWidth = i % cells === 0 ? 4 : 1.5;
    g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * step); g.lineTo(size, i * step); g.stroke();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // cells celdas por textura → repetición 1/cells por metro
  t.repeat.set(1 / cells, 1 / cells);
  return t;
}
