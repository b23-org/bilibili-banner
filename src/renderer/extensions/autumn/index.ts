import {
  type BannerExtension,
  type BannerExtensionContext,
  queryBannerUiElements,
} from "../core";
import { ASSETS, BASE_PATH } from "./constants";
import { ExtensionEventBus } from "./event-bus";
import { initSceneManager } from "./scene";

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
  connection?: {
    effectiveType?: string;
  };
}

interface SceneManagerHandle {
  update(deltaTime: number): void;
  resize(): void;
  changeScene(sceneName: "main" | "left" | "right"): Promise<void>;
  dispose(): void;
  onExit: () => void;
}

export default class AutumnExtension implements BannerExtension {
  private context: BannerExtensionContext | null = null;
  private container3D: HTMLDivElement | null = null;
  private clickArea: HTMLDivElement | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private sceneManager: SceneManagerHandle | null = null;
  private isExpanded = false;
  private originalHeight = 0;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeRafId: ReturnType<typeof requestAnimationFrame> | null = null;
  private boundResize: (() => void) | null = null;
  private eventBus: ExtensionEventBus | null = null;

  async prepare(context: BannerExtensionContext): Promise<boolean> {
    this.context = context;
    console.log("[AutumnExtension] Starting prepare...");

    const hasWebGL2 = !!document.createElement("canvas").getContext("webgl2");
    const hasShadowDOM = !!document.createElement("div").attachShadow;

    const nav = navigator as NavigatorWithMemory;
    const effectiveType = nav.connection?.effectiveType;
    const isSlowNetwork =
      effectiveType != null && ["slow-2g", "2g"].includes(effectiveType);
    const isLowMemory = nav.deviceMemory != null && nav.deviceMemory < 4;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (
      !(
        hasWebGL2 &&
        hasShadowDOM &&
        !isSlowNetwork &&
        !isLowMemory &&
        !isSafari
      )
    ) {
      console.log("[AutumnExtension] Capability check failed, returning false");
      return false;
    }

    try {
      const signal = context.signal;

      await new Promise<void>((resolve, reject) => {
        if (signal.aborted)
          return reject(new DOMException("Aborted", "AbortError"));

        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.crossOrigin = "anonymous";
        video.src = `${BASE_PATH}${ASSETS.videos.bgVideo}`;

        const onCanPlay = () => {
          video.removeEventListener("canplaythrough", onCanPlay);
          video.removeEventListener("error", onError);
          this.videoEl = video;
          resolve();
        };

        const onError = () => {
          video.removeEventListener("canplaythrough", onCanPlay);
          video.removeEventListener("error", onError);
          console.error("[AutumnExtension] Video load failed");
          reject(new Error("Failed to load background video"));
        };

        const onAbort = () => {
          video.removeEventListener("canplaythrough", onCanPlay);
          video.removeEventListener("error", onError);
          video.src = "";
          reject(new DOMException("Aborted", "AbortError"));
        };

        video.addEventListener("canplaythrough", onCanPlay);
        video.addEventListener("error", onError);
        signal.addEventListener("abort", onAbort, { once: true });
      });

      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return false;
      }
      console.error("[AutumnExtension] prepare failed:", error);
      return false;
    }
  }

  mount(context: BannerExtensionContext): void {
    this.context = context;
    if (!this.videoEl) {
      console.error("[AutumnExtension] No video element, cannot mount");
      return;
    }

    this.originalHeight = context.bannerEl.clientHeight;
    this.eventBus = new ExtensionEventBus();
    this.eventBus.on("sceneReady", () => {
      if (this.videoEl && this.isExpanded) {
        this.videoEl.style.display = "none";
      }
    });

    const videoEl = this.videoEl;
    videoEl.muted = true;
    videoEl.loop = true;
    videoEl.autoplay = true;
    videoEl.setAttribute("playsinline", "true");

    const videoHeight = 360 * (context.bannerEl.clientWidth / 1920);
    Object.assign(videoEl.style, {
      position: "absolute",
      transform: "translateY(-4%)",
      left: "0",
      width: "100%",
      height: `${videoHeight}px`,
      objectFit: "cover",
      objectPosition: "center",
      transition: "transform 0.6s linear",
    });

    const { innerEl, logoEl } = queryBannerUiElements(context.bannerEl);
    if (logoEl) {
      logoEl.style.setProperty("z-index", "3");
    }
    if (innerEl) {
      context.bannerEl.insertBefore(videoEl, innerEl);
    } else {
      context.bannerEl.appendChild(videoEl);
    }
    videoEl.play().catch(() => {});

    const container3D = document.createElement("div");
    container3D.className = "autumn-banner";
    Object.assign(container3D.style, {
      position: "absolute",
      top: "50%",
      transform: "translate(-50%, -50%)",
      left: "50%",
      width: "100%",
      minWidth: "1654px",
      transition: "top 0.6s linear",
    });
    this.container3D = container3D;

    if (innerEl) {
      context.bannerEl.insertBefore(container3D, innerEl);
    } else {
      context.bannerEl.appendChild(container3D);
    }

    const updateSize = (): void => {
      if (this.resizeRafId != null) cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = requestAnimationFrame(() => {
        if (!this.container3D || !this.context) return;
        const h = Math.max(this.container3D.clientWidth * 0.1875, 155);
        this.container3D.style.height = `${h}px`;
        if (this.videoEl) {
          this.videoEl.style.height = `${h}px`;
        }
        if (this.isExpanded) {
          this.context.bannerEl.style.height = `${h}px`;
          this.context.bannerEl.style.maxHeight = `${h}px`;
        }
      });
    };
    updateSize();

    this.boundResize = () => updateSize();
    window.addEventListener("resize", this.boundResize);

    context.bannerEl.style.overflow = "hidden";
    context.bannerEl.style.transition = "height 0.6s linear";

    const clickArea = document.createElement("div");
    Object.assign(clickArea.style, {
      position: "absolute",
      top: "36%",
      left: "15%",
      width: "85%",
      height: "64%",
      cursor: "pointer",
    });
    this.clickArea = clickArea;
    context.bannerEl.appendChild(clickArea);

    clickArea.addEventListener("click", (evt) => {
      if (this.isExpanded) return;

      const path = evt.composedPath();
      const isIgnored = path.some((el) => {
        const classList = (el as HTMLElement).classList;
        return (
          classList?.contains("autumn-banner") ||
          classList?.contains("inner-logo")
        );
      });
      if (isIgnored) return;

      this.expandBanner();
    });
  }

  private expandBanner(): void {
    console.log("[AutumnExtension] Expanding banner...");
    if (!this.context || !this.container3D || !this.clickArea || !this.videoEl)
      return;

    this.isExpanded = true;

    this.videoEl.pause();
    this.context.bannerEl.dispatchEvent(
      new CustomEvent("banner-expand", { detail: true }),
    );

    this.clickArea.style.display = "none";

    const { innerEl, logoEl } = queryBannerUiElements(this.context.bannerEl);
    if (innerEl) innerEl.style.display = "none";
    if (logoEl) logoEl.style.display = "none";

    const taperLine =
      this.context.bannerEl.querySelector<HTMLElement>(".taper-line");
    if (taperLine) taperLine.style.display = "none";

    const headerBar =
      this.context.bannerEl.parentElement?.querySelector<HTMLElement>(
        ".bili-header__bar",
      );
    if (headerBar) headerBar.style.display = "none";

    const expandHeight = this.context.bannerEl.clientWidth * (3 / 16);
    this.context.bannerEl.style.height = `${expandHeight}px`;
    this.context.bannerEl.style.maxHeight = `${expandHeight}px`;
    this.videoEl.style.transform = "translateY(0%)";

    this.clearTransitionTimer();
    this.transitionTimer = setTimeout(() => {
      this.initSceneManager();
    }, 600);
  }

  private initSceneManager(): void {
    if (!this.context || !this.container3D || !this.eventBus) return;

    this.sceneManager = initSceneManager(
      this.container3D,
      this.eventBus,
      BASE_PATH,
    );

    this.sceneManager.onExit = () => {
      this.collapseBanner();
    };
  }

  private collapseBanner(): void {
    console.log("[AutumnExtension] Collapsing banner...");
    if (!this.context || !this.container3D || !this.clickArea || !this.videoEl)
      return;

    this.isExpanded = false;
    this.videoEl.style.display = "block";

    this.context.bannerEl.dispatchEvent(
      new CustomEvent("banner-expand", { detail: false }),
    );

    this.context.bannerEl.style.height = `${this.originalHeight}px`;
    this.videoEl.style.transform = "translateY(-4%)";

    this.clearTransitionTimer();
    this.transitionTimer = setTimeout(() => {
      if (!this.context) return;

      this.videoEl?.play().catch(() => {});

      this.clickArea?.style.removeProperty("display");

      const { innerEl, logoEl } = queryBannerUiElements(this.context.bannerEl);
      if (innerEl) innerEl.style.removeProperty("display");
      if (logoEl) {
        logoEl.style.setProperty("display", "inline-block");
        logoEl.style.setProperty("z-index", "3");
      }

      const taperLine =
        this.context.bannerEl.querySelector<HTMLElement>(".taper-line");
      if (taperLine) taperLine.style.removeProperty("display");

      const headerBar =
        this.context.bannerEl.parentElement?.querySelector<HTMLElement>(
          ".bili-header__bar",
        );
      if (headerBar) headerBar.style.removeProperty("display");

      this.context.bannerEl.style.maxHeight = "240px";
    }, 600);
  }

  dispose(): void {
    console.log("[AutumnExtension] Starting dispose...");
    this.clearTransitionTimer();

    if (this.resizeRafId != null) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = null;
    }

    if (this.context) {
      const { innerEl, logoEl } = queryBannerUiElements(this.context.bannerEl);
      if (innerEl) innerEl.style.removeProperty("display");
      if (logoEl) {
        logoEl.style.setProperty("display", "inline-block");
        logoEl.style.removeProperty("z-index");
      }
    }

    if (this.isExpanded) {
      this.isExpanded = false;

      if (this.context) {
        const taperLine =
          this.context.bannerEl.querySelector<HTMLElement>(".taper-line");
        if (taperLine) taperLine.style.removeProperty("display");

        const headerBar =
          this.context.bannerEl.parentElement?.querySelector<HTMLElement>(
            ".bili-header__bar",
          );
        if (headerBar) headerBar.style.removeProperty("display");

        this.context.bannerEl.style.removeProperty("height");
        this.context.bannerEl.style.removeProperty("maxHeight");
        this.context.bannerEl.style.removeProperty("overflow");
        this.context.bannerEl.style.removeProperty("transition");

        this.context.bannerEl.dispatchEvent(
          new CustomEvent("banner-expand", { detail: false }),
        );
      }

      this.clickArea?.style.removeProperty("display");

      this.container3D?.style.removeProperty("top");
    } else {
      if (this.context) {
        this.context.bannerEl.style.removeProperty("overflow");
        this.context.bannerEl.style.removeProperty("transition");
      }
    }

    if (this.boundResize) {
      window.removeEventListener("resize", this.boundResize);
      this.boundResize = null;
    }

    this.sceneManager?.dispose();
    this.sceneManager = null;

    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeAttribute("src");
      this.videoEl.load();
      this.videoEl.remove();
      this.videoEl = null;
    }

    if (this.container3D) {
      this.container3D.remove();
      this.container3D = null;
    }

    if (this.clickArea) {
      this.clickArea.remove();
      this.clickArea = null;
    }

    this.eventBus?.clear();
    this.eventBus = null;
    this.context = null;
  }

  private clearTransitionTimer(): void {
    if (this.transitionTimer != null) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
  }
}
