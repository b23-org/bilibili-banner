import type { ResourceResult } from "./preload";

export class AssetMap {
  private readonly results: ReadonlyMap<string, ResourceResult>;
  private readonly taken = new Set<string>();
  private readonly cleanups: Array<() => void>;
  private disposed = false;

  constructor(
    results: Map<string, ResourceResult>,
    initialCleanups: Array<() => void> = [],
  ) {
    this.results = results;
    this.cleanups = initialCleanups;
  }

  public get(src: string): ResourceResult | undefined {
    return this.results.get(src);
  }

  public has(src: string): boolean {
    return this.results.has(src);
  }

  /**
   * 索取 DOM 渲染元素
   * - 首次调用：返回原始节点
   * - 重复调用：调用 cloneNode(true) 克隆节点
   * - 若为视频克隆节点，显式补全 clone.muted = true，并注册解码器释放清理回调
   */
  public takeElement(src: string): HTMLImageElement | HTMLVideoElement {
    if (this.disposed) {
      throw new Error(`[AssetMap] Cannot take element after dispose: ${src}`);
    }
    const res = this.results.get(src);
    if (!res || (res.type !== "image" && res.type !== "video")) {
      throw new Error(`[AssetMap] Asset is not an image or video: ${src}`);
    }

    if (!this.taken.has(src)) {
      this.taken.add(src);
      return res.element;
    }

    // 第二次及后续使用：克隆节点
    const clone = res.element.cloneNode(true) as
      | HTMLImageElement
      | HTMLVideoElement;

    const isVideo =
      (typeof HTMLVideoElement !== "undefined" &&
        clone instanceof HTMLVideoElement) ||
      (clone as HTMLElement).tagName === "VIDEO";

    if (isVideo) {
      (clone as HTMLVideoElement).muted = true; // 确保克隆视频自动播放不被拦截
      this.cleanups.push(() => {
        (clone as HTMLVideoElement).pause();
        clone.removeAttribute("src");
        (clone as HTMLVideoElement).load();
      });
    } else {
      this.cleanups.push(() => {
        clone.removeAttribute("src");
      });
    }

    return clone;
  }

  /**
   * 释放所有底层资源与硬件解码上下文
   * - 按注册顺序的【倒序】执行，确保克隆节点先解构，最后撤销原始 Blob URL
   * - 具备容错性与幂等性
   */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try {
        this.cleanups[i]?.();
      } catch (err) {
        console.warn("[AssetMap] Cleanup hook error:", err);
      }
    }
    this.cleanups.length = 0;
    this.taken.clear();
  }
}
