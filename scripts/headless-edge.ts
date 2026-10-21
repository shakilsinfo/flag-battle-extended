import { runHeadlessRound } from '../src/headless';

const cases = [20, 30, 60, 600];
let failures = 0;
for (const dur of cases) {
  const t0 = Date.now();
  const r = runHeadlessRound(777 + dur, dur);
  const ok = r.championCode !== null && r.aliveAtEnd === 1 && r.eliminationOrder.length === 194;
  console.log(
    `dur=${dur}s: champion=${r.championCode ?? 'NONE'} alive=${r.aliveAtEnd} elapsed=${r.elapsedS.toFixed(1)}s ` +
      `elim=${r.eliminationOrder.length} ok=${ok} wall=${(((Date.now() - t0) / 1000) | 0)}s`
  );
  if (!ok) failures++;
}
if (failures > 0) process.exit(1);
console.log('✓ edge durations passed');
