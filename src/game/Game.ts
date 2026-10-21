import * as THREE from 'three';
import type { Config } from '../config';
import type { GameOptions, Phase } from '../types';
import { EventBus } from '../events';
import { mulberry32 } from '../rng';
import type { Rng } from '../rng';
import { COUNTRIES } from '../data/countries';
import { Arena } from './Arena';
import { HoleManager } from './HoleManager';
import { TextureStore } from './Textures';
import { FlagManager } from './FlagManager';
import { Simulation } from './Simulation';
import { PacingController } from './PacingController';
import { CameraDirector } from './CameraDirector';

/**
 * Owns the renderer/scene and the phase machine: boot -> intro -> battle ->
 * champion. The render loop runs a fixed-timestep accumulator (1/60) for the
 * sim; pacing/hole spawning runs inside the fixed step for determinism.
 */
export class Game {
  readonly events = new EventBus();
  config: Config;
  seed: number;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private arena: Arena;
  private holes: HoleManager;
  private store = new TextureStore();
  private flags: FlagManager;
  private sim: Simulation;
  private pacing: PacingController;
  private cameraDirector: CameraDirector;
  private rng: Rng;

  private phase: Phase = 'boot';
  private accumulator = 0;
  private lastFrameTime = 0;
  private introTimer = 0;
  private lastCountdownShown = -1;
  private bootedOnce = false;
  private loaded = false;

  private debug: boolean;
  private debugEl: HTMLElement | null = null;
  private fpsAccum = 0;
  private fpsFrames = 0;

  constructor(container: HTMLElement, opts: GameOptions, config: Config) {
    this.config = config;
    this.seed = opts.seed >>> 0;
    this.debug = opts.debug;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x050508, 1);
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.Fog(0x050508, 70, 160);

    this.arena = new Arena(this.scene, config);
    this.holes = new HoleManager(config, this.arena.floorUniforms);
    this.flags = new FlagManager(this.arena.group, this.scene, this.store, config);
    this.cameraDirector = new CameraDirector(config, window.innerWidth / window.innerHeight);

    this.rng = mulberry32(this.seed);
    this.sim = new Simulation({
      config,
      rng: this.rng,
      events: this.events,
      flags: this.flags,
      holes: this.holes,
    });
    this.pacing = new PacingController(config, this.rng, this.events, this.flags, this.holes, this.sim);

    this.events.on('champion', () => {
      this.setPhase('champion');
    });

    window.addEventListener('resize', this.handleResize);
    if (this.debug) {
      this.debugEl = document.getElementById('debug');
      this.debugEl?.classList.remove('hidden');
    }
  }

  get simTime(): number {
    return this.sim.simTime;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  start(): void {
    if (!this.bootedOnce) {
      this.bootedOnce = true;
      const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.store
        .load(COUNTRIES, anisotropy, (loaded, total) =>
          this.events.emit('bootProgress', { loaded, total })
        )
        .then(() => {
          if (this.store.failed.size > 0) {
            this.events.emit('bootError', {
              message: `${this.store.failed.size} flag images failed to load — run \`pnpm download:flags\` and reload.`,
            });
            return;
          }
          this.loaded = true;
          this.flags.scatter(this.rng);
          this.sim.reset();
          this.pacing.reset();
          this.setPhase('intro');
          this.events.emit('introCountdown', { secondsLeft: Math.ceil(this.config.intro.durationS) });
        });
    }
    this.renderer.setAnimationLoop(this.tick);
  }

  private handleResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.cameraDirector.resize(w, h);
  };

  private tick = (time: number): void => {
    const rawDt = this.lastFrameTime === 0 ? 1 / 60 : (time - this.lastFrameTime) / 1000;
    this.lastFrameTime = time;
    // Clamp huge gaps (tab hidden): catch up at most maxCatchupS of sim time.
    const frameDt = Math.min(Math.max(rawDt, 0), this.config.sim.maxCatchupS);

    // --- Phase logic (frame-rate domain) ---
    if (this.phase === 'intro') {
      this.introTimer -= frameDt;
      const secondsLeft = Math.max(0, Math.ceil(this.introTimer));
      if (secondsLeft !== this.lastCountdownShown) {
        this.lastCountdownShown = secondsLeft;
        this.events.emit('introCountdown', { secondsLeft });
      }
      if (this.introTimer <= 0) {
        this.setPhase('battle');
      }
    }

    // --- Fixed-timestep sim (deterministic domain) ---
    if (this.loaded && this.phase !== 'boot') {
      const dt = this.config.sim.timestep;
      this.accumulator += frameDt;
      if (this.accumulator > this.config.sim.maxCatchupS) {
        this.accumulator = this.config.sim.maxCatchupS;
      }
      let steps = 0;
      while (this.accumulator >= dt && steps < 240) {
        this.sim.step(dt);
        if (this.phase === 'battle') {
          this.pacing.update(dt);
        }
        this.accumulator -= dt;
        steps++;
      }
      if (steps >= 240) {
        // Drop leftover debt rather than freeze the frame.
        this.accumulator = 0;
      }
    }

    // --- Visual updates ---
    if (this.phase === 'champion') {
      this.arena.easeSpinToZero(frameDt);
    }
    this.arena.update(frameDt);
    this.flags.updateVisuals(this.sim.simTime);
    this.cameraDirector.update(frameDt, this.phase, this.sim.champion);
    this.renderer.render(this.scene, this.cameraDirector.camera);

    if (this.debug) this.updateDebug(frameDt);
  };

  private setPhase(phase: Phase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    if (phase === 'intro') {
      this.introTimer = this.config.intro.durationS;
      this.lastCountdownShown = -1;
    }
    this.events.emit('phaseChanged', { phase });
  }

  /** Soft reset for "battle again": fresh seed, fresh scatter, back to intro. */
  restart(newSeed: number): void {
    this.rng = mulberry32(newSeed >>> 0);
    this.holes.clear();
    this.flags.scatter(this.rng);
    this.sim.reset();
    this.pacing.reset();
    this.arena.resetSpin();
    this.accumulator = 0;
    this.setPhase('intro');
    this.events.emit('introCountdown', { secondsLeft: Math.ceil(this.config.intro.durationS) });
  }

  private updateDebug(dt: number): void {
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.debugEl && this.fpsAccum >= 0.5) {
      const fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.debugEl.innerHTML =
        `fps ${fps} &nbsp; phase ${this.phase} &nbsp; alive ${this.flags.aliveCount}` +
        ` &nbsp; holes ${this.holes.count} &nbsp; pressure ${this.pacing.pressure.toFixed(2)}` +
        ` &nbsp; t ${this.sim.simTime.toFixed(1)}s`;
    }
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.handleResize);
    this.flags.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.events.clear();
  }
}
