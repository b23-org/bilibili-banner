import { BannerLoader } from "../data/DataLoader";
import type { BaseRenderer } from "../renderer";
import {
  LogoRenderer,
  OfficialRenderer2020,
  OfficialRenderer2021,
  SimpleImageRenderer,
} from "../renderer";
import type { BannerData, BannerRef } from "../types";

type BannerViewState = "loading" | "success" | "failed";

export default class BannerEngine {
  private bannerContainer: HTMLElement | null;
  private readonly loader: BannerLoader = new BannerLoader();
  private bannerRenderer: BaseRenderer | null = null;
  private logoRenderer: LogoRenderer | null = null;

  private failedBanners: Set<string> = new Set();
  private currentPath = "";
  private currentRef: BannerRef | null = null;
  private requestId = 0;
  private _preloadController: AbortController | null = null;

  private static readonly PRELOAD_TIMEOUT_MS = 20000;

  constructor() {
    this.bannerContainer = document.getElementById("banner-container");
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

  private _markFailed(ref: BannerRef): void {
    this.failedBanners.add(ref.path);
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

  private _createRenderer(banner: BannerData | null): BaseRenderer | null {
    if (!banner) return null;

    const banner_type = banner.type;
    switch (banner_type) {
      case "simple-image":
        return new SimpleImageRenderer();
      case "official_2020":
        return new OfficialRenderer2020();
      case "official_2021":
        return new OfficialRenderer2021();
      default:
        throw new Error(`未知的 Banner 类型: ${banner_type}`);
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
    banner: BannerData,
    logoRenderer: LogoRenderer | null,
    signal: AbortSignal,
  ): Promise<void> {
    const preloadTasks: Promise<void>[] = [
      this._runWithTimeout(renderer.preload(banner, signal), "preload timeout"),
    ];

    if (logoRenderer && banner.logo?.src) {
      preloadTasks.push(
        this._runWithTimeout(
          logoRenderer.preload(banner.logo, signal),
          "logo preload timeout",
        ),
      );
    }

    await Promise.all(preloadTasks);
  }

  // ── 切换阶段 ──

  /** 阶段1: 中止旧请求、清理渲染器、检查黑名单。返回 requestId，已失败则返回 null。 */
  private _beginSwitch(ref: BannerRef): number | null {
    this._preloadController?.abort();
    this._preloadController = null;
    this._disposeRenderers(this.bannerRenderer, this.logoRenderer);
    this.bannerRenderer = null;
    this.logoRenderer = null;

    if (this.failedBanners.has(ref.path)) {
      this._setViewState("failed");
      return null;
    }
    this._setViewState("loading");
    return ++this.requestId;
  }

  /** 阶段2: 加载 BannerData。成功返回数据，失败/过期返回 null。 */
  private async _loadBannerData(
    ref: BannerRef,
    requestId: number,
  ): Promise<BannerData | null> {
    try {
      return this.loader.getCached(ref.path) ?? (await this.loader.load(ref));
    } catch (e) {
      if (!this._isStale(requestId)) {
        console.error(`[BannerEngine] 无法加载 Banner 配置: ${ref.path}`, e);
        this._markFailed(ref);
      }
      return null;
    }
  }

  /** 阶段3: 预加载所有资源。成功返回 true，失败/过期返回 false。 */
  private async _preloadResource(
    ref: BannerRef,
    renderer: BaseRenderer,
    banner: BannerData,
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
        console.error(`[BannerEngine] 资源预加载失败: ${ref.path}`, e);
        this._preloadController?.abort();
        this._markFailed(ref);
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

  public async rerenderCurrent(): Promise<void> {
    if (!this.currentRef) return;
    this.currentPath = "";
    await this.switch(this.currentRef);
  }

  public async switch(ref: BannerRef): Promise<void> {
    this.currentRef = ref;
    if (this.currentPath === ref.path) return;
    console.info(`[BannerEngine] 正在切换至: ${ref.path} [${ref.name}]`);
    this.currentPath = ref.path;

    const requestId = this._beginSwitch(ref);
    if (requestId === null) return;

    const data = await this._loadBannerData(ref, requestId);
    if (!data || this._isStale(requestId)) return;

    const bannerRenderer = this._createRenderer(data);
    if (!bannerRenderer) return;

    const logoRenderer = data.logo?.src ? new LogoRenderer() : null;

    const ok = await this._preloadResource(
      ref,
      bannerRenderer,
      data,
      logoRenderer,
      requestId,
    );
    if (!ok) return;

    console.info(`[BannerEngine] 资源预加载完成: ${ref.path}`);
    this._preloadController = null;
    this._applyBanner(bannerRenderer, data, logoRenderer);
    console.info(`[BannerEngine] Banner 渲染成功: ${ref.path}`);
  }

  private _applyBanner(
    renderer: BaseRenderer,
    bannerData: BannerData,
    logoRenderer: LogoRenderer | null,
  ) {
    this.bannerRenderer = renderer;
    this.logoRenderer = logoRenderer;
    this._setViewState("success");

    if (this.bannerContainer) {
      renderer.render(this.bannerContainer);
    }

    if (this.logoRenderer && bannerData.logo?.src) {
      this.logoRenderer.render(bannerData.logo);
    }
  }
}
