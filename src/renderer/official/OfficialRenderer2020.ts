import type {
  BannerData,
  LayerConfig2020,
  LayersOfficial2021,
} from "../../types";
import { waitForMedia } from "../helper";
import { BaseOfficialRenderer } from "./BaseOfficialRenderer";

interface FrameAnimationState {
  frames: HTMLImageElement[];
  allImages: HTMLImageElement[];
  durations: number[];
  currentIndex: number;
  lastTime: number;
  totalDuration: number;
}

export class OfficialRenderer2020 extends BaseOfficialRenderer {
  private _rawConfig: LayerConfig2020[] = [];
  private _frameAnimations: Array<FrameAnimationState | undefined> = [];
  private _globalRafId = 0;

  public async preload(
    bannerConfig: BannerData,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!bannerConfig || bannerConfig.type !== "official_2020") {
      return;
    }
    await super.preload(bannerConfig, signal);

    if (!this.preloadedResources) return;
    const loadTasks = this._rawConfig.map((rawLayer, index) => {
      if (rawLayer.images.length > 1) {
        const mainResource = this.preloadedResources![index]?.[0];
        if (!mainResource) return Promise.resolve();
        return this._loadFrameImages(index, signal);
      }
      return Promise.resolve();
    });
    await Promise.all(loadTasks);
  }

  protected _normalizeConfig(raw: unknown): LayersOfficial2021[] {
    const rawLayers = raw as LayerConfig2020[];
    this._rawConfig = rawLayers;

    return rawLayers.map((layer) => {
      const hasScale =
        layer.initial?.scale !== undefined || layer.offset?.scale !== undefined;
      const hasRotate =
        layer.initial?.rotate !== undefined ||
        layer.offset?.rotate !== undefined;
      const hasTranslate =
        layer.initial?.translate !== undefined ||
        layer.offset?.translate !== undefined;
      const hasBlur =
        layer.initial?.blur !== undefined || layer.offset?.blur !== undefined;

      return {
        resources: [{ src: layer.images?.[0]?.src ?? "" }],
        ...(hasScale && {
          scale: {
            initial: layer.initial.scale ?? 1,
            offset: layer.offset.scale,
            offsetCurve: layer.offsetCurve.scale,
          },
        }),
        ...(hasRotate && {
          rotate: {
            initial: layer.initial.rotate ?? 0,
            offset: layer.offset.rotate,
            offsetCurve: layer.offsetCurve.rotate,
          },
        }),
        ...(hasTranslate && {
          translate: {
            initial: layer.initial.translate ?? [0, 0],
            offset: layer.offset.translate,
            offsetCurve: layer.offsetCurve.translate,
          },
        }),
        ...(hasBlur && {
          blur: {
            initial: layer.initial.blur ?? 0,
            offset: layer.offset.blur,
            offsetCurve: layer.offsetCurve.blur,
            wrap: "alternate" as const,
          },
        }),
      };
    });
  }

  private async _loadFrameImages(
    layerIndex: number,
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    const rawLayer = this._rawConfig[layerIndex];
    if (!rawLayer || (rawLayer.images?.length ?? 0) <= 1) return;

    const frames: HTMLImageElement[] = [];
    for (let i = 1; i < rawLayer.images.length; i++) {
      signal?.throwIfAborted();
      const img = document.createElement("img");
      img.src = rawLayer.images[i].src;
      await waitForMedia(img, signal);
      frames.push(img);
    }

    this._frameAnimations[layerIndex] = {
      frames,
      allImages: [],
      durations: rawLayer.images.map((img) => img.duration ?? 0),
      currentIndex: 0,
      lastTime: 0,
      totalDuration: 0,
    };
  }

  private _startFrameAnimation(layerIndex: number, startTime: number): void {
    const rawLayer = this._rawConfig[layerIndex];
    const animationState = this._frameAnimations[layerIndex];
    if (!rawLayer || !animationState) return;

    // 构建完整图片顺序：主帧 + 额外帧
    const mainResource = this.layerStates[layerIndex]
      ?.resource as HTMLImageElement;
    if (!mainResource) return;

    animationState.allImages = [mainResource, ...animationState.frames];

    const totalDuration = animationState.durations.reduce((a, b) => a + b, 0);
    if (totalDuration <= 0) return;

    animationState.totalDuration = totalDuration;

    // 提前对所有帧进行预解码，消除 Firefox 上的闪烁
    // 这种全量一次性解码对小规模图片效率最高，且能简化循环逻辑
    for (const img of animationState.allImages) {
      if (img instanceof HTMLImageElement && "decode" in img) {
        img.decode().catch(() => {});
      }
    }

    animationState.lastTime = startTime;
  }

  protected override _onAfterSetup(): void {
    const now = performance.now();
    let hasAnimations = false;
    for (let i = 0; i < this._rawConfig.length; i++) {
      if (this._rawConfig[i].images.length > 1) {
        this._startFrameAnimation(i, now);
        hasAnimations = true;
      }
    }
    if (hasAnimations) {
      this._globalRafId = requestAnimationFrame(this._frameLoop);
    }
  }

  private _frameLoop = (now: number) => {
    if (!this.container) return; // 已经被清理

    let needsRender = false;

    for (
      let layerIndex = 0;
      layerIndex < this._frameAnimations.length;
      layerIndex++
    ) {
      const state = this._frameAnimations[layerIndex];
      if (!state || state.allImages.length <= 1) continue;

      let elapsed = now - state.lastTime;

      // 取模跳帧优化：解决长时间后台休眠后唤醒的“死亡螺旋”(Spiral of Death)问题
      // 页面切到后台时 rAF 会暂停，导致累积的 elapsed 极大。
      // 通过直接扣除完整的动画循环周期，防止下方的 while 循环在单帧内被同步执行数万次而卡死主线程。
      if (state.totalDuration > 0 && elapsed >= state.totalDuration) {
        const cycles = Math.floor(elapsed / state.totalDuration);
        state.lastTime += cycles * state.totalDuration;
        elapsed %= state.totalDuration;
      }

      let currentDuration = state.durations[state.currentIndex];

      let advanced = false;
      while (elapsed >= currentDuration && currentDuration > 0) {
        elapsed -= currentDuration;
        state.lastTime += currentDuration;
        state.currentIndex = (state.currentIndex + 1) % state.allImages.length;
        currentDuration = state.durations[state.currentIndex];
        advanced = true;
      }

      if (advanced) {
        const nextImage = state.allImages[state.currentIndex];
        const layerState = this.layerStates[layerIndex];
        const layerElement = layerState?.element;

        if (layerElement && layerState.resource !== nextImage) {
          layerState.resource = nextImage;
          this._applyResourceDimensions(layerState);

          this.lastRenderedDisplacementX = NaN;
          this._renderFrame();

          const oldChild = layerElement.firstChild;
          layerElement.appendChild(nextImage);
          if (oldChild && oldChild !== nextImage) {
            layerElement.removeChild(oldChild);
          }

          needsRender = true;
        }
      }
    }

    if (needsRender) {
      this._scheduleRender(true);
    }

    this._globalRafId = requestAnimationFrame(this._frameLoop);
  };

  protected override _onBeforeDispose(): void {
    cancelAnimationFrame(this._globalRafId);
    for (const state of this._frameAnimations) {
      if (!state) continue;
      for (const frame of state.frames) {
        frame.removeAttribute("src");
      }
    }
    this._frameAnimations.length = 0;
  }
}
