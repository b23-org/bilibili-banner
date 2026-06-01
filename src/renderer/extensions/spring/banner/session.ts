import {
  type BannerExtensionContext,
  type BannerLogoController,
  createLogoController,
  queryBannerUiElements,
} from "../../core";
import { BannerGameSpring2022 } from "../core/core-game";
import { checkSpringEnvironment } from "./env";
import { loadVideo, releaseVideo } from "./video";

type SpringBannerState = "idle" | "transitioning" | "playing" | "disposed";

const SPRING_BASE = "/assets/extensions/spring/";
const IDLE_VIDEO_SRC = `${SPRING_BASE}video/webglLoop.mp4`;
const TRANSITION_VIDEO_SRC = `${SPRING_BASE}video/transition.mp4`;
const STORAGE_KEY = "banner_game_2022_spring";

export class SpringBannerSession {
  private state: SpringBannerState = "idle";
  private idleVideo: HTMLVideoElement | null = null;
  private transitionVideo: HTMLVideoElement | null = null;
  private logoController: BannerLogoController | null = null;
  private clickArea: HTMLDivElement | null = null;
  private game: BannerGameSpring2022 | null = null;
  private originalHeight = 0;
  private originalMaxHeight = "";
  private originalOverflow = "";
  private originalTransition = "";

  constructor(private readonly context: BannerExtensionContext) {}

