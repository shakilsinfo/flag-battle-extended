# Flag Battle

A flag elimination battle simulator. 195 country flags wander across a spinning circular arena while holes open in the floor beneath them — any flag standing over an open hole falls through and is eliminated. The last flag standing is crowned the champion.

Fully automated to watch (livestream-style), deterministic per seed, and configurable round duration (default 1 hour, URL-overridable down to seconds for testing).

**Live:** https://flag-battle-ten.vercel.app

## How the game works

1. **Boot** — the 195 flag textures load (progress bar), then flags are scattered across the arena with seeded rejection sampling (minimum spacing, no overlaps).
2. **Intro (5s)** — title screen and a 5→1 countdown. Flags already wander during the intro.
3. **Battle** — holes open and eliminations begin.
4. **Champion** — when one flag remains: the arena spins down, the camera dollies into a tight low orbit around the winner, and the champion screen appears with confetti colored from the winner's own flag. `BATTLE AGAIN` starts a fresh round with a new seed.

### Elimination mechanics

- **Holes** open in the floor with a clear lifecycle: orange **pulsing warning ring** (0.8s) → **opening** (1.2s, easeInCubic radius growth) → **open/hold** (5–9s) → **closing** (1s).
- Any alive flag whose position falls inside `animatedRadius - 0.05` of a hole center is captured: it detaches into world space and plays a scripted fall (gravity, tumbling, fading into the void at `y = -14`).
- Captured flags are correctly occluded by the floor everywhere **except through the hole they fell into** (see shader trick below).

### Pacing: hitting the target duration

The ideal elimination curve is exponential so it lands at exactly 1 survivor at the target time `T`:

```
alive(t) = N0 * exp(-ln(N0)/T * t)        # alive(T) = 1 exactly
```

A **kill-debt queue controller** tracks this curve:

- Debt accrues at the ideal instantaneous rate `k * alive` (kills/sec).
- Every actual elimination pays debt down.
- Live holes are credited for the flags they will probably capture ("pending"), preventing double-scheduling.
- New holes spawn (near dense clusters, scored by sampling) only when debt exceeds pending; hole **size** scales with backlog.

Endgame guarantees:

- **Hunt mode** (`alive <= 8`): holes spawn directly around surviving flags, spread evenly across the remaining time budget.
- **Sudden death** (`t > 1.2 * T`): force-captures the flags nearest to open holes in escalating batches.
- **Survivor guard**: at most `alive - 1` captures per sim step — the round can never end with 0 or 2+ winners.

### Determinism

All gameplay randomness flows through a single seeded mulberry32 stream. Same seed means identical scatter, hole placement, and elimination order. Fixed timestep (1/60s) with an accumulator keeps the sim frame-rate independent; catch-up after a hidden tab is clamped to 1s.

## Tech stack

