import * as THREE from 'three';
import type { Config } from '../config';
import type { Rng } from '../rng';
import { randRange } from '../rng';
import type { EventBus } from '../events';
import type { EliminationEntry } from '../types';
import type { FlagManager } from './FlagManager';
import type { HoleManager, Hole } from './HoleManager';
import type { Flag } from './Flag';

export interface SimDeps {
  config: Config;
  rng: Rng;
  events: EventBus;
  flags: FlagManager;
  holes: HoleManager;
}

/**
 * Custom fixed-step (1/60) sim. All flag positions live in disc-local
 * Cartesian coordinates; the spinning is inherited visually via the arena
 * group parenting, so the sim itself never needs to know about rotation.
 *
 * Step order: drift -> separation -> wall bounce -> hole lifecycles ->
 * capture (with survivor guards) -> falling integration -> champion check.
 */
export class Simulation {
  simTime = 0;
  private placeCounter: number;
  private championFlag: Flag | null = null;

  constructor(private d: SimDeps) {
    this.placeCounter = d.flags.aliveCount || 0;
  }

  get champion(): Flag | null {
    return this.championFlag;
  }

  step(dt: number): void {
    this.simTime += dt;
    this.drift(dt);
    this.separation(dt);
    this.wallBounce();
    this.d.holes.update(dt);
    this.capture();
    this.falling(dt);
    this.checkChampion();
  }

  // 1. OU-style random wander with damping and a speed clamp.
  private drift(dt: number): void {
    const { driftAccel, driftDamp, maxSpeed } = this.d.config.sim;
    const damp = Math.exp(-driftDamp * dt);
    const a = driftAccel * dt;
    const maxSq = maxSpeed * maxSpeed;
    for (const f of this.d.flags.flags) {
      if (f.state !== 'alive') continue;
      f.vel.x = f.vel.x * damp + (this.d.rng() - 0.5) * a;
      f.vel.y = f.vel.y * damp + (this.d.rng() - 0.5) * a;
      const sq = f.vel.x * f.vel.x + f.vel.y * f.vel.y;
      if (sq > maxSq) {
        const s = maxSpeed / Math.sqrt(sq);
        f.vel.x *= s;
        f.vel.y *= s;
      }
      f.pos.x += f.vel.x * dt;
      f.pos.y += f.vel.y * dt;
    }
  }

