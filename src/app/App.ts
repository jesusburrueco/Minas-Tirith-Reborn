import { PerspectiveCamera, Quaternion, Scene, Vector3, type WebGLRenderer } from 'three';
import { DeviceOrientationInput } from '../input/DeviceOrientationInput';
import { InputManager } from '../input/InputManager';
import type { InputFrame } from '../input/actions';
import { Player, type HeadSource } from '../player/Player';
import { createRenderer } from '../render/RendererFactory';
import { ScreenOverlay } from '../render/ScreenOverlay';
import { detectCapabilities, type Capabilities } from '../render/modes/detect';
import { DesktopMode } from '../render/modes/DesktopMode';
import { StereoMode } from '../render/modes/StereoMode';
import type { ModeContext, ModeKind, ViewMode } from '../render/modes/ViewMode';
import { XRMode } from '../render/modes/XRMode';
import { Hud } from '../ui/Hud';
import { Menu3D, type MenuItem, type MenuPage } from '../ui/Menu3D';
import { LoadingScreen, StartScreen } from '../ui/Screens';
import { TELEPORTS, type TeleportPoint } from '../world/layout';
import { World } from '../world/World';
import {
  AutoQuality, PRESETS, QUALITY_LABEL, initialAutoLevel, stepDown,
  type QualityChoice, type QualityLevel, type QualityPreset,
} from './Quality';
import { SettingsStore } from './Settings';

const KEY_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const QUALITY_CYCLE: QualityChoice[] = ['auto', 'low', 'medium', 'high'];
const VIGNETTE_STEPS = [0, 0.35, 0.6, 0.85];
const VIGNETTE_LABEL = ['No', 'Baja', 'Media', 'Alta'];

type Fade = { phase: 'out' | 'in'; t: number; action?: () => void } | null;

