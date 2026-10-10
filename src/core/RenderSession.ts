import { createRenderer, type Renderer } from "../renderer/Renderer";
import type { BannerRef } from "../types";

export class RenderSession {
  private readonly controller = new AbortController();
  private renderer: Renderer | null = null;
  private readonly styleSnapshot: string | null;

  constructor(
    public readonly banner: BannerRef,
    public readonly container: HTMLElement,
  ) {
    // 记录容器行内样式快照，作为退出时兜底还原的依据
    this.styleSnapshot = container.getAttribute("style");
  }

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  public get isAborted(): boolean {
    return this.controller.signal.aborted;
  }

  public async run(): Promise<void> {
    const renderer = createRenderer(this.banner.config);
    this.renderer = renderer;

    try {
      await renderer.prepare(this.banner, this.signal);

      if (this.isAborted) {
        throw this.signal.reason ?? new DOMException("Aborted", "AbortError");
      }

      renderer.mount(this.container);
      renderer.start();
    } catch (err) {
      this.teardown();
      throw err;
    }
  }

  public abort(): void {
    this.controller.abort();
    this.teardown();
  }

  private teardown(): void {
    this.renderer?.dispose();
    this.renderer = null;
    this.restoreContainerStyle();
  }

  private restoreContainerStyle(): void {
    if (this.styleSnapshot !== null) {
      this.container.setAttribute("style", this.styleSnapshot);
    } else {
      this.container.removeAttribute("style");
    }
  }
}
