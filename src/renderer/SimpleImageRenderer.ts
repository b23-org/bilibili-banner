import type { BannerData } from "../types";
import type { BaseRenderer } from "./BaseRenderer";
import { waitForMedia } from "./helper";

export class SimpleImageRenderer implements BaseRenderer {
  private wrapper: HTMLElement | null = null;
  private img: HTMLImageElement | null = null;

  public async preload(
    bannerConfig: BannerData,
    signal?: AbortSignal,
  ): Promise<void> {
    if (bannerConfig.type !== "simple-image") return;

    signal?.throwIfAborted();

    const src =
      import.meta.env.BASE_URL + bannerConfig.layer.src.replace(/^\//, "");

    this.img = document.createElement("img");
    this.img.src = src;

    await waitForMedia(this.img, signal);
  }

  public render(container: HTMLElement): void {
    if (!this.img) return;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "simple-image-banner";
    this.wrapper.appendChild(this.img);
    container.appendChild(this.wrapper);
  }

  public dispose(): void {
    if (this.img) {
      this.img.removeAttribute("src");
      this.img = null;
    }
    if (this.wrapper) {
      this.wrapper.remove();
      this.wrapper = null;
    }
  }
}