- **Three.js** (r169) — rendering, no physics engine
- **TypeScript** + **Vite 5** (works on Node >= 18; developed on Node 24)
- **pnpm** package manager
- Custom fixed-step simulation (OU drift, soft separation, wall bounce)
- DOM/CSS overlay UI (no framework)
- Flag PNGs from [flagcdn.com](https://flagcdn.com) cached in `public/` — the game runs fully offline

## Getting started

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

Flag images are committed in `public/flags` (w160) and `public/flags-lg` (w320). To refresh or re-download them:

```bash
pnpm download:flags           # idempotent; skips valid existing files
pnpm download:flags --force   # re-download everything
```

The script validates the static country list against flagcdn's `codes.json`, downloads with concurrency 8 and retries, and verifies PNG signatures (390 files).

Production build:

```bash
pnpm build          # typecheck + vite build -> dist/
pnpm preview        # serve dist/ locally
```

## URL parameters

| Param      | Example         | Effect                                                                |
| ---------- | --------------- | --------------------------------------------------------------------- |
| `seed`     | `?seed=abc`     | Reproducible round; integer or string (hashed). Random if omitted.    |
| `duration` | `?duration=120` | Target round length in seconds (20–14400). Default 3600.             |
| `debug`    | `?debug=1`      | FPS / phase / alive / holes / pressure overlay.                       |

Combine: `?seed=test&duration=120&debug=1`

## Implementation notes

### Hole rendering (single draw call)

The arena floor is one `CircleGeometry` disc with a `ShaderMaterial`. Holes are a uniform array of up to 64 `vec4(x, y, animatedRadius, rimIntensity)`; the fragment shader `discard`s fragments inside a hole circle and paints a hot orange rim band (`smoothstep(r+0.55, r+0.06, d)`) around it. Animated radii/rim intensities are computed on the CPU each step. Because the disc is opaque with `depthWrite`, falling flags are hidden by the floor except where fragments were discarded — correct occlusion for free. Hole lifecycles run in `src/game/HoleManager.ts`; the shader lives in `src/game/Arena.ts`.

### Simulation step (src/game/Simulation.ts, dt = 1/60)

1. **Drift** — OU-style wander: velocity kick + exponential damping + 0.6 m/s speed clamp.
2. **Separation** — pairwise soft repulsion below 1.1u (O(n²) ≈ 19k pairs at 195 flags — trivial) plus a hard de-stack for deep overlaps.
3. **Wall bounce** at `R - 0.35` with restitution 0.6.
4. **Hole lifecycle** update (radii/rim).
5. **Capture** — flags inside an open hole become falling; survivor guard applied.
6. **Falling** — gravity 22, tumble ±2–5 rad/s, opacity fades from y=-6 to -12, removed at y=-14.
7. **Champion check** — at `alive == 1`, emit the champion event.

Flags are children of the spinning `arenaGroup` while alive (they inherit the spin); captured flags are reparented to the scene via `scene.attach()` so their fall is in world space.

### Camera (src/game/CameraDirector.ts)

Exponentially smoothed orbital rig, independent of disc spin: intro (far, slow) → battle (distance 42, height 30, 0.02 rad/s orbit) → champion (tight 4.6u-radius, 2.3u-height orbit tracking the winner's world position while the disc eases to a stop).

### UI overlay (src/ui/)

DOM overlay with `pointer-events: none` everywhere except the restart button: HUD (alive count, elapsed/target clock, progress bar), right-hand elimination feed (capped at 60 rows, mini flags), center toasts (single + mass-elimination + sudden-death variants), intro countdown, champion screen, and a 2D-canvas confetti whose palette is sampled from the champion flag's pixels.

## Verification

Headless harnesses (no DOM/WebGL — pure sim stack, bundled with esbuild):

```bash
pnpm exec esbuild scripts/headless-check.ts \
  --bundle --platform=node --format=esm --outfile=/tmp/check.mjs && node /tmp/check.mjs
```

- `scripts/headless-check.ts` — 10 seeded rounds at `duration=120`: exactly 1 champion every time, valid place permutation (194 eliminations + champion), rounds land within ±15% of target, same seed gives identical order.
- `scripts/headless-edge.ts` — edge durations (20/30/60/600s) all terminate with exactly one winner.
- `scripts/headless-trace.ts` — prints alive vs. ideal curve every 30s for tuning.

In-browser: `window.__flagBattle.runHeadless(seed, seconds)` from the console.

## Project structure

```
├── index.html                  # canvas + overlay DOM
├── package.json  vite.config.ts  tsconfig.json
├── scripts/
│   ├── download-flags.mjs      # flagcdn fetcher (concurrency 8, retries, idempotent)
│   └── headless-*.ts           # verification harnesses
├── public/
│   ├── flags/                  # 195 x w160 (arena + feed)
│   └── flags-lg/               # 195 x w320 (champion + confetti)
└── src/
    ├── main.ts                 # URL params (?seed=&duration=&debug=), bootstrap
    ├── config.ts               # all tunables in one place
    ├── types.ts  events.ts  rng.ts  headless.ts
    ├── data/countries.ts       # static 195 (193 UN + va + ps)
    ├── game/
    │   ├── Game.ts             # phases boot→intro→battle→champion; fixed-step loop; restart()
    │   ├── Arena.ts            # disc + hole shader + void
    │   ├── HoleManager.ts      # hole lifecycle state machine
    │   ├── Simulation.ts       # drift/separation/bounce/capture/falling
    │   ├── Flag.ts  FlagManager.ts  Textures.ts
    │   ├── PacingController.ts # kill-debt pacing, hunt mode, sudden death
    │   └── CameraDirector.ts
    └── ui/                     # Hud, EliminationFeed, Toast, IntroOverlay,
        └── ...                 # ChampionScreen, Confetti + styles/main.css
```

## Deployment

Static output from `dist/` (built with `base: './'`, so any subpath works).

**Vercel** (current live deployment):

```bash
npm i -g vercel
vercel deploy --prod
```

**Cloudflare Pages**:

```bash
npm i -g wrangler
pnpm build
wrangler pages deploy dist --project-name flag-battle
```

Both free tiers are sufficient (static assets only: ~2 MB of flags + ~130 KB gzipped JS).
