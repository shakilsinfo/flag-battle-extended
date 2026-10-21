import * as THREE from 'three';
import type { Country } from '../types';

/** Loads and caches one THREE.Texture per country from public/flags (w160). */
export class TextureStore {
  readonly textures = new Map<string, THREE.Texture>();
  readonly failed = new Set<string>();

  load(
    countries: Country[],
    anisotropy: number,
    onProgress: (loaded: number, total: number) => void
  ): Promise<void> {
    const total = countries.length;
    let settled = 0;
    const jobs = countries.map(
      (c) =>
        new Promise<void>((resolve) => {
          const url = `flags/${c.code}.png`;
          const img = new Image();
          img.onload = () => {
            const tex = new THREE.Texture(img);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = anisotropy;
            tex.needsUpdate = true;
            this.textures.set(c.code, tex);
            settled++;
            onProgress(settled, total);
            resolve();
          };
          img.onerror = () => {
            this.failed.add(c.code);
            settled++;
            onProgress(settled, total);
            resolve();
          };
          img.src = url;
        })
    );
    return Promise.all(jobs).then(() => undefined);
  }
}
