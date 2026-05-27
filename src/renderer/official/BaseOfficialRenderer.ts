import type {
  BannerData,
  LayersOfficial2021,
  WrappableProperty,
} from "../../types";
import type { BaseRenderer } from "./../BaseRenderer";
import { releaseVideoElement, waitForMedia } from "./../helper";
import type { EasingFunction } from "./bezier-easing";
import { IDENTITY_EASING, makeSymmetricCurve } from "./bezier-easing";

// ── 资源加载 ──

export interface LoadedResource {
  el: HTMLImageElement | HTMLVideoElement;
  intrinsicWidth: number;
  intrinsicHeight: number;
}

// ── 图层状态 ──

interface LayerSnapshot {
  initialScale: number;
  rotate: number;
  translate: [number, number];
  blur: number;
  opacity: number;
}

interface LayerState {
  element: HTMLElement;
  resource: HTMLImageElement | HTMLVideoElement;
  snapshot: LayerSnapshot;
  metrics: { intrinsicWidth: number; intrinsicHeight: number };
  curves: {
    scale: EasingFunction;
    rotate: EasingFunction;
    translate: EasingFunction;
    blur: EasingFunction;
    opacity: EasingFunction;
  };
}

// ── 曲线解析 ──

type CurveConfigurable = { offsetCurve?: [number, number, number, number] };

function resolveCurve(prop: CurveConfigurable | undefined): EasingFunction {
  return prop?.offsetCurve
    ? makeSymmetricCurve(prop.offsetCurve)
    : IDENTITY_EASING;
}

// ── blur / opacity 算法 ──

function resolveBlurValue(
  initial: number,
  offset: number,
  curve: EasingFunction,
  normalizedDisplacementX: number,
  prop: WrappableProperty,
): number {
  const value = initial + offset * curve(normalizedDisplacementX);
  if (!prop.wrap || prop.wrap === "clamp") {
    return Math.max(0, value);
  }

  return Math.abs(value);
}

function resolveOpacityValue(
  initial: number,
  offset: number,
  curve: EasingFunction,
  normalizedDisplacementX: number,
  prop: WrappableProperty,
): number {
  const value = initial + offset * curve(normalizedDisplacementX);
  if (!prop.wrap || prop.wrap === "clamp") {
    return Math.max(0, Math.min(1, value));
  }

  let foldedOpacity = Math.abs(value % 1);
  if (Math.abs(value % 2) >= 1) foldedOpacity = 1 - foldedOpacity;
  return foldedOpacity;
}

// ─────────────────── BaseOfficialRenderer ───────────────────

export abstract class BaseOfficialRenderer implements BaseRenderer {
  private static readonly BANNER_DESIGN_HEIGHT = 155;

  protected container: HTMLElement | null = null;
  protected wrapper: HTMLElement | null = null;
  protected layers: LayersOfficial2021[] = [];
  protected layerStates: LayerState[] = [];
  protected preloadedResources: LoadedResource[][] | null = null;

  // ── 交互状态 ──
  protected normalizedDisplacementX = 0;
  protected pointerAnchorClientX = 0;
  protected bannerHeightScale = 1;
  protected lastRenderedDisplacementX = NaN;
  protected animationFrameId = 0;
  protected isPointerActiveInBanner = false;

  // ── 绑定的事件处理器 ──
  private _boundMouseEnter: (e: MouseEvent) => void;
  private _boundMouseMove: (e: MouseEvent) => void;
  private _boundMouseLeave: () => void;
  private _boundResize: () => void;
  private _boundBlur: () => void;
  private _frameCallback: () => void;

  constructor() {
    this._boundMouseEnter = this._handleMouseEnter.bind(this);
    this._boundMouseMove = this._handleMouseMove.bind(this);
    this._boundMouseLeave = this._handleMouseLeave.bind(this);
    this._boundResize = this._handleResize.bind(this);
    this._boundBlur = this._handleBlur.bind(this);
    this._frameCallback = this._renderFrame.bind(this);
  }

  // ── 子类必须实现 ──
  protected abstract _normalizeConfig(raw: unknown): LayersOfficial2021[];

  // ── 子类可选覆盖 ──
  protected _onAfterSetup(): void {
    // 默认空实现，子类可覆盖
  }

  protected _onBeforeDispose(): void {
    // 默认空实现，子类可覆盖以清理自己的资源
  }

  // ── 资源预加载 ──

  private _createResourceElement(
    src: string,
  ): HTMLImageElement | HTMLVideoElement {
    if (/\.(webm|mp4)$/i.test(src)) {
      const video = document.createElement("video");
      video.src = src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.style.objectFit = "cover";
      return video;
    }
    const img = document.createElement("img");
    img.src = src;
    return img;
  }

