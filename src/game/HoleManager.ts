import type { Config } from '../config';
import { MAX_HOLES } from './Arena';

export type HoleState = 'warning' | 'opening' | 'hold' | 'closing';

/**
 * A hole in the arena floor. Positions are stored in sim space (x, z);
 * conversion to disc-local shader coords happens when uniforms are written.
 */
export class Hole {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly targetR: number;
  readonly holdS: number;
  state: HoleState = 'warning';
  t = 0;
  /** Animated (open) radius: 0 during warning, eases to targetR, shrinks on close. */
  radius = 0;
  /** Rim glow intensity, 0..1. */
  rim = 0;

  constructor(id: number, x: number, z: number, targetR: number, holdS: number) {
    this.id = id;
    this.x = x;
    this.z = z;
    this.targetR = targetR;
    this.holdS = holdS;
  }
}

function easeInCubic(t: number): number {
  return t * t * t;
}

export class HoleManager {
  readonly holes: Hole[] = [];
  private nextId = 1;

  constructor(
    private config: Config,
    private uniforms: { uHoles: { value: unknown[] }; uHoleCount: { value: number } }
  ) {}

  get count(): number {
    return this.holes.length;
  }

  spawn(x: number, z: number, r: number, holdS: number): Hole | null {
    if (this.holes.length >= MAX_HOLES) return null;
    const hole = new Hole(this.nextId++, x, z, r, holdS);
    this.holes.push(hole);
    return hole;
  }

  /** Advance every hole's lifecycle and write shader uniforms. */
  update(dt: number): void {
    const { warningS, openingS, closingS } = this.config.holes;

    for (let i = this.holes.length - 1; i >= 0; i--) {
      const h = this.holes[i];
      h.t += dt;
      switch (h.state) {
        case 'warning':
          h.radius = 0;
          h.rim = 0.55 + 0.45 * Math.sin(h.t * 22);
          if (h.t >= warningS) {
            h.state = 'opening';
            h.t = 0;
          }
          break;
        case 'opening': {
          const p = Math.min(1, h.t / openingS);
          h.radius = h.targetR * easeInCubic(p);
          h.rim = 1.0 - 0.25 * p;
          if (p >= 1) {
            h.state = 'hold';
            h.t = 0;
          }
          break;
        }
        case 'hold':
          h.radius = h.targetR;
          h.rim = 0.75 - 0.4 * Math.min(1, h.t / 1.5);
          if (h.t >= h.holdS) {
            h.state = 'closing';
            h.t = 0;
          }
          break;
        case 'closing': {
          const p = Math.min(1, h.t / closingS);
          h.radius = h.targetR * (1 - easeInCubic(p));
          h.rim = 0.35 * (1 - p);
          if (p >= 1) {
            this.holes.splice(i, 1);
          }
          break;
        }
      }
    }

    this.writeUniforms();
  }

  /** Sim-space (x,z) -> disc-local shader coords (x, -z). */
  private writeUniforms(): void {
    const arr = this.uniforms.uHoles.value as { set: (x: number, y: number, z: number, w: number) => void }[];
    const n = Math.min(this.holes.length, MAX_HOLES);
    for (let i = 0; i < n; i++) {
      const h = this.holes[i];
      arr[i].set(h.x, -h.z, h.radius, h.rim);
    }
    for (let i = n; i < MAX_HOLES; i++) {
      arr[i].set(0, 0, 0, 0);
    }
    this.uniforms.uHoleCount.value = n;
  }

  clear(): void {
    this.holes.length = 0;
    this.writeUniforms();
  }
}
