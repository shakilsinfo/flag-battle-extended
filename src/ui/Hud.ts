import type { EventBus } from '../events';
import { formatClock } from '../rng';

/** Top-left HUD: alive count, elapsed/target clock, round progress bar. */
export class Hud {
  private root: HTMLElement;
  private aliveEl: HTMLElement;
  private elapsedEl: HTMLElement;
  private targetEl: HTMLElement;
  private progressEl: HTMLElement;
  private eliminated = 0;
  private total: number;
  private targetDurationS: number;
  private timer: number | null = null;

  constructor(events: EventBus, private getSimTime: () => number, total: number, targetDurationS: number) {
    this.root = document.getElementById('hud')!;
    this.aliveEl = document.getElementById('hud-alive')!;
    this.elapsedEl = document.getElementById('hud-elapsed')!;
    this.targetEl = document.getElementById('hud-target')!;
    this.progressEl = document.getElementById('hud-progress-fill')!;
    this.total = total;
    this.targetDurationS = targetDurationS;
    this.targetEl.textContent = `/ ${formatClock(targetDurationS)}`;

    events.on('phaseChanged', ({ phase }) => {
      if (phase === 'battle') this.show();
      if (phase === 'champion') this.stopClock();
      if (phase === 'boot' || phase === 'intro') this.reset();
    });
    events.on('eliminations', ({ entries }) => {
      this.eliminated += entries.length;
      this.aliveEl.textContent = String(Math.max(0, this.total - this.eliminated));
    });
  }

  private show(): void {
    this.root.classList.remove('hidden');
    if (this.timer === null) {
      this.timer = window.setInterval(() => this.tickClock(), 250);
    }
  }

  private stopClock(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private reset(): void {
    this.eliminated = 0;
    this.aliveEl.textContent = String(this.total);
    this.elapsedEl.textContent = '00:00';
    this.progressEl.style.width = '0%';
    this.root.classList.add('hidden');
    this.stopClock();
  }

  private tickClock(): void {
    const t = this.getSimTime();
    this.elapsedEl.textContent = formatClock(t);
    const p = Math.min(1, t / this.targetDurationS);
    this.progressEl.style.width = `${(p * 100).toFixed(2)}%`;
  }
}