  // 2. Soft pairwise repulsion so flags spread out instead of stacking.
  private separation(dt: number): void {
    const { separationRadius, separationStrength } = this.d.config.sim;
    const list = this.d.flags.flags;
    const rSq = separationRadius * separationRadius;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state !== 'alive') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state !== 'alive') continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.y - a.pos.y;
        const dSq = dx * dx + dz * dz;
        if (dSq >= rSq || dSq < 1e-9) continue;
        const dist = Math.sqrt(dSq);
        const nx = dx / dist;
        const nz = dz / dist;
        const push = separationStrength * (1 - dist / separationRadius) * dt;
        a.vel.x -= nx * push;
        a.vel.y -= nz * push;
        b.vel.x += nx * push;
        b.vel.y += nz * push;
        // Hard de-stack when deeply overlapping.
        if (dist < 0.4) {
          const corr = (0.4 - dist) * 0.5;
          a.pos.x -= nx * corr;
          a.pos.y -= nz * corr;
          b.pos.x += nx * corr;
          b.pos.y += nz * corr;
        }
      }
    }
  }

  // 3. Bounce off the circular wall.
  private wallBounce(): void {
    const { radius } = this.d.config.arena;
    const { wallInset, wallRestitution } = this.d.config.sim;
    const limit = radius - wallInset;
    const limitSq = limit * limit;
    for (const f of this.d.flags.flags) {
      if (f.state !== 'alive') continue;
      const dSq = f.pos.x * f.pos.x + f.pos.y * f.pos.y;
      if (dSq <= limitSq) continue;
      const dist = Math.sqrt(dSq);
      const nx = f.pos.x / dist;
      const nz = f.pos.y / dist;
      f.pos.x = nx * limit;
      f.pos.y = nz * limit;
      const vn = f.vel.x * nx + f.vel.y * nz;
      if (vn > 0) {
        f.vel.x -= (1 + wallRestitution) * vn * nx;
        f.vel.y -= (1 + wallRestitution) * vn * nz;
      }
    }
  }

  // 5. Capture flags standing over an open hole; guards guarantee a survivor.
  private capture(): void {
    const { captureInset, minCaptureRadius } = this.d.config.holes;
    const holes = this.d.holes.holes;
    const active: Hole[] = [];
    for (const h of holes) {
      if (h.radius >= minCaptureRadius) active.push(h);
    }
    if (active.length === 0) return;

    const candidates: { flag: Flag; distSq: number }[] = [];
    for (const f of this.d.flags.flags) {
      if (f.state !== 'alive') continue;
      for (const h of active) {
        const r = h.radius - captureInset;
        const dx = f.pos.x - h.x;
        const dz = f.pos.y - h.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < r * r) {
          candidates.push({ flag: f, distSq: dSq });
          break;
        }
      }
    }
    if (candidates.length === 0) return;

    // Guard: never eliminate every remaining flag. With 2 alive this means at
    // most 1 capture per step; in general at most aliveCount - 1.
    const aliveCount = this.d.flags.aliveCount;
    if (candidates.length >= aliveCount) {
      // Keep the farthest-from-hole-center candidate alive.
      candidates.sort((a, b) => b.distSq - a.distSq);
      candidates.length = aliveCount - 1;
    }

    this.eliminate(candidates.map((c) => c.flag));
  }

  /** Shared path for hole captures and sudden-death force captures. */
  eliminate(flagsToKill: Flag[]): void {
    if (flagsToKill.length === 0) return;
    const entries: EliminationEntry[] = [];
    for (const f of flagsToKill) {
      if (f.state !== 'alive') continue;
      f.state = 'falling';
      f.place = this.placeCounter--;
      f.fallVy = randRange(this.d.rng, -1.5, -0.5);
      const mag = randRange(this.d.rng, this.d.config.sim.tumbleMin, this.d.config.sim.tumbleMax);
      f.tumbleX = (this.d.rng() < 0.5 ? -1 : 1) * mag;
      f.tumbleZ = (this.d.rng() < 0.5 ? -1 : 1) * randRange(this.d.rng, this.d.config.sim.tumbleMin, this.d.config.sim.tumbleMax);
      this.d.flags.detachToScene(f);
      entries.push({ code: f.code, name: f.name, place: f.place });
    }
    if (entries.length > 0) {
      this.d.events.emit('eliminations', { entries });
    }
  }

  // 6. Scripted fall: gravity + tumble + fade + removal.
  private falling(dt: number): void {
    const { gravity, fadeStartY, fadeEndY, removeY } = this.d.config.sim;
    for (const f of this.d.flags.flags) {
      if (f.state !== 'falling') continue;
      f.fallVy -= gravity * dt;
      const mesh = f.mesh;
      mesh.position.y += f.fallVy * dt;
      mesh.rotation.x += f.tumbleX * dt;
      mesh.rotation.z += f.tumbleZ * dt;
      const y = mesh.position.y;
      const o = THREE.MathUtils.clamp((y - fadeEndY) / (fadeStartY - fadeEndY), 0, 1);
      f.material.opacity = o;
      if (y < removeY) {
        f.state = 'dead';
        mesh.visible = false;
        f.material.opacity = 1;
      }
    }
  }

  private checkChampion(): void {
    if (this.championFlag) return;
    if (this.d.flags.aliveCount === 1) {
      const champ = this.d.flags.aliveFlags[0];
      champ.place = 1;
      this.championFlag = champ;
      this.d.events.emit('champion', {
        code: champ.code,
        name: champ.name,
        elapsedS: this.simTime,
      });
    }
  }

  reset(): void {
    this.simTime = 0;
    this.championFlag = null;
    this.placeCounter = this.d.flags.aliveCount || 0;
  }
}
