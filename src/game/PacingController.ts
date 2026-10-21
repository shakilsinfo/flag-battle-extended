import type { Config } from '../config';
import type { Rng } from '../rng';
import { clamp, lerp, randRange } from '../rng';
import type { EventBus } from '../events';
import type { FlagManager } from './FlagManager';
import type { HoleManager } from './HoleManager';
import type { Simulation } from './Simulation';
import type { Flag } from './Flag';

/**
 * Tracks the ideal elimination curve
 *   alive(t) = N0 * exp(-ln(N0)/T * t)      (note: alive(T) = 1 exactly)
 * with a queue-length ("kill debt") controller:
 *
 *   - debt grows at the ideal instantaneous rate k * alive (kills/sec),
 *   - every actual elimination pays down debt,
 *   - live holes are credited for the flags they will probably capture
 *     ("pending"), so we never double-schedule,
 *   - a new hole spawns only when debt exceeds pending by a margin; its size
 *     scales with the backlog.
 *
 * This self-schedules across the round: with many flags one hole is worth many
 * kills (spawns are rare); with few flags holes are worth <1 kill (spawns are
 * frequent) — no fixed-gain tuning problem. Hunt mode (alive <= 8) targets
 * flags directly, and sudden death (t > 1.2*T) force-captures in escalating
 * batches, so a round can never end with 0 or 2+ survivors.
 */
export class PacingController {
  /** Display-only urgency metric derived from backlog (0.25..3). */
  pressure = 1;

  private debt = 0;
  private prevAlive: number;
  private n0: number;
  private k: number;
  private spawnCooldown = 0;
  private lastHunt: Flag | null = null;
  private suddenDeathAnnounced = false;
  private sdTimer = 0;

  constructor(
    private config: Config,
    private rng: Rng,
    private events: EventBus,
    private flags: FlagManager,
    private holes: HoleManager,
    private sim: Simulation
  ) {
    this.n0 = flags.aliveCount;
    this.k = Math.log(this.n0) / config.pacing.targetDurationS;
    this.prevAlive = this.n0;
  }

  reset(): void {
    this.n0 = this.flags.aliveCount;
    this.k = Math.log(this.n0) / this.config.pacing.targetDurationS;
    this.debt = 0;
    this.prevAlive = this.n0;
    this.spawnCooldown = 0;
    this.lastHunt = null;
    this.suddenDeathAnnounced = false;
    this.sdTimer = 0;
    this.pressure = 1;
  }

  update(dt: number): void {
    const alive = this.flags.aliveCount;
    if (alive <= 1) return;
    const { pacing } = this.config;

    // --- Debt accounting: ideal rate accrues, actual kills pay down. ---
    const idealRate = this.k * alive;
    this.debt += idealRate * dt;
    const eliminated = Math.max(0, this.prevAlive - alive);
    this.debt = Math.max(0, this.debt - eliminated);
    this.prevAlive = alive;

    // --- Pending: expected future captures from live holes. ---
    const pending = this.pendingCaptures();
    const backlog = this.debt - pending;
    this.pressure = clamp(1 + backlog / 6, 0.25, 3);

    // --- Spawning ---
    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0 && backlog > pacing.spawnDebtMargin) {
      if (alive <= pacing.huntThreshold) {
        this.spawnHunt();
        // Stretch hunts across whatever time budget remains so the endgame
        // lands near T instead of snapping shut in ~20s.
        this.spawnCooldown = this.huntCooldown();
      } else if (this.holes.count < this.config.holes.maxConcurrent) {
        this.spawnDensity(backlog);
        this.spawnCooldown = this.config.pacing.minSpawnGapS;
      }
    }

