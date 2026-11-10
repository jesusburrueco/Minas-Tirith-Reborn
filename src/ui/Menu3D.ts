import {
  CanvasTexture, LinearFilter, Mesh, PlaneGeometry, Raycaster, SRGBColorSpace, ShaderMaterial, Vector3,
  type PerspectiveCamera, type Scene,
} from 'three';
import type { InputFrame } from '../input/actions';
import { UI_UNIFORMS } from '../render/ScreenOverlay';
import { roundRect } from './Hud';

export interface MenuItem {
  label: string;
  /** Si existe, la fila muestra un valor y se cambia con ←/→ (o con confirmar, en ciclo). */
  value?: () => string;
  adjust?: (dir: -1 | 1) => void;
  select?: () => void;
  dim?: boolean;
}

export interface MenuPage {
  title: string;
  items: () => MenuItem[];
}

const CW = 512;
const CH = 680;
const ROW_Y0 = 96;
const ROW_H = 46;
const PANEL_W = 0.95;
const PANEL_H = (PANEL_W * CH) / CW;
const DISTANCE = 1.6;

/**
 * Menú en el mundo (en WebXR el HTML no se ve): un panel que aparece delante de la
 * cabeza al abrirlo. Se maneja con mando, teclado, o mirando una fila y tocando la pantalla.
 */
export class Menu3D {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private stack: MenuPage[] = [];
  private sel = 0;
  private lastGazeRow = -1;
  private raycaster = new Raycaster();
  private v1 = new Vector3();
  private v2 = new Vector3();
  open = false;
  onClose: () => void = () => {};

  constructor(scene: Scene, private root: MenuPage) {
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.minFilter = LinearFilter;
    this.tex.generateMipmaps = false;
    const mat = new ShaderMaterial({
      uniforms: { map: { value: this.tex }, ...UI_UNIFORMS },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
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
      fog: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(PANEL_W, PANEL_H), mat);
    this.mesh.renderOrder = 990;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  private get page(): MenuPage {
    return this.stack[this.stack.length - 1];
  }

  show(camera: PerspectiveCamera, page: MenuPage = this.root): void {
    this.stack = [page];
    this.sel = 0;
    this.lastGazeRow = -2; // la primera lectura de la mirada no cambia la selección inicial
    this.open = true;
    const head = camera.getWorldPosition(this.v1);
    const dir = camera.getWorldDirection(this.v2);
    dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    this.mesh.position.copy(head).addScaledVector(dir, DISTANCE);
    this.mesh.position.y -= 0.05;
    this.mesh.lookAt(head.x, this.mesh.position.y, head.z);
    this.mesh.visible = true;
    this.redraw();
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.mesh.visible = false;
    this.onClose();
  }

  push(page: MenuPage): void {
    this.stack.push(page);
    this.sel = 0;
    this.redraw();
  }

  /** Redibuja (llamar si cambia un valor desde fuera). */
  refresh(): void {
    if (this.open) this.redraw();
  }

  update(f: InputFrame, camera: PerspectiveCamera): void {
    if (!this.open) return;
    const items = this.page.items();
    let changed = false;

    // Mirada: selecciona la fila a la que se mira (solo cuando cambia de fila).
    camera.getWorldPosition(this.v1);
    camera.getWorldDirection(this.v2);
    this.raycaster.set(this.v1, this.v2);
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];
    if (hit?.uv) {
      const py = (1 - hit.uv.y) * CH;
      const row = Math.floor((py - ROW_Y0) / ROW_H);
      if (this.lastGazeRow !== -2 && row !== this.lastGazeRow && row >= 0 && row < items.length) {
        this.sel = row;
        changed = true;
      }
      this.lastGazeRow = row;
    }

    if (f.up) { this.sel = (this.sel - 1 + items.length) % items.length; changed = true; }
    if (f.down) { this.sel = (this.sel + 1) % items.length; changed = true; }
    const it = items[this.sel];
    if (it?.adjust && (f.left || f.right)) {
      it.adjust(f.left ? -1 : 1);
      changed = true;
    }
    if (f.confirm && it) {
      if (it.select) it.select();
      else it.adjust?.(1);
      changed = true;
    }
    if (f.back) {
      if (this.stack.length > 1) {
        this.stack.pop();
        this.sel = 0;
        changed = true;
      } else {
        this.hide();
        return;
      }
    }
    if (f.menu) {
      this.hide();
      return;
    }
    if (changed && this.open) this.redraw();
  }

  private redraw(): void {
    const g = this.g;
    const items = this.page.items();
    this.sel = Math.min(this.sel, items.length - 1);
    g.clearRect(0, 0, CW, CH);
    g.fillStyle = 'rgba(16,19,26,0.92)';
    roundRect(g, 4, 4, CW - 8, CH - 8, 22);
    g.fill();
    g.strokeStyle = 'rgba(233,217,166,0.45)';
    g.lineWidth = 3;
    g.stroke();

    g.fillStyle = '#e9d9a6';
    g.font = '34px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(this.page.title, CW / 2, 50);

    items.forEach((it, i) => {
      const y = ROW_Y0 + i * ROW_H;
      if (i === this.sel) {
        g.fillStyle = 'rgba(233,217,166,0.22)';
        roundRect(g, 18, y + 3, CW - 36, ROW_H - 6, 10);
        g.fill();
      }
      g.fillStyle = it.dim ? '#7d7a72' : '#efe9dc';
      g.font = '25px Georgia, serif';
      g.textAlign = 'left';
      g.fillText(it.label, 34, y + ROW_H / 2);
      if (it.value) {
        g.textAlign = 'right';
        g.fillStyle = '#e9d9a6';
        g.fillText(`‹ ${it.value()} ›`, CW - 34, y + ROW_H / 2);
      }
    });

    g.fillStyle = '#8f8b81';
    g.font = '17px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('Cruceta: elegir · ←/→: cambiar · X: aceptar · ○: volver', CW / 2, CH - 46);
    g.fillText('Sin mando: mira una fila y toca la pantalla', CW / 2, CH - 22);
    this.tex.needsUpdate = true;
  }
}