  protected async _loadResources(
    layers: LayersOfficial2021[],
    signal?: AbortSignal,
  ): Promise<LoadedResource[][]> {
    return Promise.all(
      layers.map(async (layer) =>
        Promise.all(
          layer.resources.map(async (res) => {
            signal?.throwIfAborted();
            const el = this._createResourceElement(res.src);
            const { width, height } = await waitForMedia(el, signal);
            return { el, intrinsicWidth: width, intrinsicHeight: height };
          }),
        ),
      ),
    );
  }

  // ── DOM 构建 ──

  protected _setup(
    container: HTMLElement,
    layers: LayersOfficial2021[],
    loaded: LoadedResource[][],
  ): void {
    this.wrapper = document.createElement("div");
    this.wrapper.className = "animated-banner";
    this.layerStates = [];
    const fragment = document.createDocumentFragment();

    for (const [layerIndex, layer] of layers.entries()) {
      const element = document.createElement("div");
      element.className = "layer";

      const res = loaded[layerIndex]?.[0];
      if (!res) continue;
      const resource = res.el;

      const snapshot: LayerSnapshot = {
        initialScale: layer.scale?.initial ?? 1,
        rotate: layer.rotate?.initial ?? 0,
        translate: [
          layer.translate?.initial?.[0] ?? 0,
          layer.translate?.initial?.[1] ?? 0,
        ],
        blur: layer.blur?.initial ?? 0,
        opacity: layer.opacity?.initial ?? 1,
      };

      const curves = {
        scale: resolveCurve(layer.scale),
        rotate: resolveCurve(layer.rotate),
        translate: resolveCurve(layer.translate),
        blur: resolveCurve(layer.blur),
        opacity: resolveCurve(layer.opacity),
      };

      const state: LayerState = {
        element,
        resource,
        snapshot,
        metrics: {
          intrinsicWidth: res.intrinsicWidth,
          intrinsicHeight: res.intrinsicHeight,
        },
        curves,
      };

      this.layerStates.push(state);
      this._applyResourceDimensions(state);
      element.appendChild(resource);
      fragment.appendChild(element);
    }

    this.wrapper.appendChild(fragment);
    container.appendChild(this.wrapper);
  }

  protected _applyResourceDimensions(state: LayerState): void {
    const { metrics, snapshot, resource } = state;
    const renderWidth =
      metrics.intrinsicWidth * this.bannerHeightScale * snapshot.initialScale;
    const renderHeight =
      metrics.intrinsicHeight * this.bannerHeightScale * snapshot.initialScale;

    resource.width = renderWidth;
    resource.height = renderHeight;
    resource.style.width = `${renderWidth}px`;
    resource.style.height = `${renderHeight}px`;
  }

  protected _applyAllResourceDimensions(): void {
    for (const state of this.layerStates) {
      this._applyResourceDimensions(state);
    }
  }

  protected _scheduleRender(force = false): void {
    cancelAnimationFrame(this.animationFrameId);
    if (force) {
      this.lastRenderedDisplacementX = NaN;
    }
    this.animationFrameId = requestAnimationFrame(this._frameCallback);
  }

  protected _renderFrame(): void {
    if (this.lastRenderedDisplacementX === this.normalizedDisplacementX) return;
    this.lastRenderedDisplacementX = this.normalizedDisplacementX;

    for (
      let stateIndex = 0;
      stateIndex < this.layerStates.length;
      stateIndex++
    ) {
      const state = this.layerStates[stateIndex];
      const layer = this.layers[stateIndex];
      if (!state || !layer) continue;
      const { snapshot, curves, resource } = state;
      const dx = this.normalizedDisplacementX;

      // scale
      const scale = 1 + (layer.scale?.offset ?? 0) * curves.scale(dx);

      // rotate
      const rotate =
        snapshot.rotate + (layer.rotate?.offset ?? 0) * curves.rotate(dx);

      // translate
      const translateOffsetX = layer.translate?.offset?.[0] ?? 0;
      const translateOffsetY = layer.translate?.offset?.[1] ?? 0;
      const tx =
        (snapshot.translate[0] + translateOffsetX * curves.translate(dx)) *
        this.bannerHeightScale *
        snapshot.initialScale;
      const ty =
        (snapshot.translate[1] + translateOffsetY * curves.translate(dx)) *
        this.bannerHeightScale *
        snapshot.initialScale;

      resource.style.transform = `translate(${tx}px, ${ty}px) rotate(${rotate}deg) scale(${scale})`;

      // blur
      if (layer.blur) {
        const blur = resolveBlurValue(
          snapshot.blur,
          layer.blur.offset ?? 0,
          curves.blur,
          dx,
          layer.blur,
        );
        resource.style.filter = blur < 0.0001 ? "" : `blur(${blur}px)`;
      } else {
        resource.style.filter = "";
      }

      // opacity
      if (layer.opacity) {
        const opacity = resolveOpacityValue(
          snapshot.opacity,
          layer.opacity.offset ?? 0,
          curves.opacity,
          dx,
          layer.opacity,
        );
        resource.style.opacity = String(opacity);
      } else {
        resource.style.opacity = "";
      }
    }
  }

