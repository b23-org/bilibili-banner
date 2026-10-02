import type { BaseRenderer } from "../renderer";
import {
  LogoRenderer,
  OfficialRenderer2020,
  OfficialRenderer2021,
  SimpleImageRenderer,
} from "../renderer";
import type { BannerConfig, BannerRef } from "../types";

type BannerViewState = "loading" | "success" | "failed";

export class BannerEngine {
  private bannerContainer: HTMLElement | null = null;
  private bannerRenderer: BaseRenderer | null = null;
  private logoRenderer: LogoRenderer | null = null;

  private failedBanners: Set<string> = new Set();
  private currentId = "";
  private currentBanner: BannerRef | null = null;
  private requestId = 0;
  private _preloadController: AbortController | null = null;

  private static readonly PRELOAD_TIMEOUT_MS = 20000;

  constructor() {
    this.bannerContainer = null;
  }

  // ── 状态工具 ──

  private _setViewState(state: BannerViewState): void {
    if (!this.bannerContainer) return;
    this.bannerContainer.classList.remove(
      "is-loading",
      "is-success",
      "is-failed",
    );
    this.bannerContainer.classList.add(`is-${state}`);
  }

  private _isStale(requestId: number): boolean {
    return requestId !== this.requestId;
  }

  private _markFailed(banner: BannerRef): void {
    this.failedBanners.add(banner.id);
    this._setViewState("failed");
  }

  // ── 渲染器生命周期 ──

  private _disposeRenderers(
    renderer: BaseRenderer | null,
    logoRenderer: LogoRenderer | null,
  ): void {
    renderer?.dispose();
    logoRenderer?.dispose();
  }

  private _createRenderer(config: BannerConfig | null): BaseRenderer | null {
    if (!config) return null;

    const banner_type = config.type;
    switch (banner_type) {
      case "simple-image":
        return new SimpleImageRenderer();
      case "official_2020":
        return new OfficialRenderer2020();
      case "official_2021":
        return new OfficialRenderer2021();
      default:
        throw new Error(
          `未知的 Banner 类型: ${(config as { type?: string }).type}`,
        );
    }
  }

  // ── 预加载 ──

  private async _runWithTimeout(
    task: Promise<void>,
    errorMessage: string,
  ): Promise<void> {
    let timeoutId: number | undefined;
    try {
      await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            this._preloadController?.abort();
            reject(new Error(errorMessage));
          }, BannerEngine.PRELOAD_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  private async _preloadAll(
    renderer: BaseRenderer,
    banner: BannerRef,
    logoRenderer: LogoRenderer | null,
    signal: AbortSignal,
  ): Promise<void> {
    const preloadTasks: Promise<void>[] = [
      this._runWithTimeout(
        renderer.preload(banner.config, signal),
        "preload timeout",
      ),
    ];

    if (logoRenderer && banner.config.logo?.src) {
      preloadTasks.push(
        this._runWithTimeout(
          logoRenderer.preload(banner.config.logo, signal),
          "logo preload timeout",
        ),
      );
    }

    await Promise.all(preloadTasks);
  }

  // ── 切换阶段 ──

  /** 阶段1: 中止旧请求、清理渲染器、检查黑名单。返回 requestId，已失败则返回 null。 */
  private _beginSwitch(banner: BannerRef): number | null {
    this._preloadController?.abort();
    this._preloadController = null;
    this._disposeRenderers(this.bannerRenderer, this.logoRenderer);
    this.bannerRenderer = null;
    this.logoRenderer = null;

    if (this.failedBanners.has(banner.id)) {
      this._setViewState("failed");
      return null;
    }
    this._setViewState("loading");
    return ++this.requestId;
  }

  /** 阶段2: 预加载所有资源。成功返回 true，失败/过期返回 false。 */
  private async _preloadResource(
    banner: BannerRef,
    renderer: BaseRenderer,
    logo: LogoRenderer | null,
    requestId: number,
  ): Promise<boolean> {
    this._preloadController = new AbortController();
    const { signal } = this._preloadController;

    try {
      await this._preloadAll(renderer, banner, logo, signal);
    } catch (e) {
      this._disposeRenderers(renderer, logo);
      if (!this._isStale(requestId)) {
        console.error(`[BannerEngine] 资源预加载失败: ${banner.id}`, e);
        this._preloadController?.abort();
        this._markFailed(banner);
      }
      return false;
    }

    if (this._isStale(requestId)) {
      this._disposeRenderers(renderer, logo);
      return false;
    }
    return true;
  }

  // ── 公共接口 ──

  public setContainer(el: HTMLElement): void {
    this.bannerContainer = el;
  }

  public async rerenderCurrent(): Promise<void> {
    if (!this.currentBanner) return;
    this.currentId = "";
    await this.switch(this.currentBanner);
  }

  public async switch(banner: BannerRef): Promise<void> {
    this.currentBanner = banner;
    if (this.currentId === banner.id) return;
    console.info(`[BannerEngine] 正在切换至: ${banner.id} [${banner.name}]`);
    this.currentId = banner.id;

    const requestId = this._beginSwitch(banner);
    if (requestId === null) return;

    const bannerRenderer = this._createRenderer(banner.config);
    if (!bannerRenderer) return;

    const logoRenderer = banner.config.logo?.src ? new LogoRenderer() : null;

    const ok = await this._preloadResource(
      banner,
      bannerRenderer,
      logoRenderer,
      requestId,
    );
    if (!ok) return;

    console.info(`[BannerEngine] 资源预加载完成: ${banner.id}`);
    this._preloadController = null;
    this._applyBanner(bannerRenderer, banner, logoRenderer);
    console.info(`[BannerEngine] Banner 渲染成功: ${banner.id}`);
  }

  private _applyBanner(
    renderer: BaseRenderer,
    banner: BannerRef,
    logoRenderer: LogoRenderer | null,
  ) {
    this.bannerRenderer = renderer;
    this.logoRenderer = logoRenderer;
    this._setViewState("success");

    if (this.bannerContainer) {
      renderer.render(this.bannerContainer);
    }

    if (this.logoRenderer && banner.config.logo?.src) {
      this.logoRenderer.render(
        banner.config.logo,
        banner.config.link,
        banner.name,
      );
    }
  }
}

export default BannerEngine;
