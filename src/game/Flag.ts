import * as THREE from 'three';
import type { Country } from '../types';

export type FlagState = 'alive' | 'falling' | 'dead';

/**
 * One country's flag: an upright double-sided plane with its pivot at the
 * bottom. `pos` is the flag's position in disc-local sim space (x -> x, y -> z);
 * the mesh itself is a child of the spinning arena group while alive.
 */
export class Flag {
  readonly country: Country;
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly pos = new THREE.Vector2();
  readonly vel = new THREE.Vector2();
  state: FlagState = 'alive';
  /** Final placement (1 = champion); 0 while still alive. */
  place = 0;

  // Scripted fall params.
  fallVy = 0;
  tumbleX = 0;
  tumbleZ = 0;

  // Idle wobble params (cosmetic).
  wobblePhase = 0;
  wobbleSpeed = 1;

  constructor(country: Country, geometry: THREE.BufferGeometry, texture: THREE.Texture) {
    this.country = country;
    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = true;
  }

  get code(): string {
    return this.country.code;
  }

  get name(): string {
    return this.country.name;
  }

  dispose(): void {
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
