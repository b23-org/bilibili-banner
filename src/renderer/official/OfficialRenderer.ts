import type { AssetMap } from "../../core/asset-map";
import { loadRefAssets } from "../../core/loadRefAssets";
import type { ResourceEntry } from "../../core/preload";
import type {
  BannerRef,
  LayersOfficial2021,
  Official2021Config,
} from "../../types";
import { ExtensionHost } from "../extensions/core";
import { LogoView } from "../LogoView";
import type { Renderer } from "../Renderer";
import { FrameAnimator } from "./FrameAnimator";
import {
  computeLayerStyle,
  createLayerCurves,
  type LayerCurves,
} from "./layer-style";
import { PointerTracker } from "./PointerTracker";
import { RafScheduler } from "./RafScheduler";

interface RenderedFrame {
  element: HTMLImageElement | HTMLVideoElement;
  intrinsicWidth: number;
  intrinsicHeight: number;
}

function getIntrinsicSize(element: HTMLImageElement | HTMLVideoElement): {
  width: number;
  height: number;
} {
  if (
    (typeof HTMLImageElement !== "undefined" &&
      element instanceof HTMLImageElement) ||
    element.tagName === "IMG"
  ) {
    const img = element as HTMLImageElement;
    return {
      width: img.naturalWidth || img.width || 0,
      height: img.naturalHeight || img.height || 0,
    };
  }
  if (
    (typeof HTMLVideoElement !== "undefined" &&
      element instanceof HTMLVideoElement) ||
    element.tagName === "VIDEO"
  ) {
    const video = element as HTMLVideoElement;
    return {
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
    };
  }
  return { width: 0, height: 0 };
}

interface RenderedLayer {
  layerElement: HTMLElement;
  frames: RenderedFrame[];
  curves: LayerCurves;
  config: LayersOfficial2021;
}

export class OfficialRenderer implements Renderer {
  private static readonly BANNER_DESIGN_HEIGHT = 155;

  private container: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private assets: AssetMap | null = null;
  private banner: BannerRef<Official2021Config> | null = null;

  private renderedLayers: RenderedLayer[] = [];
  private bannerHeightScale = 1;
  private lastRenderedDx = NaN;

  private readonly logoView = new LogoView();
  private readonly pointerTracker: PointerTracker;
  private readonly frameAnimator = new FrameAnimator();
  private readonly scheduler: RafScheduler;

  private extensionHost: ExtensionHost | null = null;
  private extensionAbortController: AbortController | null = null;

  private boundResize: () => void;

  constructor() {
    this.pointerTracker = new PointerTracker(() => {
      this.scheduler.markDirty();
    });

    this.scheduler = new RafScheduler((now) => {
      return this.renderFrame(now);
    });

    this.boundResize = this.handleResize.bind(this);
  }

  public async prepare(banner: BannerRef, signal: AbortSignal): Promise<void> {
    if (banner.config.type !== "official_2021") {
      throw new Error(
        `[OfficialRenderer] Invalid config type: ${banner.config.type}`,
      );
    }
    this.banner = banner as BannerRef<Official2021Config>;

    const entries: ResourceEntry[] = [];

    // 收集全部图层资源
    for (const layer of this.banner.config.layers) {
      for (const res of layer.resources) {
        if (!res.src) continue;
        const isVideo = /\.(webm|mp4)$/i.test(res.src);
        entries.push({
          type: isVideo ? "video" : "image",
          src: res.src,
        });
      }
    }

    // 收集 Logo 资源
    if (this.banner.config.logo?.src) {
      entries.push({
        type: "image",
        src: this.banner.config.logo.src,
      });
    }

    this.assets = await loadRefAssets(banner.id, entries, signal);
  }

