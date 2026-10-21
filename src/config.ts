export interface Config {
  arena: {
    radius: number;
    spinOmega: number;
    voidDepth: number;
    rimHeight: number;
    segments: number;
  };
  holes: {
    minR: number;
    maxR: number;
    maxConcurrent: number;
    spawnBaseS: number;
    minIntervalS: number;
    maxIntervalS: number;
    warningS: number;
    openingS: number;
    closingS: number;
    holdMinS: number;
    holdMaxS: number;
    edgeMargin: number;
    captureInset: number;
    /** Minimum animated radius for a hole to be able to capture (during opening). */
    minCaptureRadius: number;
  };
  pacing: {
    targetDurationS: number;
    /** Spawn when kill-debt exceeds expected pending captures by this margin. */
    spawnDebtMargin: number;
    /** Credit factor for flags under holes already in their hold phase. */
    pendingHoldFactor: number;
    /** Backlog (in expected kills) at which hole size saturates at maxR. */
    sizeBacklogFull: number;
    /** Floor between spawns so holes never machine-gun. */
    minSpawnGapS: number;
    huntThreshold: number;
    huntIntervalS: number;
    huntHoleR: number;
    huntHoldS: number;
    suddenDeathFactor: number;
    suddenDeathIntervalS: number;
    densityCandidates: number;
  };
  sim: {
    timestep: number;
    maxCatchupS: number;
    driftAccel: number;
    driftDamp: number;
    maxSpeed: number;
    separationRadius: number;
    separationStrength: number;
    minSpacing: number;
    wallInset: number;
    wallRestitution: number;
    gravity: number;
    tumbleMin: number;
    tumbleMax: number;
    fadeStartY: number;
    fadeEndY: number;
    removeY: number;
  };
  flags: {
    width: number;
    height: number;
    wobbleAmp: number;
    wobbleSpeedMin: number;
    wobbleSpeedMax: number;
  };
  camera: {
    fov: number;
    introDist: number;
    introHeight: number;
    battleDist: number;
    battleHeight: number;
    orbitOmega: number;
    smoothing: number;
    championDist: number;
    championHeight: number;
    championOmega: number;
    championSmoothing: number;
  };
  intro: {
    durationS: number;
  };
  ui: {
    feedMaxRows: number;
    toastMaxVisible: number;
    toastLifeS: number;
    massToastThreshold: number;
  };
}

export const DEFAULT_CONFIG: Config = {
  arena: {
    radius: 20,
    spinOmega: 0.06,
    voidDepth: 14,
    rimHeight: 0.5,
    segments: 96,
  },
  holes: {
    minR: 1.2,
    maxR: 3.0,
    maxConcurrent: 24,
    spawnBaseS: 3.2,
    minIntervalS: 0.55,
    maxIntervalS: 14,
    warningS: 0.8,
    openingS: 1.2,
    closingS: 1.0,
    holdMinS: 5,
    holdMaxS: 9,
    edgeMargin: 0.4,
    captureInset: 0.05,
    minCaptureRadius: 0.3,
  },
  pacing: {
    targetDurationS: 3600,
    spawnDebtMargin: 1.2,
    pendingHoldFactor: 0.45,
    sizeBacklogFull: 8,
    minSpawnGapS: 0.55,
    huntThreshold: 8,
    huntIntervalS: 3.0,
    huntHoleR: 1.35,
    huntHoldS: 3.5,
    suddenDeathFactor: 1.2,
    suddenDeathIntervalS: 2.5,
    densityCandidates: 8,
  },
  sim: {
    timestep: 1 / 60,
    maxCatchupS: 1,
    driftAccel: 11,
    driftDamp: 1.0,
    maxSpeed: 0.6,
    separationRadius: 1.1,
    separationStrength: 4.5,
    minSpacing: 1.15,
    wallInset: 0.35,
    wallRestitution: 0.6,
    gravity: 22,
    tumbleMin: 2,
    tumbleMax: 5,
    fadeStartY: -6,
    fadeEndY: -12,
    removeY: -14,
  },
  flags: {
    width: 1.1,
    height: 0.72,
    wobbleAmp: 0.06,
    wobbleSpeedMin: 0.9,
    wobbleSpeedMax: 1.6,
  },
  camera: {
    fov: 50,
    introDist: 60,
    introHeight: 44,
    battleDist: 42,
    battleHeight: 30,
    orbitOmega: 0.02,
    smoothing: 1.8,
    championDist: 4.6,
    championHeight: 2.3,
    championOmega: 0.32,
    championSmoothing: 1.6,
  },
  intro: {
    durationS: 5,
  },
  ui: {
    feedMaxRows: 60,
    toastMaxVisible: 3,
    toastLifeS: 2.4,
    massToastThreshold: 5,
  },
};