    // --- Sudden death ---
    if (this.sim.simTime > pacing.suddenDeathFactor * this.config.pacing.targetDurationS) {
      if (!this.suddenDeathAnnounced) {
        this.suddenDeathAnnounced = true;
        this.sdTimer = 2;
        this.events.emit('suddenDeath', {});
      }
      this.sdTimer -= dt;
      if (this.sdTimer <= 0 && this.flags.aliveCount > 1) {
        // Escalate when deeply overdue: bigger batches per tick.
        const overdue = this.sim.simTime / this.config.pacing.targetDurationS;
        const divisor = overdue > 2 ? 3 : 8;
        if (this.forceCaptureNearest(Math.max(1, Math.ceil((this.flags.aliveCount - 1) / divisor)))) {
          this.sdTimer = pacing.suddenDeathIntervalS;
        } else {
          // No open hole right now: open one on a random flag, retry once it opens.
          this.spawnHunt();
          this.sdTimer = this.config.holes.warningS + this.config.holes.openingS + 0.4;
        }
      }
    }
  }

  /** How many kills the currently live holes can be expected to deliver. */
  private pendingCaptures(): number {
    const { captureInset } = this.config.holes;
    const holdFactor = this.config.pacing.pendingHoldFactor;
    const alive = this.flags.aliveFlags;
    let pending = 0;
    for (const h of this.holes.holes) {
      if (h.state === 'closing') continue;
      const r = h.targetR - captureInset;
      let under = 0;
      for (const f of alive) {
        const dx = f.pos.x - h.x;
        const dz = f.pos.y - h.z;
        if (dx * dx + dz * dz < r * r) under++;
      }
      pending += under * (h.state === 'hold' ? holdFactor : 1);
    }
    return pending;
  }

  /** Sample candidate centers, score by nearby flag density, spawn the best. */
  private spawnDensity(backlog: number): void {
    const { minR, maxR, holdMinS, holdMaxS } = this.config.holes;
    const { radius } = this.config.arena;
    const { sizeBacklogFull, densityCandidates } = this.config.pacing;

    const sizeT = clamp(backlog / sizeBacklogFull, 0, 1);
    const r = clamp(lerp(minR, maxR, sizeT) * randRange(this.rng, 0.9, 1.1), minR, maxR);
    const margin = r + this.config.holes.edgeMargin;

    const alive = this.flags.aliveFlags;
    if (alive.length === 0) return;

    let bestX = 0;
    let bestZ = 0;
    let bestScore = -Infinity;
    for (let c = 0; c < densityCandidates; c++) {
      const rad = Math.max(0, radius - margin) * Math.sqrt(this.rng());
      const theta = this.rng() * Math.PI * 2;
      const x = rad * Math.cos(theta);
      const z = rad * Math.sin(theta);
      let score = this.rng() * 0.3;
      const nearR = r * 2;
      for (const f of alive) {
        const dx = f.pos.x - x;
        const dz = f.pos.y - z;
        const dSq = dx * dx + dz * dz;
        if (dSq < r * r) score += 1;
        else if (dSq < nearR * nearR) score += 0.35;
      }
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestZ = z;
      }
    }

    this.holes.spawn(bestX, bestZ, r, randRange(this.rng, holdMinS, holdMaxS));
  }

  /**
   * Hunt cooldown: spread the remaining kills evenly over the remaining
   * budget (T - t); overdue rounds collapse to the minimum interval.
   */
  private huntCooldown(): number {
    const T = this.config.pacing.targetDurationS;
    const remain = T - this.sim.simTime;
    const alive = this.flags.aliveCount;
    const ideal = remain > 0 ? remain / Math.max(1, alive - 1) : 2;
    return clamp(ideal, this.config.pacing.huntIntervalS, 90);
  }

  /** Hunt mode: ring a hole directly around a living flag. */
  private spawnHunt(): void {
    const alive = this.flags.aliveFlags;
    if (alive.length === 0) return;
    const { huntHoleR, huntHoldS } = this.config.pacing;
    let pick = alive[Math.floor(this.rng() * alive.length)];
    if (alive.length > 1 && pick === this.lastHunt) {
      // Prefer not to repeat the same target back to back.
      const other = alive[Math.floor(this.rng() * alive.length)];
      if (other !== pick) pick = other;
    }
    this.lastHunt = pick;
    // Clamp the hole inside the arena wall.
    const { radius } = this.config.arena;
    const { edgeMargin } = this.config.holes;
    const maxD = radius - huntHoleR - edgeMargin;
    const d = Math.hypot(pick.pos.x, pick.pos.y);
    let x = pick.pos.x;
    let z = pick.pos.y;
    if (d > maxD) {
      x = (pick.pos.x / d) * maxD;
      z = (pick.pos.y / d) * maxD;
    }
    this.holes.spawn(x, z, huntHoleR, huntHoldS);
  }

  /**
   * Sudden death: eliminate up to `count` flags closest to open hole centers,
   * always leaving at least one survivor (the champion emerges via the sim's
   * champion check).
   */
  private forceCaptureNearest(count: number): boolean {
    const holes = this.holes.holes.filter((h) => h.radius > 0.2);
    if (holes.length === 0) return false;
    const alive = this.flags.aliveFlags;
    if (alive.length <= 1) return false;
    const scored: { flag: Flag; distSq: number }[] = [];
    for (const f of alive) {
      let bestDistSq = Infinity;
      for (const h of holes) {
        const dx = f.pos.x - h.x;
        const dz = f.pos.y - h.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) bestDistSq = dSq;
      }
      scored.push({ flag: f, distSq: bestDistSq });
    }
    scored.sort((a, b) => a.distSq - b.distSq);
    const batch = scored.slice(0, Math.min(count, alive.length - 1)).map((s) => s.flag);
    if (batch.length === 0) return false;
    this.sim.eliminate(batch);
    return true;
  }
}
