import type { EventBus } from '../events';

/**
 * Boot/intro overlay: loading bar while textures stream in, then the title
 * with the 5->1 countdown. Fades out when the battle starts.
 */
export class IntroOverlay {
  private root: HTMLElement;
  private loadingBox: HTMLElement;
  private loadingLabel: HTMLElement;
  private loadingFill: HTMLElement;
  private countdownEl: HTMLElement;
  private subEl: HTMLElement;

  constructor(events: EventBus) {
    this.root = document.getElementById('intro')!;
    this.loadingBox = document.getElementById('intro-loading')!;
    this.loadingLabel = document.getElementById('intro-loading-label')!;
    this.loadingFill = document.getElementById('intro-progress-fill')!;
    this.countdownEl = document.getElementById('intro-countdown')!;
    this.subEl = document.getElementById('intro-sub')!;

    events.on('bootProgress', ({ loaded, total }) => {
      this.loadingLabel.textContent = `Loading flags ${loaded}/${total}`;
      this.loadingFill.style.width = `${(100 * loaded) / Math.max(1, total)}%`;
    });
    events.on('bootError', ({ message }) => {
      this.loadingLabel.textContent = message;
      this.loadingFill.style.width = '100%';
      this.loadingFill.classList.add('intro-progress-error');
    });
    events.on('phaseChanged', ({ phase }) => this.onPhase(phase));
    events.on('introCountdown', ({ secondsLeft }) => {
      this.loadingBox.classList.add('hidden');
      this.countdownEl.classList.remove('hidden');
      this.subEl.classList.remove('hidden');
      // Retrigger the pop animation for each new number.
      this.countdownEl.classList.remove('countdown-pop');
      void this.countdownEl.offsetWidth;
      this.countdownEl.textContent = String(secondsLeft);
      this.countdownEl.classList.add('countdown-pop');
    });
  }

  private onPhase(phase: string): void {
    if (phase === 'intro') {
      this.root.classList.remove('hidden', 'intro-out');
      this.subEl.classList.add('hidden');
    }
    if (phase === 'battle') {
      this.root.classList.add('intro-out');
      window.setTimeout(() => {
        this.root.classList.add('hidden');
        this.countdownEl.classList.add('hidden');
        this.loadingBox.classList.remove('hidden');
      }, 650);
    }
    if (phase === 'boot') {
      this.root.classList.remove('hidden', 'intro-out');
      this.loadingBox.classList.remove('hidden');
      this.countdownEl.classList.add('hidden');
      this.subEl.classList.add('hidden');
    }
  }
}
