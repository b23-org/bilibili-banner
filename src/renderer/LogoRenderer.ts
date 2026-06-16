import type { LogoConfig } from "../types";
import { waitForMedia } from "./helper";

export class LogoRenderer {
  private imgEl: HTMLImageElement | null = null;
  private container: HTMLElement | null;
  private linkEl: HTMLAnchorElement | null = null;

  constructor() {
    this.container = document.getElementById("logo");
  }

  public async preload(
    config: NonNullable<LogoConfig["logo"]>,
    signal?: AbortSignal,
  ): Promise<void> {
    const img = document.createElement("img");
    img.className = "logo-img";
    img.src = import.meta.env.BASE_URL + config.src.replace(/^\//, "");
    img.alt = "";

    await waitForMedia(img, signal);
    this.imgEl = img;
  }

  public render(
    config: NonNullable<LogoConfig["logo"]>,
    link?: string,
    name?: string,
  ): void {
    if (!this.container) return;

    this.container.style.display = "inline-block";

    if (config.width !== undefined) {
      this.container.style.width =
        typeof config.width === "number" ? `${config.width}px` : config.width;
    }
    if (config.height !== undefined) {
      this.container.style.height =
        typeof config.height === "number"
          ? `${config.height}px`
          : config.height;
    }

    if (this.imgEl) {
      this.container.appendChild(this.imgEl);
    }

    if (link && link.trim() !== "") {
      this.linkEl = document.createElement("a");
      this.linkEl.href = link;
      this.linkEl.target = "_blank";
      this.linkEl.className = "head-title";
      this.linkEl.textContent = name || "";

      const bannerContainer = document.getElementById("banner-container");
      if (bannerContainer) {
        bannerContainer.appendChild(this.linkEl);
      }
    }
  }

  public dispose(): void {
    if (this.linkEl) {
      this.linkEl.remove();
      this.linkEl = null;
    }

    if (this.container) {
      this.container.style.display = "none";
      this.container.style.removeProperty("width");
      this.container.style.removeProperty("height");
    }

    if (this.imgEl) {
      this.imgEl.removeAttribute("src");
      this.imgEl.remove();
      this.imgEl = null;
    }
  }
}
