import * as THREE from 'three';
import { DEFAULT_CONFIG } from '../src/config';
import { EventBus } from '../src/events';
import { mulberry32 } from '../src/rng';
import { COUNTRIES } from '../src/data/countries';
import { HoleManager } from '../src/game/HoleManager';
import { TextureStore } from '../src/game/Textures';
import { FlagManager } from '../src/game/FlagManager';
import { Simulation } from '../src/game/Simulation';
import { PacingController } from '../src/game/PacingController';

const T = Number(process.argv[2] ?? 600);
const seed = Number(process.argv[3] ?? 777);
const config = { ...DEFAULT_CONFIG, pacing: { ...DEFAULT_CONFIG.pacing, targetDurationS: T } };

const events = new EventBus();
const rng = mulberry32(seed);
const store = new TextureStore();
for (const c of COUNTRIES) store.textures.set(c.code, new THREE.Texture());
const flags = new FlagManager(new THREE.Group(), new THREE.Scene(), store, config);
const holes = new HoleManager(config, {
  uHoles: { value: Array.from({ length: 64 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uHoleCount: { value: 0 },
});
flags.scatter(rng);
const sim = new Simulation({ config, rng, events, flags, holes });
const pacing = new PacingController(config, rng, events, flags, holes, sim);

const k = Math.log(195) / T;
const dt = config.sim.timestep;
let done = false;
events.on('champion', () => (done = true));
let nextLog = 30;
for (let i = 0; i < Math.ceil((T * 1.5) / dt) && !done; i++) {
  sim.step(dt);
  pacing.update(dt);
  if (sim.simTime >= nextLog) {
    const target = 195 * Math.exp(-k * sim.simTime);
    console.log(
      `t=${sim.simTime.toFixed(0).padStart(4)} alive=${String(flags.aliveCount).padStart(3)} ` +
        `target=${target.toFixed(1).padStart(6)} pressure=${pacing.pressure.toFixed(2)} holes=${holes.count}`
    );
    nextLog += 30;
  }
}
console.log(`ended t=${sim.simTime.toFixed(0)} alive=${flags.aliveCount}`);