  // ── 事件处理 ──

  private _handleMouseEnter(e: MouseEvent): void {
    this.isPointerActiveInBanner = true;
    this.pointerAnchorClientX = e.clientX;
    cancelAnimationFrame(this.animationFrameId);
  }

  private _handleMouseMove(e: MouseEvent): void {
    if (!this.container || this.container.clientWidth <= 0) return;

    if (!this.isPointerActiveInBanner) {
      this.isPointerActiveInBanner = true;
      this.pointerAnchorClientX = e.clientX;
    }

    this.normalizedDisplacementX =
      (e.clientX - this.pointerAnchorClientX) / this.container.clientWidth;
    this._scheduleRender();
  }

  private _handleMouseLeave(): void {
    this._startResetAnimation();
  }

  private _handleBlur(): void {
    this._startResetAnimation();
  }

  private _startResetAnimation(): void {
    this.isPointerActiveInBanner = false;
    this.pointerAnchorClientX = 0;
    cancelAnimationFrame(this.animationFrameId);

    const startDisplacementX = this.normalizedDisplacementX;
    if (Math.abs(startDisplacementX) < 0.0001) {
      this.normalizedDisplacementX = 0;
      this._scheduleRender(true);
      return;
    }

    const startTime = performance.now();
    const RESET_ANIMATION_MS = 200;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      if (elapsed < RESET_ANIMATION_MS) {
        this.normalizedDisplacementX =
          startDisplacementX * (1 - elapsed / RESET_ANIMATION_MS);
        this._renderFrame();
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        this.normalizedDisplacementX = 0;
        this.lastRenderedDisplacementX = NaN;
        this._renderFrame();
        this.animationFrameId = 0;
      }
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  private _handleResize(): void {
    if (!this.container) return;
    this.bannerHeightScale =
      this.container.clientHeight / BaseOfficialRenderer.BANNER_DESIGN_HEIGHT;
    this._applyAllResourceDimensions();
    this._scheduleRender(true);
  }

  // ── 公共接口 ──

  public render(container: HTMLElement): void {
    if (!this.preloadedResources) return;

    this.container = container;
    this.bannerHeightScale =
      container.clientHeight / BaseOfficialRenderer.BANNER_DESIGN_HEIGHT;

    this._setup(container, this.layers, this.preloadedResources);
    this._scheduleRender(true);
    this._onAfterSetup();

    this.container.addEventListener("mouseenter", this._boundMouseEnter);
    this.container.addEventListener("mousemove", this._boundMouseMove);
    this.container.addEventListener("mouseleave", this._boundMouseLeave);
    window.addEventListener("resize", this._boundResize);
    window.addEventListener("blur", this._boundBlur);
  }

  public async preload(
    bannerConfig: BannerData,
    signal?: AbortSignal,
  ): Promise<void> {
    if (
      !bannerConfig ||
      (bannerConfig.type !== "official_2020" &&
        bannerConfig.type !== "official_2021")
    )
      return;

    signal?.throwIfAborted();

    const rawLayers = bannerConfig.layers;
    this.layers = this._normalizeConfig(rawLayers);

    const loaded = await this._loadResources(this.layers, signal);
    this.preloadedResources = loaded;
  }

  public dispose(): void {
    this._onBeforeDispose();

    if (this.container) {
      this.container.removeEventListener("mouseenter", this._boundMouseEnter);
      this.container.removeEventListener("mousemove", this._boundMouseMove);
      this.container.removeEventListener("mouseleave", this._boundMouseLeave);
    }
    window.removeEventListener("resize", this._boundResize);
    window.removeEventListener("blur", this._boundBlur);
    cancelAnimationFrame(this.animationFrameId);

    if (this.preloadedResources) {
      for (const layerResources of this.preloadedResources) {
        for (const res of layerResources) {
          if (res.el instanceof HTMLVideoElement) {
            releaseVideoElement(res.el);
          } else if (res.el instanceof HTMLImageElement) {
            res.el.removeAttribute("src");
          }
        }
      }
    }

    if (this.wrapper) {
      this.wrapper.remove();
      this.wrapper = null;
    }

    this.container = null;
    this.layers = [];
    this.layerStates = [];
    this.normalizedDisplacementX = 0;
    this.pointerAnchorClientX = 0;
    this.bannerHeightScale = 1;
    this.lastRenderedDisplacementX = NaN;
    this.animationFrameId = 0;
    this.isPointerActiveInBanner = false;
    this.preloadedResources = null;
  }
}
