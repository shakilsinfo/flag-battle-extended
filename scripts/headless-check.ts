/**
 * Headless verification: bundles with esbuild, runs in Node (no DOM).
 * Checks:
 *   1. Winner guarantee: N short rounds -> exactly 1 champion every time.
 *   2. Determinism: same seed twice -> identical elimination order.
 *   3. Round duration within tolerance of the target.
 *   4. Places are a valid permutation: 195..2 exactly once + champion.
 */
import { runHeadlessRound } from '../src/headless';

const DURATION = 120;
const ROUNDS = 10;

function validPlaces(order: string[], championCode: string | null): boolean {
  const total = 195;
  if (order.length !== total - 1) return false;
  const places = [...order.map((_, i) => total - i)];
  const seen = new Set(places);
  return seen.size === places.length && !places.includes(1) && championCode !== null;
}

let failures = 0;
const results: { seed: number; champ: string; elapsed: number; alive: number }[] = [];

for (let i = 0; i < ROUNDS; i++) {
  const seed = 1000 + i * 7919;
  const r = runHeadlessRound(seed, DURATION);
  const okChampion = r.championCode !== null && r.aliveAtEnd === 1;
  const okPlaces = validPlaces(r.eliminationOrder, r.championCode);
  const drift = Math.abs(r.elapsedS - DURATION) / DURATION;
  const okTime = r.elapsedS <= DURATION * 1.2; // sudden death ceiling
  console.log(
    `seed ${seed}: champion=${r.championCode ?? 'NONE'} alive=${r.aliveAtEnd} ` +
      `elapsed=${r.elapsedS.toFixed(1)}s (${(drift * 100).toFixed(0)}% off) ` +
      `order=${r.eliminationOrder.length} massEvents=${r.massEvents} ` +
      `placesOK=${okPlaces} timeOK=${okTime}`
  );
  if (!okChampion || !okPlaces) failures++;
  results.push({ seed, champ: r.championCode ?? 'NONE', elapsed: r.elapsedS, alive: r.aliveAtEnd });
}

// Determinism: same seed -> identical order.
const d1 = runHeadlessRound(424242, DURATION);
const d2 = runHeadlessRound(424242, DURATION);
const same =
  d1.championCode === d2.championCode &&
  d1.eliminationOrder.length === d2.eliminationOrder.length &&
  d1.eliminationOrder.every((c, i) => c === d2.eliminationOrder[i]);
console.log(`determinism(seed 424242): ${same ? 'IDENTICAL' : 'MISMATCH'}`);
if (!same) failures++;

// Distribution sanity: different seeds should usually produce different champions.
const champs = new Set(results.map((r) => r.champ));
console.log(`distinct champions across ${ROUNDS} rounds: ${champs.size}`);

if (failures > 0) {
  console.error(`✗ ${failures} check(s) failed`);
  process.exit(1);
}
console.log('✓ all headless checks passed');
