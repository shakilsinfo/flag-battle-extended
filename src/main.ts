import { DEFAULT_CONFIG } from './config';
import type { Config } from './config';
import { Game } from './game/Game';
import { hashSeed } from './rng';
import { COUNTRY_COUNT } from './data/countries';
import { runHeadlessRound } from './headless';
import { Hud } from './ui/Hud';
import { EliminationFeed } from './ui/EliminationFeed';
import { Toast } from './ui/Toast';
import { IntroOverlay } from './ui/IntroOverlay';
import { ChampionScreen } from './ui/ChampionScreen';

function parseParams(): { seed: number; durationS: number; debug: boolean } {
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  let seed: number;
  if (seedParam === null || seedParam === '') {
    seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  } else if (/^\d+$/.test(seedParam)) {
    seed = Number.parseInt(seedParam, 10) >>> 0;
  } else {
    seed = hashSeed(seedParam);
  }
  const durationRaw = params.get('duration');
  let durationS = DEFAULT_CONFIG.pacing.targetDurationS;
  if (durationRaw !== null) {
    const parsed = Number.parseFloat(durationRaw);
    if (Number.isFinite(parsed) && parsed > 0) {
      durationS = Math.min(14400, Math.max(20, parsed));
    }
  }
  const debug = params.get('debug') === '1';
  return { seed, durationS, debug };
}

function freshSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

const { seed, durationS, debug } = parseParams();

const config: Config = {
  ...DEFAULT_CONFIG,
  pacing: { ...DEFAULT_CONFIG.pacing, targetDurationS: durationS },
};

const game = new Game(document.getElementById('app')!, { seed, debug }, config);

// UI overlay wiring.
new IntroOverlay(game.events);
new Hud(game.events, () => game.simTime, COUNTRY_COUNT, durationS);
new EliminationFeed(game.events, config.ui.feedMaxRows);
new Toast(game.events, config.ui.toastMaxVisible, config.ui.toastLifeS * 1000, config.ui.massToastThreshold);
new ChampionScreen(game.events, () => game.restart(freshSeed()), COUNTRY_COUNT);

game.start();

// Console hook for verification: __flagBattle.runHeadless(seed, seconds)
declare global {
  interface Window {
    __flagBattle?: { game: Game; runHeadless: typeof runHeadlessRound };
  }
}

window.__flagBattle = { game, runHeadless: runHeadlessRound };
