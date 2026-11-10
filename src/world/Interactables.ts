import { Vector3 } from 'three';

export interface Interactable {
  position: Vector3;
  /** Distancia máxima de uso (m). */
  radius: number;
  /** Texto que aparece en el HUD, p. ej. "Abrir puerta". */
  prompt: () => string;
  interact: () => void;
}

/** Elige el objeto interactuable más cercano al que se está mirando. */
export class InteractionSystem {
  private items: Interactable[] = [];
  current: Interactable | null = null;
  private tmp = new Vector3();

  add(i: Interactable): void {
    this.items.push(i);
  }

  update(headPos: Vector3, headDir: Vector3): void {
    let best: Interactable | null = null;
    let bestScore = -Infinity;
    for (const it of this.items) {
      const d = this.tmp.subVectors(it.position, headPos);
      const dist = d.length();
      if (dist > it.radius) continue;
      const facing = dist > 0.01 ? d.dot(headDir) / dist : 1;
      if (facing < 0.55) continue; // ~56° alrededor de la mirada
      const score = facing - dist / it.radius;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    this.current = best;
  }
}
