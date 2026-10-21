import * as THREE from 'three';
import type { Config } from '../config';
import type { Rng } from '../rng';
import { randRange } from '../rng';
import { COUNTRIES } from '../data/countries';
import { Flag } from './Flag';
import type { TextureStore } from './Textures';

/** Creates, scatters and tracks the 195 flag meshes. */
export class FlagManager {
  readonly flags: Flag[] = [];
  private geometry: THREE.PlaneGeometry;

  constructor(
    private arenaGroup: THREE.Group,
    private scene: THREE.Scene,
    private store: TextureStore,
    private config: Config
  ) {
    const { width, height } = config.flags;
    this.geometry = new THREE.PlaneGeometry(width, height);
    // Pivot at the bottom of the flag.
    this.geometry.translate(0, height / 2, 0);
  }

  get aliveCount(): number {
    let n = 0;
    for (const f of this.flags) if (f.state === 'alive') n++;
    return n;
  }

  get aliveFlags(): Flag[] {
    return this.flags.filter((f) => f.state === 'alive');
  }

  /** (Re)scatter all flags with deterministic rejection sampling. */
  scatter(rng: Rng): void {
    this.clear();
    const { radius } = this.config.arena;
    const { minSpacing, wallInset } = this.config.sim;
    const { wobbleSpeedMin, wobbleSpeedMax } = this.config.flags;

    const usableR = radius - wallInset - 0.3;
    for (const country of COUNTRIES) {
      const tex = this.store.textures.get(country.code);
      if (!tex) continue;
      const flag = new Flag(country, this.geometry, tex);

      // Rejection sampling for minimum spacing; on extreme crowding the
      // last candidate is accepted as-is.
      let x = 0;
      let z = 0;
      for (let attempt = 0; attempt < 300; attempt++) {
        const r = usableR * Math.sqrt(rng());
        const theta = rng() * Math.PI * 2;
        x = r * Math.cos(theta);
        z = r * Math.sin(theta);
        let ok = true;
        for (const other of this.flags) {
          const dx = other.pos.x - x;
          const dz = other.pos.y - z;
          if (dx * dx + dz * dz < minSpacing * minSpacing) {
            ok = false;
            break;
          }
        }
        if (ok) break;
      }

      flag.pos.set(x, z);
      flag.vel.set((rng() - 0.5) * 0.2, (rng() - 0.5) * 0.2);
      flag.wobblePhase = rng() * Math.PI * 2;
      flag.wobbleSpeed = randRange(rng, wobbleSpeedMin, wobbleSpeedMax);

      flag.mesh.position.set(x, 0, z);
      // Face outward from the arena center.
      flag.mesh.rotation.y = Math.atan2(x, z);
      this.arenaGroup.add(flag.mesh);
      this.flags.push(flag);
    }
  }

  /** Detach a captured flag into world space for its scripted fall. */
  detachToScene(flag: Flag): void {
    this.scene.attach(flag.mesh);
  }

  /** Cosmetic wobble; render-frame only, does not affect the sim. */
  updateVisuals(simTime: number): void {
    const { wobbleAmp } = this.config.flags;
    for (const f of this.flags) {
      if (f.state !== 'alive') continue;
      f.mesh.rotation.z = Math.sin(simTime * f.wobbleSpeed + f.wobblePhase) * wobbleAmp;
    }
  }

  clear(): void {
    for (const f of this.flags) f.dispose();
    this.flags.length = 0;
  }

  dispose(): void {
    this.clear();
    this.geometry.dispose();
  }
}
