import type { EventBus } from '../events';

/**
 * Center toasts for eliminations, mass eliminations and sudden death.
 * Bounded queue: only maxVisible toasts on screen; each auto-expires.
 */
export class Toast {
  private root: HTMLElement;
  private maxVisible: number;
  private lifeMs: number;
  private massThreshold: number;

  constructor(events: EventBus, maxVisible: number, lifeMs: number, massThreshold: number) {
    this.root = document.getElementById('toasts')!;
    this.maxVisible = maxVisible;
    this.lifeMs = lifeMs;
    this.massThreshold = massThreshold;

    events.on('eliminations', ({ entries }) => this.onEliminations(entries));
    events.on('suddenDeath', () => {
      this.spawnRaw('SUDDEN DEATH', 'The floor is collapsing!', null, 'toast-sudden');
    });
    events.on('phaseChanged', ({ phase }) => {
      if (phase === 'boot' || phase === 'intro') this.clear();
    });
  }

  private onEliminations(entries: { code: string; name: string }[]): void {
    if (entries.length >= this.massThreshold) {
      this.spawnRaw(
        `${entries.length} FLAGS DOWN`,
        entries.length === 1 ? 'One flag eliminated' : 'A whole cluster fell through the floor',
        null,
        'toast-mass'
      );
      return;
    }
    for (const e of entries) {
      this.spawnRaw(e.name, 'has been eliminated', e.code);
    }
  }

  private spawnRaw(title: string, subtitle: string, flagCode: string | null, extraClass = ''): void {
    while (this.root.children.length >= this.maxVisible) {
      this.root.firstElementChild?.remove();
    }
    const el = document.createElement('div');
    el.className = `toast ${extraClass}`.trim();

    if (flagCode) {
      const img = document.createElement('img');
      img.className = 'toast-flag';
      img.src = `flags/${flagCode}.png`;
      img.alt = '';
      img.draggable = false;
      el.appendChild(img);
    }
    const textBox = document.createElement('div');
    textBox.className = 'toast-text';
    const t = document.createElement('div');
    t.className = 'toast-title';
    t.textContent = title;
    const s = document.createElement('div');
    s.className = 'toast-sub';
    s.textContent = subtitle;
    textBox.append(t, s);
    el.appendChild(textBox);

    this.root.appendChild(el);
    window.setTimeout(() => {
      el.classList.add('toast-out');
      window.setTimeout(() => el.remove(), 400);
    }, this.lifeMs);
  }

  clear(): void {
    this.root.replaceChildren();
  }
}