  public mount(container: HTMLElement): void {
    if (!this.assets || !this.banner) return;
    this.container = container;

    this.bannerHeightScale =
      container.clientHeight > 0
        ? container.clientHeight / OfficialRenderer.BANNER_DESIGN_HEIGHT
        : 1;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "animated-banner";
    const fragment = document.createDocumentFragment();

    this.renderedLayers = [];
    this.frameAnimator.reset();

    for (const [
      layerIndex,
      layerConfig,
    ] of this.banner.config.layers.entries()) {
      const layerElement = document.createElement("div");
      layerElement.className = "layer";

      const frames: RenderedFrame[] = [];
      const durations: number[] = [];
      let hasMultiFrames = false;

      // 判断是否激活多帧动画：多资源且均有合法 duration
      if (
        layerConfig.resources.length > 1 &&
        layerConfig.resources.every(
          (r) => typeof r.duration === "number" && r.duration > 0,
        )
      ) {
        hasMultiFrames = true;
        for (const res of layerConfig.resources) {
          durations.push(res.duration ?? 0);
        }
      }

      for (const [frameIndex, res] of layerConfig.resources.entries()) {
        if (!res.src) continue;
        const element = this.assets.takeElement(res.src);

        // 设置尺寸
        const intrinsicSize = getIntrinsicSize(element);
        const initialScale = layerConfig.scale?.initial ?? 1;
        const renderWidth =
          intrinsicSize.width * this.bannerHeightScale * initialScale;
        const renderHeight =
          intrinsicSize.height * this.bannerHeightScale * initialScale;

        element.style.width = `${renderWidth}px`;
        element.style.height = `${renderHeight}px`;

        if (hasMultiFrames) {
          element.classList.add("frame-item");
          element.style.position = "absolute";
          if (frameIndex === 0) {
            element.classList.add("frame-active");
            element.style.visibility = "visible";
          } else {
            element.style.visibility = "hidden";
          }

          // 显式异步预解码：解决不可见多帧图片在首轮切换瞬间因延迟解码（Deferred Decode）导致的掉帧白闪问题。
          // 现代浏览器（Chromium 等）对 visibility: hidden 元素不参与光栅化，不会提前解码图像位图；
          // 若在切帧瞬间才开始解压，会因耗时十几毫秒的解码阻塞/延迟导致首轮出现单帧透明白闪。
          // 此处显式调用 decode() 令浏览器在后台工作线程提前解压 RGBA 位图并写入 GpuImageDecodeCache，
          // 确保后续切帧时即刻命中显存缓存，实现首轮及后续循环的平滑无缝切换。
          if (
            typeof HTMLImageElement !== "undefined" &&
            element instanceof HTMLImageElement &&
            "decode" in element
          ) {
            element.decode().catch(() => {});
          }
        }

        layerElement.appendChild(element);
        frames.push({
          element,
          intrinsicWidth: intrinsicSize.width,
          intrinsicHeight: intrinsicSize.height,
        });

        // 若不是多帧动画，仅挂载第一帧资源即可
        if (!hasMultiFrames) break;
      }

      if (hasMultiFrames) {
        this.frameAnimator.registerLayer(layerIndex, durations);
      }

      const curves = createLayerCurves(layerConfig);
      this.renderedLayers.push({
        layerElement,
        frames,
        curves,
        config: layerConfig,
      });

      fragment.appendChild(layerElement);
    }

    this.wrapper.appendChild(fragment);
    container.appendChild(this.wrapper);

    // 挂载 LogoView
    this.logoView.mount(container, this.assets, this.banner);
  }

  public start(): void {
    if (!this.container) return;

    // 启动交互监听
    this.pointerTracker.attach(this.container);
    window.addEventListener("resize", this.boundResize);

    // 播放视频
    for (const layer of this.renderedLayers) {
      for (const frame of layer.frames) {
        if (
          typeof HTMLVideoElement !== "undefined" &&
          frame.element instanceof HTMLVideoElement
        ) {
          frame.element.play().catch(() => {});
        }
      }
    }

    // 启动帧动画与按需渲染
    this.frameAnimator.start(performance.now());
    this.scheduler.start();

    // 异步装载扩展能力组件（保留现有 ExtensionHost 兼容架构）
    this.mountExtensions();
  }