  async prepare(): Promise<boolean> {
    const env = checkSpringEnvironment();
    if (!env.ok) {
      console.warn(
        `[SpringExtension] Environment check failed: ${env.failed.join(", ")}`,
      );
      return false;
    }
    try {
      const { signal } = this.context;
      const [idleVideo, transitionVideo] = await Promise.all([
        loadVideo(IDLE_VIDEO_SRC, signal),
        loadVideo(TRANSITION_VIDEO_SRC, signal),
      ]);
      this.idleVideo = idleVideo;
      this.transitionVideo = transitionVideo;
      return true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.warn(
          "[SpringExtension] Failed to preload spring videos",
          error,
        );
      }
      this.releaseVideos();
      return false;
    }
  }

  mountIdle(): void {
    if (this.state === "disposed" || !this.idleVideo) return;
    this.state = "idle";
    this.originalHeight = this.context.bannerEl.clientHeight;
    this.originalMaxHeight = this.context.bannerEl.style.maxHeight;
    this.originalOverflow = this.context.bannerEl.style.overflow;
    this.originalTransition = this.context.bannerEl.style.transition;
    this.context.bannerEl.style.overflow = "hidden";
    this.context.bannerEl.style.transition = "height 1s linear";
    this.logoController = createLogoController(this.context.bannerEl);
    this.logoController.init();
    this.logoController.show();
    this.styleIdleVideo(this.idleVideo);
    if (!this.idleVideo.isConnected) {
      this.insertBeforeDefaultUi(this.idleVideo);
    }
    this.idleVideo.play().catch(() => {});
    if (!this.clickArea) {
      this.clickArea = this.createClickArea();
      this.context.bannerEl.appendChild(this.clickArea);
    }
    this.clickArea.style.removeProperty("display");
  }

  async enterGame(): Promise<void> {
    if (this.state !== "idle") return;
    this.state = "transitioning";

    this.clickArea?.style.setProperty("display", "none");
    // 展开过程中不隐藏/暂停待机视频，让其继续在背景拉伸播放，并过渡到 50% 居中位置
    if (this.idleVideo) {
      this.idleVideo.style.top = "50%";
    }

    // 官方衔接逻辑：将过渡视频先以 0px 预热挂载到 document.body
    if (this.transitionVideo) {
      Object.assign(this.transitionVideo.style, {
        position: "absolute",
        bottom: "0",
        left: "0",
        width: "0px",
        height: "0px",
        objectFit: "cover",
        objectPosition: "center",
        imageRendering: "pixelated",
      });
      if (!this.transitionVideo.isConnected) {
        document.body.appendChild(this.transitionVideo);
      }
    }

    this.hideDefaultUi();
    this.context.bannerEl.dispatchEvent(
      new CustomEvent("banner-expand", { detail: true }),
    );

    const expandedHeight = this.context.bannerEl.clientWidth / (16 / 3);
    this.context.bannerEl.style.height = `${expandedHeight}px`;
    this.context.bannerEl.style.maxHeight = `${expandedHeight}px`;

    try {
      // 1. 等待 1000ms，确保高度展开 CSS 过渡完全自然完成
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 2. 展开完成后，将过渡视频移出 body，并重置尺寸
      if (this.transitionVideo) {
        this.transitionVideo.remove();
        Object.assign(this.transitionVideo.style, {
          width: "100%",
          height: "100%",
        });
      }

      // 播放转场过渡视频
      const videoPromise = this.playTransitionVideo();

      // 3. 在过渡视频进入最上层的瞬间，隐藏并暂停待机视频
      this.idleVideo?.pause();
      this.idleVideo?.style.setProperty("display", "none");

      // 4. 静默创建游戏实例并进行加载
      const game = this.createGame();
      const initPromise = game.init();
      await Promise.all([initPromise, videoPromise]);

      this.state = "playing";

      this.startPreparedGame(game);

      this.transitionVideo?.remove();
      this.game = game;
    } catch (e) {
      console.error("[SpringExtension] Error entering game:", e);
      this.exitToIdle();
    }
  }

  private createGame(): BannerGameSpring2022 {
    const game = new BannerGameSpring2022(this.context.bannerEl);
    game.onExitRequested = () => {
      this.exitToIdle();
    };
    return game;
  }

  private startPreparedGame(game: BannerGameSpring2022): void {
    if (localStorage.getItem(STORAGE_KEY)) {
      game.focus();
      game.start();
      return;
    }

    localStorage.setItem(STORAGE_KEY, "1");
    game.showGuide();
    game.renderFirstFrame();
  }

  exitToIdle(): void {
    if (this.state === "disposed" || this.state === "idle") return;
    this.state = "idle";

    // 1. 点击退出时，先暂停游戏，保持收缩期间画面在 Canvas 里静止渲染
    this.game?.pause();

    // 将待机视频的 top 恢复到 40% 位置
    if (this.idleVideo) {
      this.idleVideo.style.top = "40%";
    }

    // 2. 启动 1s 收缩动画 (暂时不重置 maxHeight 防止产生高度突变跳跃)
    this.context.bannerEl.dispatchEvent(
      new CustomEvent("banner-expand", { detail: false }),
    );
    this.context.bannerEl.style.height = `${this.originalHeight}px`;

    // 3. 延迟 1000ms 等待完全收起后，再切换待机视频、销毁游戏并还原最大高度
    setTimeout(() => {
      if (this.state === "disposed") return;

      this.game?.destroy();
      this.game = null;

      // 完全收起后才重置最大高度限制
      this.context.bannerEl.style.maxHeight = this.originalMaxHeight;

      this.showDefaultUi();
      this.clickArea?.style.removeProperty("display");
      if (this.idleVideo) {
        this.idleVideo.style.removeProperty("display");
        if (!this.idleVideo.isConnected)
          this.insertBeforeDefaultUi(this.idleVideo);
        this.idleVideo.play().catch(() => {});
      }
    }, 1000);
  }

  dispose(): void {
    if (this.state === "disposed") return;
    this.state = "disposed";
    this.game?.destroy();
    this.game = null;
    this.clickArea?.remove();
    this.clickArea = null;
    this.showDefaultUi();
    this.logoController?.reset();
    this.restoreBannerStyles();
    this.releaseVideos();
  }

  private playTransitionVideo(): Promise<void> {
    return new Promise((resolve) => {
      const video = this.transitionVideo;
      if (!video?.readyState) {
        resolve();
        return;
      }

      video.loop = false;
      video.muted = true;
      video.playsInline = true;
      Object.assign(video.style, {
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        imageRendering: "pixelated",
        zIndex: "10",
      });

      if (!video.isConnected) {
        this.context.bannerEl.appendChild(video);
      }

      const cleanup = () => {
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("error", onEnded);
      };

      const onEnded = () => {
        cleanup();
        resolve();
      };

      video.addEventListener("ended", onEnded, { once: true });
      video.addEventListener("error", onEnded, { once: true });

      video.currentTime = 0;
      video.play().catch(() => {
        cleanup();
        resolve();
      });
    });
  }

  private styleIdleVideo(video: HTMLVideoElement): void {
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    Object.assign(video.style, {
      position: "absolute",
      top: "40%",
      left: "0",
      width: "100%",
      transform: "translateY(-50%)",
      objectFit: "cover",
      objectPosition: "center",
      imageRendering: "pixelated",
      zIndex: "1",
      transition: "top 0.6s linear",
    });
  }

  private insertBeforeDefaultUi(el: HTMLElement): void {
    const { innerEl } = queryBannerUiElements(this.context.bannerEl);
    if (innerEl) {
      this.context.bannerEl.insertBefore(el, innerEl);
    } else {
      this.context.bannerEl.appendChild(el);
    }
  }

  private createClickArea(): HTMLDivElement {
    const clickArea = document.createElement("div");
    Object.assign(clickArea.style, {
      position: "absolute",
      inset: "0",
      cursor: "pointer",
      zIndex: "2",
    });
    clickArea.addEventListener("click", () => {
      void this.enterGame();
    });
    return clickArea;
  }

  private restoreBannerStyles(): void {
    this.context.bannerEl.style.height = this.originalHeight
      ? `${this.originalHeight}px`
      : "";
    this.context.bannerEl.style.maxHeight = this.originalMaxHeight;
    this.context.bannerEl.style.overflow = this.originalOverflow;
    this.context.bannerEl.style.transition = this.originalTransition;
  }

  private showDefaultUi(): void {
    const { innerEl } = queryBannerUiElements(this.context.bannerEl);
    innerEl?.style.removeProperty("display");
    this.logoController?.show();
  }

  private hideDefaultUi(): void {
    const { innerEl } = queryBannerUiElements(this.context.bannerEl);
    innerEl?.style.setProperty("display", "none");
    this.logoController?.hide();
  }

  private releaseVideos(): void {
    if (this.idleVideo) {
      releaseVideo(this.idleVideo);
      this.idleVideo.remove();
      this.idleVideo = null;
    }
    if (this.transitionVideo) {
      releaseVideo(this.transitionVideo);
      this.transitionVideo.remove();
      this.transitionVideo = null;
    }
  }
}