export class App {
  private canvas = document.getElementById('view') as HTMLCanvasElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 9000);
  private settings = new SettingsStore();
  private input = new InputManager(this.canvas);
  private orientation = new DeviceOrientationInput();
  private overlay = new ScreenOverlay();
  private hud = new Hud();
  private loading = new LoadingScreen();
  private world!: World;
  private player!: Player;
  private menu!: Menu3D;
  private start!: StartScreen;
  private caps!: Capabilities;

  private modes: Record<ModeKind, ViewMode>;
  private mode: ViewMode;
  private playing = false;

  private autoLevel: QualityLevel = 'high';
  private auto = new AutoQuality(() => this.autoDowngrade());

  private last = performance.now();
  private vignette = 0;
  private fade: Fade = null;
  private reading: Vector3 | null = null;
  private headQ = new Quaternion();
  private headPos = new Vector3();
  private headDir = new Vector3();
  private statsTimer = 0;
  private statsFrames = 0;
  private statsTime = 0;
  private callsAcc = 0;
  private trisLast = 0;

  constructor() {
    this.renderer = createRenderer(this.canvas);
    const ctx: ModeContext = {
      renderer: this.renderer,
      camera: this.camera,
      settings: this.settings,
      touch: this.input.touch,
      orientation: this.orientation,
      getQuality: () => this.preset,
    };
    const stereo = new StereoMode(ctx);
    stereo.onGear = () => this.toggleMenu();
    this.modes = { desktop: new DesktopMode(ctx), stereo, xr: new XRMode(ctx) };
    this.mode = this.modes.desktop;
    this.modes.xr.onEnd = () => this.backToStart(false);
  }

  private get level(): QualityLevel {
    const q = this.settings.values.quality;
    return q === 'auto' ? this.autoLevel : q;
  }

  private get preset(): QualityPreset {
    return PRESETS[this.level];
  }

  async init(): Promise<void> {
    try {
      this.caps = await detectCapabilities();
      this.autoLevel = initialAutoLevel(this.caps.isMobile);
      this.scene.add(this.overlay.mesh, this.hud.mesh);

      this.world = await World.build(
        { scene: this.scene, renderer: this.renderer, camera: this.camera, showText: (t, b) => this.showReading(t, b) },
        (f, label) => this.loading.progress(f, label),
      );
      this.player = new Player(this.camera, this.world.collision);
      this.player.onFell = () => this.teleport(TELEPORTS[0], false);
      this.scene.add(this.player.rig);
      this.player.teleport(TELEPORTS[0].position, TELEPORTS[0].yaw);
      this.menu = new Menu3D(this.scene, this.rootPage());

      this.input.gamepad.onStatus = (s) => {
        if (s.connected) this.hud.showToast('Mando conectado');
        else if (this.playing) this.hud.showToast('Mando desconectado');
        this.updatePadNotice();
      };
      this.settings.onChange((key) => {
        if (key === 'quality') this.applyQuality();
        if (key === 'showStats' && !this.settings.values.showStats) this.hud.setStats('');
      });

      this.applyQuality();
      this.mode.resize();
      window.addEventListener('resize', () => this.mode.resize());
      this.renderer.setAnimationLoop((t) => this.frame(t));

      this.start = new StartScreen(
        this.caps,
        this.settings.values.quality,
        (kind) => this.enterMode(kind),
        (q) => this.settings.set('quality', q),
      );
      this.loading.hide();
      this.start.show();
    } catch (err) {
      console.error(err);
      this.loading.fail(`Error al iniciar: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- modos

  /** Se invoca desde el click: mode.start() se llama de forma síncrona dentro del gesto. */
  private enterMode(kind: ModeKind): void {
    const mode = this.modes[kind];
    mode.applyQuality(this.preset);
    mode.start().then(
      () => {
        this.mode = mode;
        this.playing = true;
        this.start.hide();
        this.input.keyboard.pointerLockEnabled = kind === 'desktop';
        if (kind === 'desktop') {
          this.canvas.requestPointerLock?.();
          this.hud.showToast('WASD mover · ratón mirar · M menú · 1–0 teletransporte', 5);
        }
        if (kind !== 'desktop' && !this.input.gamepad.connected)
          this.hud.showToast('Sin mando: mantén pulsado para andar · doble toque: menú', 7);
        this.applyQuality();
        if (this.settings.values.quality === 'auto') this.auto.arm();
        this.updatePadNotice();
      },
      (err: Error) => {
        console.error(err);
        mode.stop();
        this.start.showError(`No se pudo iniciar: ${err.message}`);
      },
    );
  }

  private backToStart(stopMode = true): void {
    if (stopMode) this.mode.stop();
    this.playing = false;
    this.menu.hide();
    this.hud.hideReading();
    this.hud.setPersistent('');
    this.input.keyboard.pointerLockEnabled = false;
    this.input.keyboard.releasePointer();
    this.auto.disarm();
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.mode = this.modes.desktop;
    this.applyQuality();
    this.start.show();
  }

  private updatePadNotice(): void {
    const needs = this.playing && this.mode.kind !== 'desktop' && !this.input.gamepad.connected;
    this.hud.setPersistent(needs ? 'Conecta un mando' : '');
  }

  // ---------------------------------------------------------------- calidad

  private applyQuality(): void {
    const p = this.preset;
    this.mode.applyQuality(p);
    this.world.applyQuality(p);
    this.menu?.refresh();
  }

  private autoDowngrade(): boolean {
    const next = stepDown(this.autoLevel);
    if (!next || this.settings.values.quality !== 'auto') return false;
    this.autoLevel = next;
    this.applyQuality();
    this.hud.showToast(`Calidad automática: ${QUALITY_LABEL[next]}`);
    return true;
  }

  // ---------------------------------------------------------------- acciones

  private toggleMenu(): void {
    if (!this.playing) return;
    if (this.menu.open) this.menu.hide();
    else {
      this.hud.hideReading();
      this.reading = null;
      this.menu.show(this.camera);
    }
  }

  private showReading(title: string, body: string): void {
    this.hud.showReading(title, body);
    this.reading = this.player.position.clone();
  }

  private recenter(): void {
    if (this.mode.kind === 'stereo') this.orientation.recenter();
    this.player.pitch = 0;
    this.hud.showToast('Vista recentrada', 1.5);
  }

  private teleport(tp: TeleportPoint, fade = true): void {
    if (!tp.available) {
      this.hud.showToast(`«${tp.name}» aún no existe (fase 3–4)`);
      return;
    }
    const go = () => {
      this.player.teleport(tp.position, tp.yaw);
      if (this.mode.kind === 'stereo') this.orientation.recenter();
    };
    this.menu.hide();
    if (fade) this.fade = { phase: 'out', t: 0, action: go };
    else go();
    this.hud.showToast(tp.name, 2);
  }

  private handleActions(f: InputFrame): void {
    if (this.menu.open) {
      this.menu.update(f, this.camera);
      return;
    }
    if (f.menu) {
      this.toggleMenu();
      return;
    }
    if (this.hud.reading) {
      const far = this.reading && this.reading.distanceTo(this.player.position) > 4;
      if (f.interact || f.back || far) {
        this.hud.hideReading();
        this.reading = null;
      }
      return;
    }
    if (f.interact) this.world.interactions.current?.interact();
    if (f.recenter) this.recenter();
    if (f.teleportSlot !== null) this.teleport(TELEPORTS[f.teleportSlot]);
  }

  // ---------------------------------------------------------------- bucle

  private frame(t: number): void {
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    this.renderer.info.reset();

    const s = this.settings.values;
    const frozen = !this.playing || this.menu.open || this.fade !== null;
    const f = this.input.update(s.deadzone, this.menu.open || !this.playing);
    if (this.playing) this.handleActions(f);

    const head: HeadSource =
      this.mode.kind === 'xr' && this.renderer.xr.isPresenting
        ? { kind: 'xr' }
        : this.mode.externalHead() && this.orientation.getQuaternion(this.headQ)
          ? { kind: 'external', q: this.headQ }
          : { kind: 'mouse' };
    this.player.update(dt, f, s, head, frozen || this.hud.reading);
    this.world.update(dt, frozen ? 0 : f.timeAxis, this.player.position);

    this.camera.getWorldPosition(this.headPos);
    this.camera.getWorldDirection(this.headDir);
    this.world.interactions.update(this.headPos, this.headDir);
    const cur = this.playing && !this.menu.open ? this.world.interactions.current : null;
    const glyph = this.input.gamepad.connected ? '○' : this.mode.kind === 'desktop' ? 'E' : 'Toca';
    this.hud.setPrompt(cur ? `${glyph}  ${cur.prompt()}` : '');

    this.updateOverlay(dt);
    this.hud.suppressed = this.menu.open;
    this.hud.update();
    this.mode.render(this.scene);
    this.updateStats(dt); // después del render: info.render ya tiene las draw calls de este fotograma
    if (this.playing) this.auto.sample(dt);
  }

  private updateOverlay(dt: number): void {
    const target = this.mode.kind === 'desktop' ? 0 : this.player.comfort * this.settings.values.vignette;
    const tau = target > this.vignette ? 0.12 : 0.35;
    this.vignette += (target - this.vignette) * (1 - Math.exp(-dt / tau));
    this.overlay.vignette = this.vignette;

    if (this.fade) {
      const dur = this.fade.phase === 'out' ? 0.2 : 0.3;
      this.fade.t += dt / dur;
      if (this.fade.phase === 'out') {
        this.overlay.fade = Math.min(1, this.fade.t);
        if (this.fade.t >= 1) {
          this.fade.action?.();
          this.fade = { phase: 'in', t: 0 };
        }
      } else {
        this.overlay.fade = Math.max(0, 1 - this.fade.t);
        if (this.fade.t >= 1) this.fade = null;
      }
    } else this.overlay.fade = 0;
    this.overlay.update();
  }

  private updateStats(dt: number): void {
    this.statsFrames++;
    this.statsTime += dt;
    this.callsAcc += this.renderer.info.render.calls;
    this.trisLast = this.renderer.info.render.triangles;
    this.statsTimer += dt;
    if (this.statsTimer < 0.5) return;
    if (this.settings.values.showStats) {
      const fps = this.statsFrames / Math.max(1e-3, this.statsTime);
      const calls = this.callsAcc / this.statsFrames / this.mode.eyes;
      const tris = this.trisLast / this.mode.eyes / 1000;
      this.hud.setStats(
        `${fps.toFixed(0)} fps · ${calls.toFixed(0)} draw calls/ojo · ${tris.toFixed(0)}k tri · ${QUALITY_LABEL[this.level]} · ${this.world.time.formatted()}`,
      );
    }
    this.statsTimer = this.statsFrames = this.statsTime = this.callsAcc = 0;
  }

  // ---------------------------------------------------------------- menú

  private rootPage(): MenuPage {
    const s = this.settings;
    return {
      title: 'Ajustes',
      items: () => {
        const items: MenuItem[] = [
          { label: 'Reanudar', select: () => this.menu.hide() },
          {
            label: 'Calidad',
            value: () => (s.values.quality === 'auto' ? `Auto (${QUALITY_LABEL[this.autoLevel]})` : QUALITY_LABEL[s.values.quality]),
            adjust: (d) => s.set('quality', cycle(QUALITY_CYCLE, s.values.quality, d)),
          },
          {
            label: 'Hora del día',
            value: () => this.world.time.formatted(),
            adjust: (d) => {
              const time = this.world.time;
              time.hours = (time.hours + d + 24) % 24;
              time.update(0, 0);
            },
          },
          { label: 'Estadísticas', value: () => (s.values.showStats ? 'Sí' : 'No'), adjust: () => s.set('showStats', !s.values.showStats) },
          { label: 'Teletransporte  ›', select: () => this.menu.push(this.teleportPage()) },
          { label: 'Confort y control  ›', select: () => this.menu.push(this.comfortPage()) },
        ];
        if (this.mode.kind === 'stereo') items.push({ label: 'Visor estéreo  ›', select: () => this.menu.push(this.stereoPage()) });
        items.push(
          { label: 'Recentrar vista', select: () => { this.recenter(); this.menu.hide(); } },
          { label: 'Salir al inicio', select: () => this.backToStart() },
        );
        return items;
      },
    };
  }

  private teleportPage(): MenuPage {
    return {
      title: 'Teletransporte',
      items: () =>
        TELEPORTS.map((tp, i) => ({
          label: `${i < KEY_LABELS.length ? KEY_LABELS[i] + '  ' : '·  '}${tp.name}`,
          dim: !tp.available,
          select: () => this.teleport(tp),
        })),
    };
  }

  private comfortPage(): MenuPage {
    const s = this.settings;
    return {
      title: 'Confort y control',
      items: () => [
        {
          label: 'Giro',
          value: () => (s.values.turnMode === 'snap' ? `Por pasos ${s.values.snapAngleDeg}°` : 'Suave'),
          adjust: () => s.set('turnMode', s.values.turnMode === 'snap' ? 'smooth' : 'snap'),
        },
        {
          label: 'Velocidad giro suave',
          value: () => `${s.values.smoothTurnDegPerSec}°/s`,
          adjust: (d) => s.set('smoothTurnDegPerSec', clamp(s.values.smoothTurnDegPerSec + d * 15, 30, 180)),
        },
        {
          label: 'Viñeta de confort',
          value: () => VIGNETTE_LABEL[nearestIndex(VIGNETTE_STEPS, s.values.vignette)],
          adjust: (d) => s.set('vignette', VIGNETTE_STEPS[clamp(nearestIndex(VIGNETTE_STEPS, s.values.vignette) + d, 0, 3)]),
        },
        {
          label: 'Zona muerta sticks',
          value: () => `${Math.round(s.values.deadzone * 100)}%`,
          adjust: (d) => s.set('deadzone', round2(clamp(s.values.deadzone + d * 0.05, 0.05, 0.35))),
        },
        {
          label: 'Altura de ojos',
          value: () => `${s.values.eyeHeight.toFixed(2)} m`,
          adjust: (d) => s.set('eyeHeight', round2(clamp(s.values.eyeHeight + d * 0.05, 1.2, 1.95))),
        },
      ],
    };
  }

  private stereoPage(): MenuPage {
    const s = this.settings;
    return {
      title: 'Visor estéreo',
      items: () => [
        { label: 'Distancia entre ojos', value: () => `${s.values.ipdMm} mm`, adjust: (d) => s.set('ipdMm', clamp(s.values.ipdMm + d, 54, 74)) },
        { label: 'Corrección de lente', value: () => (s.values.lensCorrection ? 'Sí' : 'No'), adjust: () => s.set('lensCorrection', !s.values.lensCorrection) },
        { label: 'Separación lentes', value: () => `${s.values.lensSeparationMm} mm`, adjust: (d) => s.set('lensSeparationMm', clamp(s.values.lensSeparationMm + d, 50, 76)) },
        { label: 'Campo de visión', value: () => `${s.values.stereoFovDeg}°`, adjust: (d) => s.set('stereoFovDeg', clamp(s.values.stereoFovDeg + d * 5, 60, 110)) },
      ],
    };
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
function nearestIndex(arr: number[], v: number): number {
  let best = 0;
  for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i] - v) < Math.abs(arr[best] - v)) best = i;
  return best;
}
function cycle<T>(arr: T[], cur: T, d: number): T {
  const i = arr.indexOf(cur);
  return arr[(i + d + arr.length) % arr.length];
}
