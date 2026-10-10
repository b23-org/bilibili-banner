export class PointerTracker {
  private container: HTMLElement | null = null;
  private normalizedDisplacementX = 0;
  private pointerAnchorClientX = 0;
  private isPointerActiveInBanner = false;
  private resetAnimationFrameId = 0;

  private readonly boundMouseEnter: (e: MouseEvent) => void;
  private readonly boundMouseMove: (e: MouseEvent) => void;
  private readonly boundMouseLeave: () => void;
  private readonly boundBlur: () => void;

  constructor(private readonly onUpdate: (dx: number) => void) {
    this.boundMouseEnter = this.handleMouseEnter.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseLeave = this.handleMouseLeave.bind(this);
    this.boundBlur = this.handleBlur.bind(this);
  }

  public get dx(): number {
    return this.normalizedDisplacementX;
  }

  public get isResetting(): boolean {
    return this.resetAnimationFrameId !== 0;
  }

  public attach(container: HTMLElement): void {
    this.container = container;
    this.container.addEventListener("mouseenter", this.boundMouseEnter);
    this.container.addEventListener("mousemove", this.boundMouseMove);
    this.container.addEventListener("mouseleave", this.boundMouseLeave);
    window.addEventListener("blur", this.boundBlur);
  }

  public detach(): void {
    if (this.container) {
      this.container.removeEventListener("mouseenter", this.boundMouseEnter);
      this.container.removeEventListener("mousemove", this.boundMouseMove);
      this.container.removeEventListener("mouseleave", this.boundMouseLeave);
    }
    window.removeEventListener("blur", this.boundBlur);

    if (this.resetAnimationFrameId) {
      cancelAnimationFrame(this.resetAnimationFrameId);
      this.resetAnimationFrameId = 0;
    }

    this.container = null;
    this.normalizedDisplacementX = 0;
    this.pointerAnchorClientX = 0;
    this.isPointerActiveInBanner = false;
  }

  private handleMouseEnter(e: MouseEvent): void {
    this.isPointerActiveInBanner = true;
    this.pointerAnchorClientX = e.clientX;
    if (this.resetAnimationFrameId) {
      cancelAnimationFrame(this.resetAnimationFrameId);
      this.resetAnimationFrameId = 0;
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.container || this.container.clientWidth <= 0) return;

    if (!this.isPointerActiveInBanner) {
      this.isPointerActiveInBanner = true;
      this.pointerAnchorClientX = e.clientX;
    }

    this.normalizedDisplacementX =
      (e.clientX - this.pointerAnchorClientX) / this.container.clientWidth;
    this.onUpdate(this.normalizedDisplacementX);
  }

  private handleMouseLeave(): void {
    this.startResetAnimation();
  }

  private handleBlur(): void {
    this.startResetAnimation();
  }

  private startResetAnimation(): void {
    this.isPointerActiveInBanner = false;
    this.pointerAnchorClientX = 0;

    if (this.resetAnimationFrameId) {
      cancelAnimationFrame(this.resetAnimationFrameId);
      this.resetAnimationFrameId = 0;
    }

    const startDisplacementX = this.normalizedDisplacementX;
    if (Math.abs(startDisplacementX) < 0.0001) {
      this.normalizedDisplacementX = 0;
      this.onUpdate(0);
      return;
    }

    const startTime = performance.now();
    const RESET_ANIMATION_MS = 200;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      if (elapsed < RESET_ANIMATION_MS) {
        this.normalizedDisplacementX =
          startDisplacementX * (1 - elapsed / RESET_ANIMATION_MS);
        this.onUpdate(this.normalizedDisplacementX);
        this.resetAnimationFrameId = requestAnimationFrame(animate);
      } else {
        this.normalizedDisplacementX = 0;
        this.resetAnimationFrameId = 0;
        this.onUpdate(0);
      }
    };

    this.resetAnimationFrameId = requestAnimationFrame(animate);
  }
}
