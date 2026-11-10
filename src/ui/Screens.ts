import type { QualityChoice } from '../app/Quality';
import type { Capabilities } from '../render/modes/detect';
import type { ModeKind } from '../render/modes/ViewMode';

export class LoadingScreen {
  private el = document.getElementById('loading')!;
  private fill = this.el.querySelector<HTMLElement>('.fill')!;
  private status = this.el.querySelector<HTMLElement>('.status')!;

  progress(f: number, label: string): void {
    this.fill.style.width = `${Math.round(f * 100)}%`;
    this.status.textContent = label;
  }

  hide(): void {
    this.el.classList.add('hidden');
  }

  fail(msg: string): void {
    this.status.textContent = msg;
    this.status.style.color = 'var(--error)';
  }
}

interface ModeButton {
  kind: ModeKind;
  label: string;
  detail: string;
}

/** Pantalla inicial: elige modo y calidad. Los botones disparan el modo dentro del gesto. */
export class StartScreen {
  private el = document.getElementById('start')!;
  private modes = this.el.querySelector<HTMLElement>('.modes')!;
  private select = this.el.querySelector<HTMLSelectElement>('.quality select')!;
  private caps = this.el.querySelector<HTMLElement>('.caps')!;
  private hint = this.el.querySelector<HTMLElement>('.hint')!;
  private error = this.el.querySelector<HTMLElement>('.error')!;

  constructor(
    capabilities: Capabilities,
    quality: QualityChoice,
    onChoose: (kind: ModeKind) => void,
    onQuality: (q: QualityChoice) => void,
  ) {
    const buttons: ModeButton[] = [];
    if (capabilities.xr) buttons.push({ kind: 'xr', label: 'Entrar en VR', detail: 'WebXR · Cardboard' });
    if (capabilities.isMobile || capabilities.orientation)
      buttons.push({ kind: 'stereo', label: 'Modo estéreo (Cardboard)', detail: 'Pantalla partida + giroscopio' });
    buttons.push({ kind: 'desktop', label: 'Escritorio', detail: 'Ratón + teclado (WASD)' });

    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.innerHTML = `${b.label}<small>${b.detail}</small>`;
      if (b.kind === capabilities.recommended) btn.classList.add('recommended');
      // ¡Nada de await antes de onChoose! Permisos y requestSession exigen el gesto.
      btn.addEventListener('click', () => onChoose(b.kind));
      this.modes.appendChild(btn);
    }

    this.select.value = quality;
    this.select.addEventListener('change', () => onQuality(this.select.value as QualityChoice));

    const flags = [
      capabilities.xr ? 'WebXR ✓' : 'WebXR ✗',
      capabilities.orientation ? 'giroscopio ✓' : 'giroscopio ✗',
      capabilities.secure ? 'HTTPS ✓' : 'HTTPS ✗ (WebXR y giroscopio no funcionarán)',
    ];
    this.caps.textContent = flags.join(' · ');
    this.hint.textContent = capabilities.isIOS
      ? 'iPhone: gira el móvil en horizontal. Para pantalla completa, "Compartir → Añadir a pantalla de inicio".'
      : 'Mando de PS4: pulsa cualquier botón para que el navegador lo detecte.';
  }

  show(): void {
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.error.textContent = '';
  }

  showError(msg: string): void {
    this.error.textContent = msg;
  }
}