  private mountExtensions(): void {
    if (!this.container || !this.banner?.config.extensions) return;

    this.extensionAbortController = new AbortController();
    const host = ExtensionHost.fromConfig({
      bannerEl: this.container,
      config: this.banner.config,
      signal: this.extensionAbortController.signal,
    });

    if (!host) return;
    this.extensionHost = host;

    void host
      .prepare()
      .then(() => {
        if (!this.extensionAbortController?.signal.aborted) {
          void host.mount();
        }
      })
      .catch((err) => {
        console.warn("[OfficialRenderer] Extension mount skipped:", err);
      });
  }

  private renderFrame(now: number): boolean {
    const currentDx = this.pointerTracker.dx;
    const isResetting = this.pointerTracker.isResetting;
    const dxChanged = this.lastRenderedDx !== currentDx;
    this.lastRenderedDx = currentDx;

    // 1. 推进多帧动画（仅当实际发生帧切换时才操作 DOM）
    const frameChanges = this.frameAnimator.tick(now);
    if (frameChanges.size > 0) {
      for (const [layerIndex, activeFrameIndex] of frameChanges.entries()) {
        const layer = this.renderedLayers[layerIndex];
        if (!layer) continue;
        for (const [i, frame] of layer.frames.entries()) {
          const isActive = i === activeFrameIndex;
          frame.element.classList.toggle("frame-active", isActive);
          frame.element.style.visibility = isActive ? "visible" : "hidden";
        }
      }
    }

    // 2. 计算图层视差样式（仅当指针位移变化或处于回弹中时才重算和写入）
    if (dxChanged || isResetting) {
      for (const layer of this.renderedLayers) {
        const style = computeLayerStyle(
          layer.config,
          layer.curves,
          currentDx,
          this.bannerHeightScale,
        );

        for (const frame of layer.frames) {
          frame.element.style.transform = style.transform;
          frame.element.style.filter = style.filter;
          frame.element.style.opacity = style.opacity;
        }
      }
    }

    // 判断是否需要继续循环：正在回弹、或者存在活跃多帧动画
    const hasAnimations = this.frameAnimator.hasAnimations;
    return isResetting || hasAnimations || dxChanged;
  }

  private handleResize(): void {
    if (!this.container) return;
    this.bannerHeightScale =
      this.container.clientHeight > 0
        ? this.container.clientHeight / OfficialRenderer.BANNER_DESIGN_HEIGHT
        : 1;

    for (const layer of this.renderedLayers) {
      const initialScale = layer.config.scale?.initial ?? 1;
      for (const frame of layer.frames) {
        const renderWidth =
          frame.intrinsicWidth * this.bannerHeightScale * initialScale;
        const renderHeight =
          frame.intrinsicHeight * this.bannerHeightScale * initialScale;

        frame.element.style.width = `${renderWidth}px`;
        frame.element.style.height = `${renderHeight}px`;
      }
    }

    this.lastRenderedDx = NaN;
    this.scheduler.markDirty();
  }

  public dispose(): void {
    // 销毁扩展能力
    this.extensionAbortController?.abort();
    this.extensionAbortController = null;
    this.extensionHost?.dispose();
    this.extensionHost = null;

    // 解绑交互监听与停止调度器
    this.pointerTracker.detach();
    window.removeEventListener("resize", this.boundResize);
    this.scheduler.stop();

    // 销毁 LogoView
    this.logoView.dispose();

    // 移除 DOM 容器
    if (this.wrapper) {
      this.wrapper.remove();
      this.wrapper = null;
    }

    // 释放资源
    this.assets?.dispose();
    this.assets = null;
    this.banner = null;
    this.container = null;
    this.renderedLayers = [];
    this.frameAnimator.reset();
  }
}
