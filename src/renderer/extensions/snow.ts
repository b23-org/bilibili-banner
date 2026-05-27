import { waitForMedia } from "../helper";
import type { BannerExtension, BannerExtensionContext } from "./core";

const SNOW_TEXTURES = ["assets/extensions/snow/snowflake.png"] as const;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

interface SnowParticle {
  x: number;
  y: number;
  z: number;
  size: number;
  speed: number;
}

export class SnowParticleSystem {
  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private textures: HTMLImageElement[] = [];
  private particles: SnowParticle[] = [];
  private rafId = 0;
  private recoveryRafId = 0;
  private dpr = 1;

  private windForce = 0;
  private currentDisplacement = 0;
  private isHovering = false;
  private mouseClientX = 0;
  private lastFrameMouseX = 0;
  private lastFrameTime = 0;

  private destroyed = false;
  private started = false;

  private readonly boundMouseMove: (e: MouseEvent) => void;
  private readonly boundMouseEnter: () => void;
  private readonly boundMouseLeave: () => void;
  private readonly boundResize: () => void;
  private readonly boundBlur: () => void;
  private readonly boundFocus: () => void;

  constructor() {
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseEnter = this.handleMouseEnter.bind(this);
    this.boundMouseLeave = this.handleMouseLeave.bind(this);
    this.boundResize = this.handleResize.bind(this);
    this.boundBlur = this.handleBlur.bind(this);
    this.boundFocus = this.handleFocus.bind(this);
  }

  async start(
    container: HTMLElement,
    srcs: string[],
    signal?: AbortSignal,
  ): Promise<void> {
    const textures = await this.loadTextures(srcs, signal);
    await this.startWithTextures(container, textures, signal);
  }

  async startWithTextures(
    container: HTMLElement,
    textures: HTMLImageElement[],
    signal?: AbortSignal,
  ): Promise<void> {
    if (!container || this.destroyed || signal?.aborted) return;
    this.container = container;
    this.dpr = window.devicePixelRatio || 1;

    try {
      this.textures = textures;
      if (this.destroyed || signal?.aborted) return;
      this.createCanvas();
      if (this.destroyed || signal?.aborted) return;
      this.initParticles();
      this.bindEvents();
      this.startLoop();
    } catch (e) {
      // 粒子系统加载失败不应影响 Banner 主体的失败判定
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      console.warn("[SnowParticleSystem] 初始化失败:", e);
      this.destroy();
    }
  }

  private async loadTextures(
    srcs: string[],
    signal?: AbortSignal,
  ): Promise<HTMLImageElement[]> {
    return Promise.all(
      srcs.map(async (src) => {
        const img = new Image();
        img.src = src;
        await waitForMedia(img, signal);
        return img;
      }),
    );
  }

  private createCanvas(): void {
    if (!this.container) return;
    const container = this.container;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "particle-canvas";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d")!;
    this.resizeCanvas();
  }

