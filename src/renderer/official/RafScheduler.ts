export class RafScheduler {
  private rafId = 0;
  private isRunning = false;
  private isDirty = false;
  private readonly frameCallback: (now: number) => void;

  constructor(private readonly onRender: (now: number) => boolean) {
    this.frameCallback = this.tick.bind(this);
  }

  public markDirty(): void {
    this.isDirty = true;
    if (this.isRunning && !this.rafId) {
      this.rafId = requestAnimationFrame(this.frameCallback);
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isDirty = true;
    this.rafId = requestAnimationFrame(this.frameCallback);
  }

  public stop(): void {
    this.isRunning = false;
    this.isDirty = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private tick(now: number): void {
    this.rafId = 0;
    if (!this.isRunning) return;

    this.isDirty = false;
    // 执行单帧渲染，返回 true 表示仍需继续执行动画（如回弹中或存在活跃多帧动画）
    const keepAnimating = this.onRender(now);

    if (keepAnimating || this.isDirty) {
      this.rafId = requestAnimationFrame(this.frameCallback);
    }
  }
}
