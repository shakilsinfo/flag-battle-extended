import * as THREE from 'three';
import { DEFAULT_CONFIG } from './config';
import type { Config } from './config';
import { EventBus } from './events';
import { mulberry32 } from './rng';
import { COUNTRIES } from './data/countries';
import { HoleManager } from './game/HoleManager';
import { TextureStore } from './game/Textures';
import { FlagManager } from './game/FlagManager';
import { Simulation } from './game/Simulation';
import { PacingController } from './game/PacingController';

export interface HeadlessResult {
  championCode: string | null;
  championName: string | null;
  aliveAtEnd: number;
  elapsedS: number;
  eliminationOrder: string[];
  massEvents: number;
}

/**
 * Runs a complete round of the exact fixed-step sim stack (no renderer, no
 * DOM, no textures) for verification: determinism, winner guarantee, pacing.
 * Mirrors Game's ordering: intro drift first, then battle steps with pacing.
 */
export function runHeadlessRound(seed: number, durationS: number, configOverride?: Partial<Config>): HeadlessResult {
  const config: Config = configOverride
    ? { ...DEFAULT_CONFIG, ...configOverride, pacing: { ...DEFAULT_CONFIG.pacing, ...configOverride.pacing } }
    : DEFAULT_CONFIG;
  config.pacing = { ...config.pacing, targetDurationS: durationS };

  const events = new EventBus();
  const rng = mulberry32(seed >>> 0);

  const store = new TextureStore();
  for (const c of COUNTRIES) store.textures.set(c.code, new THREE.Texture());

  const arenaGroup = new THREE.Group();
  const scene = new THREE.Scene();
  const flags = new FlagManager(arenaGroup, scene, store, config);
  const holes = new HoleManager(config, {
    uHoles: { value: Array.from({ length: 64 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uHoleCount: { value: 0 },
  });

  flags.scatter(rng);
  const sim = new Simulation({ config, rng, events, flags, holes });
  const pacing = new PacingController(config, rng, events, flags, holes, sim);

  const eliminationOrder: string[] = [];
  let massEvents = 0;
  let championCode: string | null = null;
  let championName: string | null = null;
  events.on('eliminations', ({ entries }) => {
    for (const e of entries) eliminationOrder.push(e.code);
    if (entries.length >= 5) massEvents++;
  });
  events.on('champion', ({ code, name }) => {
    championCode = code;
    championName = name;
  });

  const dt = config.sim.timestep;
  const introSteps = Math.round(config.intro.durationS / dt);
  const maxBattleSteps = Math.ceil((durationS * 2.0 + 120) / dt);

  for (let i = 0; i < introSteps; i++) sim.step(dt);
  for (let i = 0; i < maxBattleSteps && championCode === null; i++) {
    sim.step(dt);
    pacing.update(dt);
  }

  return {
    championCode,
    championName,
    aliveAtEnd: flags.aliveCount,
    elapsedS: sim.simTime,
    eliminationOrder,
    massEvents,
  };
}