  private resizeCanvas(): void {
    if (!this.canvas || !this.ctx || !this.container) return;
    const w = this.container.offsetWidth;
    const h = this.container.offsetHeight;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private initParticles(): void {
    if (!this.canvas) return;
    const count = Math.floor(500 / this.dpr);
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    this.particles = [];
    for (let i = 0; i < count; i++) {
      const z = (9 * Math.random() + 1) * Math.exp(-0.1);
      this.particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z,
        size: 1 / z,
        speed: 2 / z,
      });
    }
  }

  private bindEvents(): void {
    if (!this.container) return;
    this.container.addEventListener("mousemove", this.boundMouseMove);
    this.container.addEventListener("mouseenter", this.boundMouseEnter);
    this.container.addEventListener("mouseleave", this.boundMouseLeave);
    window.addEventListener("resize", this.boundResize);
    window.addEventListener("blur", this.boundBlur);
    window.addEventListener("focus", this.boundFocus);
  }

  private startLoop(): void {
    if (this.started) return;
    this.started = true;
    const loop = (now: number) => {
      if (this.destroyed) return;
      this.renderFrame(now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private renderFrame(now: number): void {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const cw = this.canvas.width / this.dpr;
    const ch = this.canvas.height / this.dpr;

    // 1. 风力计算
    if (this.isHovering) {
      const dt = now - this.lastFrameTime;
      const velocity =
        dt > 0 && this.mouseClientX !== 0 && this.lastFrameMouseX !== 0
          ? (this.mouseClientX - this.lastFrameMouseX) / dt / 2
          : 0;
      this.windForce = (this.windForce - clamp(velocity, -1, 1)) / 2;
    }
    this.lastFrameMouseX = this.mouseClientX;
    this.lastFrameTime = now;

    // 2. 清除画布
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cw, ch);

    // 3. 应用形变矩阵
    const hw = 0.5 * this.windForce;
    ctx.setTransform(this.dpr, hw * this.dpr, hw * this.dpr, this.dpr, 0, 0);

    // 4. 计算逆矩阵
    const det = 1 - hw * hw;
    const inv: [number, number, number, number, number, number] = [
      1 / det,
      -hw / det,
      0,
      -hw / det,
      1 / det,
      0,
    ];

    // 5. 深度阈值
    const depthThreshold = (this.currentDisplacement / 2 + 0.5) ** 4;

    // 6. 绘制粒子
    const texture = this.textures[0];
    if (!texture) return;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];

      // 淡出效果
      if (i / this.particles.length > depthThreshold) {
        ctx.globalAlpha =
          1 - clamp(5 * (i / this.particles.length - depthThreshold), 0, 1);
      }

      // 物理更新
      p.y += p.speed;
      p.x += this.windForce * p.speed * 10;

      // 边界重置
      if (p.y > ch) {
        p.x = (Math.random() - this.windForce) * cw;
        p.y = -25;
      }

      // 逆矩阵映射
      const sx = inv[0] * p.x + inv[1] * p.y + inv[2];
      const sy = inv[3] * p.x + inv[4] * p.y + inv[5];
      const renderSize = 25 * 1.18 ** -p.z;

      ctx.drawImage(texture, sx, sy, renderSize, renderSize);
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    this.mouseClientX = e.clientX;
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    this.currentDisplacement = x * 2 - 1; // [-1, 1]
  }

  private handleMouseEnter(): void {
    this.isHovering = true;
    cancelAnimationFrame(this.recoveryRafId);
  }

  private handleMouseLeave(): void {
    this.isHovering = false;
    const startTime = performance.now();
    const startDisplacement = this.currentDisplacement;

    const smooth = (now: number) => {
      const elapsed = now - startTime;
      if (elapsed < 200) {
        this.currentDisplacement = startDisplacement * (1 - elapsed / 200);
        this.windForce = Math.sin((elapsed / 200) * Math.PI);
        if (startDisplacement < 0) this.windForce *= -1;
        this.recoveryRafId = requestAnimationFrame(smooth);
      } else {
        this.currentDisplacement = 0;
        this.windForce = 0;
      }
    };
    this.recoveryRafId = requestAnimationFrame(smooth);
  }

  private handleResize(): void {
    this.resizeCanvas();
    if (this.canvas) this.initParticles();
  }

  private handleBlur(): void {
    cancelAnimationFrame(this.rafId);
    this.started = false;
  }

  private handleFocus(): void {
    this.startLoop();
  }

  destroy(): void {
    this.destroyed = true;
    this.started = false;
    cancelAnimationFrame(this.rafId);
    cancelAnimationFrame(this.recoveryRafId);

    if (this.container) {
      this.container.removeEventListener("mousemove", this.boundMouseMove);
      this.container.removeEventListener("mouseenter", this.boundMouseEnter);
      this.container.removeEventListener("mouseleave", this.boundMouseLeave);
    }
    window.removeEventListener("resize", this.boundResize);
    window.removeEventListener("blur", this.boundBlur);
    window.removeEventListener("focus", this.boundFocus);

    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.container = null;

    for (const img of this.textures) {
      img.removeAttribute("src");
    }
    this.textures = [];
    this.particles = [];
  }
}

export default class SnowExtension implements BannerExtension {
  private textures: HTMLImageElement[] = [];
  private system: SnowParticleSystem | null = null;

  private disposeSystem(): void {
    this.system?.destroy();
    this.system = null;
  }

  async prepare(_context: BannerExtensionContext): Promise<boolean> {
    this.textures = await Promise.all(
      SNOW_TEXTURES.map(async (src) => {
        const img = new Image();
        img.src = src;
        await waitForMedia(img, _context.signal);
        return img;
      }),
    );
    return true;
  }

  async mount(context: BannerExtensionContext): Promise<void> {
    this.disposeSystem();

    const system = new SnowParticleSystem();
    this.system = system;
    await system.startWithTextures(
      context.bannerEl,
      this.textures,
      context.signal,
    );
  }

  dispose(): void {
    this.disposeSystem();
    for (const texture of this.textures) {
      texture.removeAttribute("src");
    }
    this.textures = [];
  }
}
