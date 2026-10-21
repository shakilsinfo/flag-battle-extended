import type { EventBus } from '../events';
import { formatClock } from '../rng';
import { Confetti } from './Confetti';

/** Champion end screen: big flag, name, stats, confetti, restart button. */
export class ChampionScreen {
  private root: HTMLElement;
  private flagEl: HTMLImageElement;
  private nameEl: HTMLElement;
  private statsEl: HTMLElement;
  private button: HTMLButtonElement;
  private confetti = new Confetti();
  private showTimer: number | null = null;

  constructor(events: EventBus, onRestart: () => void, totalFlags: number) {
    this.root = document.getElementById('champion')!;
    this.flagEl = document.getElementById('champion-flag') as HTMLImageElement;
    this.nameEl = document.getElementById('champion-name')!;
    this.statsEl = document.getElementById('champion-stats')!;
    this.button = document.getElementById('champion-restart') as HTMLButtonElement;

    this.button.addEventListener('click', () => {
      this.hide();
      onRestart();
    });

    events.on('champion', ({ code, name, elapsedS }) => {
      if (this.showTimer !== null) window.clearTimeout(this.showTimer);
      // Small beat so the camera dolly reads before the overlay lands.
      this.showTimer = window.setTimeout(() => {
        this.flagEl.src = `flags-lg/${code}.png`;
        this.nameEl.textContent = name;
        this.statsEl.textContent = `Outlasted ${totalFlags - 1} flags in ${formatClock(elapsedS)}`;
        this.root.classList.remove('hidden');
        this.root.classList.add('champion-in');
        void this.confetti.launch(code);
      }, 1400);
    });

    events.on('phaseChanged', ({ phase }) => {
      if (phase === 'boot' || phase === 'intro') this.hide();
    });
  }

  private hide(): void {
    if (this.showTimer !== null) {
      window.clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    this.confetti.stop();
    this.root.classList.add('hidden');
    this.root.classList.remove('champion-in');
  }
}
