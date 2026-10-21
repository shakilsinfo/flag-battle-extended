import * as THREE from 'three';
import type { Config } from '../config';

export const MAX_HOLES = 64;

const FLOOR_VERT = /* glsl */ `
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Floor of the arena: a single opaque disc. Holes are `discard`ed in the
 * fragment shader from a uniform array of vec4(x, y, animatedRadius, rimIntensity).
 * `vLocal` is disc-local floor space (mesh is only rotated, geometry untouched),
 * so hole centers are fed as (simX, -simZ): rotation.x = -PI/2 maps local +Y to world -Z.
 */
const FLOOR_FRAG = /* glsl */ `
uniform vec4 uHoles[${MAX_HOLES}];
uniform int uHoleCount;
uniform float uRadius;
varying vec2 vLocal;

void main() {
  float dCenter = length(vLocal);

  // Base: darker toward the rim, brighter at the center.
  vec3 base = mix(vec3(0.30, 0.31, 0.36), vec3(0.115, 0.12, 0.145), smoothstep(0.0, uRadius, dCenter));

  // Faint concentric rings: motion reference so the spin reads on camera.
  float ringPhase = abs(fract(dCenter / 2.5) - 0.5) * 2.0;
  base *= 1.0 - smoothstep(0.9, 1.0, ringPhase) * 0.16;

  // Slight edge falloff into the rim.
  base *= 1.0 - smoothstep(uRadius - 0.7, uRadius, dCenter) * 0.45;

  vec3 glow = vec3(0.0);
  for (int i = 0; i < ${MAX_HOLES}; i++) {
    if (i >= uHoleCount) break;
    vec4 h = uHoles[i];
    float r = h.z;
    if (r < 0.02) continue;
    float d = distance(vLocal, h.xy);
    if (d < r - 0.02) discard;
    // Hot orange rim band just outside the hole edge.
    float rim = smoothstep(r + 0.55, r + 0.06, d) * step(r, d);
    glow += vec3(1.0, 0.42, 0.1) * rim * h.w;
  }

  vec3 col = base + glow;
  // Dither to kill banding on the smooth radial gradient.
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += dither * 0.006;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Arena {
  readonly group = new THREE.Group();
  readonly floorUniforms: {
    uHoles: { value: THREE.Vector4[] };
    uHoleCount: { value: number };
    uRadius: { value: number };
  };

  private spinFactor = 1;

  constructor(scene: THREE.Scene, private config: Config) {
    const { radius, segments, voidDepth, rimHeight } = config.arena;

    const floorMat = new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      uniforms: {
        uHoles: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0, 0, 0)) },
        uHoleCount: { value: 0 },
        uRadius: { value: radius },
      },
    });
    this.floorUniforms = floorMat.uniforms as Arena['floorUniforms'];

    const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, segments), floorMat);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // Puck rim just below the disc edge so the floor reads as solid from the side.
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, rimHeight, segments, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x14151a, side: THREE.DoubleSide })
    );
    rim.position.y = -rimHeight / 2;
    this.group.add(rim);

    scene.add(this.group);

    // The void below: dark floor far down + walls, visible through holes.
    const voidFloor = new THREE.Mesh(
      new THREE.CircleGeometry(radius + 3, 64),
      new THREE.MeshBasicMaterial({ color: 0x060609 })
    );
    voidFloor.rotation.x = -Math.PI / 2;
    voidFloor.position.y = -voidDepth - 0.1;
    scene.add(voidFloor);

    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.02, radius + 0.02, voidDepth + rimHeight, segments, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x0a0a10, side: THREE.DoubleSide })
    );
    wall.position.y = -(voidDepth + rimHeight) / 2;
    scene.add(wall);
  }

  update(dt: number): void {
    this.group.rotation.y += this.config.arena.spinOmega * this.spinFactor * dt;
  }

  /** Champion sequence: ease the disc to a stop. */
  easeSpinToZero(dt: number): void {
    this.spinFactor = Math.max(0, this.spinFactor - dt / 3.2);
  }

  resetSpin(): void {
    this.spinFactor = 1;
  }
}
