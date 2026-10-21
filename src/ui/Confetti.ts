/**
 * Fullscreen 2D-canvas confetti, colored from pixels of the champion's flag.
 * Visual-only: uses Math.random freely, never the seeded sim RNG.
 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
}

const FALLBACK_PALETTE = ['#ff7a1a', '#e8e8ef', '#4c7dff', '#ffd23f', '#ff4d6d'];

export class Confetti {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private raf: number | null = null;
  private runningUntil = 0;
  private lastT = 0;
  private spawnBudget = 0;

  constructor() {
    this.canvas = document.getElementById('confetti') as HTMLCanvasElement;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('confetti canvas 2d context unavailable');
    this.ctx = ctx;
    window.addEventListener('resize', () => this.resize());
  }

  /** Sample the palette from the champion's w320 flag image. */
  private paletteFromFlag(code: string): Promise<string[]> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 32;
          c.height = Math.max(1, Math.round((32 * img.naturalHeight) / Math.max(1, img.naturalWidth)));
          const cx = c.getContext('2d');
          if (!cx) throw new Error('no 2d');
          cx.drawImage(img, 0, 0, c.width, c.height);
          const data = cx.getImageData(0, 0, c.width, c.height).data;
          const colors: string[] = [];
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 160) continue;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            if (lum < 40 || lum > 236) continue; // skip near-black/near-white noise
            const hex = `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
            if (!colors.includes(hex)) colors.push(hex);
            if (colors.length >= 8) break;
          }
          resolve(colors.length >= 3 ? colors : FALLBACK_PALETTE);
        } catch {
          resolve(FALLBACK_PALETTE);
        }
      };
      img.onerror = () => resolve(FALLBACK_PALETTE);
      img.src = `flags-lg/${code}.png`;
    });
  }

  async launch(code: string, durationMs = 12000): Promise<void> {
    const palette = await this.paletteFromFlag(code);
    this.setPalette(palette);
    this.resize();
    this.stop();
    this.runningUntil = performance.now() + durationMs;
    this.spawnBudget = 40;
    this.particles = [];
    this.lastT = performance.now();
    this.loop();
  }

  private loop = (): void => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const { width: w, height: h } = this.canvas;

    if (now < this.runningUntil && this.spawnBudget > 0) {
      // Emit a burst of new particles per frame until the budget runs out.
      const burst = Math.min(this.spawnBudget, 4);
      for (let i = 0; i < burst; i++) this.spawn(w);
      this.spawnBudget -= burst;
    }

    this.ctx.clearRect(0, 0, w, h);
    const g = 260;
    this.particles = this.particles.filter((p) => {
      p.vy += g * dt;
      p.vx *= 1 - 0.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > h + 30) return false;
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rot);
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      this.ctx.restore();
      return true;
    });

    if (this.particles.length > 0 || now < this.runningUntil) {
      this.raf = requestAnimationFrame(this.loop);
    } else {
      this.ctx.clearRect(0, 0, w, h);
      this.raf = null;
    }
  };

  private spawn(w: number): void {
    const palette = this.paletteCache;
    const color = palette.length > 0 ? palette[Math.floor(Math.random() * palette.length)] : FALLBACK_PALETTE[0];
    this.particles.push({
      x: Math.random() * w,
      y: -20 - Math.random() * 80,
      vx: (Math.random() - 0.5) * 90,
      vy: 60 + Math.random() * 140,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 9,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      color,
    });
  }

  private paletteCache: string[] = FALLBACK_PALETTE;

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  stop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    this.particles = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setPalette(palette: string[]): void {
    this.paletteCache = palette.length > 0 ? palette : FALLBACK_PALETTE;
  }
}
