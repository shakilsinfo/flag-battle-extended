import * as THREE from 'three';
import type { Config } from '../config';
import type { Phase } from '../types';
import type { Flag } from './Flag';

/**
 * Exponentially smoothed orbital camera rig, fully independent of the disc
 * spin. Modes: intro (far, slow), battle (orbital), champion (tight low orbit
 * tracking the winning flag's world position).
 */
export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  private orbitAngle = 0.7;
  private readonly lookTarget = new THREE.Vector3(0, 0.5, 0);
  private readonly desiredPos = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(private config: Config, aspect: number) {
    const { fov } = config.camera;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 500);
    this.camera.position.set(
      config.camera.introDist * 0.8,
      config.camera.introHeight,
      config.camera.introDist * 0.6
    );
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, phase: Phase, championFlag: Flag | null): void {
    const cfg = this.config.camera;
    let smoothing = cfg.smoothing;

    if (phase === 'champion' && championFlag) {
      championFlag.mesh.getWorldPosition(this.tmp);
      this.desiredTarget.set(this.tmp.x, this.tmp.y + 0.55, this.tmp.z);
      this.orbitAngle += cfg.championOmega * dt;
      this.desiredPos.set(
        this.desiredTarget.x + Math.cos(this.orbitAngle) * cfg.championDist,
        this.desiredTarget.y + cfg.championHeight,
        this.desiredTarget.z + Math.sin(this.orbitAngle) * cfg.championDist
      );
      smoothing = cfg.championSmoothing;
    } else {
      const intro = phase === 'boot' || phase === 'intro';
      const dist = intro ? cfg.introDist : cfg.battleDist;
      const height = intro ? cfg.introHeight : cfg.battleHeight;
      this.orbitAngle += cfg.orbitOmega * dt;
      this.desiredTarget.set(0, intro ? 0 : 0.5, 0);
      this.desiredPos.set(
        Math.cos(this.orbitAngle) * dist,
        height,
        Math.sin(this.orbitAngle) * dist
      );
    }

    const s = 1 - Math.exp(-smoothing * dt);
    this.camera.position.lerp(this.desiredPos, s);
    this.lookTarget.lerp(this.desiredTarget, s);
    this.camera.lookAt(this.lookTarget);
  }
}
