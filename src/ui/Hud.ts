import { CanvasTexture, LinearFilter, SRGBColorSpace, ShaderMaterial } from 'three';
import { clipSpaceMesh, UI_UNIFORMS } from '../render/ScreenOverlay';

const W = 1024;
const H = 512;

/**
 * HUD fijado a la vista (estadísticas, avisos, indicaciones, textos de carteles).
 * Se pinta en un canvas que solo se redibuja cuando cambia algo.
 */
export class Hud {
  readonly mesh;
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private dirty = true;

  stats = '';
  /** Oculta el HUD (p. ej. con el menú abierto), salvo los avisos breves. */
  suppressed = false;
  private wasSuppressed = false;
  prompt = '';
  private toast = '';
  private toastUntil = 0;
  private persistent = '';
  private readingTitle = '';
  private readingBody = '';

  constructor() {
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = LinearFilter;
    const mat = new ShaderMaterial({
      uniforms: { map: { value: this.tex }, uHalfHeight: { value: 0.5 }, uCanvasAspect: { value: W / H }, ...UI_UNIFORMS },
      vertexShader: /* glsl */ `
        uniform float uHalfHeight, uCanvasAspect;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
          vec2 p = position.xy;            // -1..1
          p.y *= uHalfHeight;
          p.x *= min(uHalfHeight * uCanvasAspect / aspect, 0.98);
          gl_Position = vec4(p, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float uUiGain;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(map, vUv);
          if (c.a < 0.01) discard;
          gl_FragColor = vec4(c.rgb * uUiGain, c.a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = clipSpaceMesh(mat, 1001);
  }

  get reading(): boolean {
    return this.readingBody !== '';
  }

  showToast(text: string, seconds = 3): void {
    this.toast = text;
    this.toastUntil = performance.now() + seconds * 1000;
    this.dirty = true;
  }

  /** Aviso fijo (p. ej. "Conecta un mando") hasta que se borre con ''. */
  setPersistent(text: string): void {
    if (text === this.persistent) return;
    this.persistent = text;
    this.dirty = true;
  }

  showReading(title: string, body: string): void {
    this.readingTitle = title;
    this.readingBody = body;
    this.dirty = true;
  }

  hideReading(): void {
    if (!this.reading) return;
    this.readingTitle = this.readingBody = '';
    this.dirty = true;
  }

  setStats(s: string): void {
    if (s !== this.stats) {
      this.stats = s;
      this.dirty = true;
    }
  }

  setPrompt(s: string): void {
    if (s !== this.prompt) {
      this.prompt = s;
      this.dirty = true;
    }
  }

  update(): void {
    if (this.toast && performance.now() > this.toastUntil) {
      this.toast = '';
      this.dirty = true;
    }
    if (this.suppressed !== this.wasSuppressed) {
      this.wasSuppressed = this.suppressed;
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.draw();
    this.tex.needsUpdate = true;
    this.mesh.visible = this.suppressed
      ? !!this.toast
      : !!(this.stats || this.prompt || this.toast || this.persistent || this.reading);
  }

  private pill(text: string, y: number, size: number, bg = 'rgba(10,12,16,0.62)'): void {
    const g = this.g;
    g.font = `${size}px Georgia, serif`;
    const w = g.measureText(text).width + size * 1.2;
    const h = size * 1.6;
    g.fillStyle = bg;
    roundRect(g, (W - w) / 2, y - h / 2, w, h, h / 2);
    g.fill();
    g.fillStyle = '#f1ece0';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, y + 1);
  }

  private draw(): void {
    const g = this.g;
    g.clearRect(0, 0, W, H);
    if (this.suppressed) {
      if (this.toast) this.pill(this.toast, 470, 28);
      return;
    }
    if (this.stats) {
      g.font = '22px ui-monospace, Menlo, monospace';
      const w = g.measureText(this.stats).width + 24;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(g, (W - w) / 2, 6, w, 34, 8);
      g.fill();
      g.fillStyle = '#c9f5b0';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(this.stats, W / 2, 24);
    }
    if (this.reading) {
      const x = 90, y = 70, w = W - 180, h = 340;
      g.fillStyle = 'rgba(28,24,18,0.9)';
      roundRect(g, x, y, w, h, 16);
      g.fill();
      g.strokeStyle = 'rgba(233,217,166,0.6)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#e9d9a6';
      g.font = '34px Georgia, serif';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText(this.readingTitle, W / 2, y + 18);
      g.fillStyle = '#efe9dc';
      g.font = '23px Georgia, serif';
      g.textAlign = 'left';
      let ly = y + 72;
      for (const line of wrap(g, this.readingBody, w - 60)) {
        g.fillText(line, x + 30, ly);
        ly += 31;
      }
      g.fillStyle = '#a39f94';
      g.font = '20px Georgia, serif';
      g.textAlign = 'center';
      g.fillText('○ / E  cerrar', W / 2, y + h - 34);
    }
    if (this.persistent) this.pill(this.persistent, 330, 30, 'rgba(90,40,30,0.7)');
    if (this.toast) this.pill(this.toast, 390, 28);
    if (this.prompt && !this.reading) this.pill(this.prompt, 452, 30);
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (g.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

export { roundRect };
