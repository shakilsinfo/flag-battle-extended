import type { EliminationEntry, Phase } from './types';

export interface GameEvents {
  bootProgress: { loaded: number; total: number };
  bootError: { message: string };
  phaseChanged: { phase: Phase };
  introCountdown: { secondsLeft: number };
  eliminations: { entries: EliminationEntry[] };
  champion: { code: string; name: string; elapsedS: number };
  suddenDeath: Record<string, never>;
}

type Handler = (payload: unknown) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler>>();

  on<K extends keyof GameEvents>(type: K, handler: (payload: GameEvents[K]) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const h = handler as Handler;
    set.add(h);
    return () => set!.delete(h);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(payload);
      } catch (err) {
        console.error(`EventBus handler for "${type}" failed`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
