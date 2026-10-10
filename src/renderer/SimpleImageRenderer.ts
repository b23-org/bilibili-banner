import type { AssetMap } from "../core/asset-map";
import { loadRefAssets } from "../core/loadRefAssets";
import type { ResourceEntry } from "../core/preload";
import type { BannerRef, SimpleImageConfig } from "../types";
import { LogoView } from "./LogoView";
import type { Renderer } from "./Renderer";

export class SimpleImageRenderer implements Renderer {
  private wrapper: HTMLElement | null = null;
  private assets: AssetMap | null = null;
  private banner: BannerRef<SimpleImageConfig> | null = null;
  private logoView = new LogoView();

  public async prepare(banner: BannerRef, signal: AbortSignal): Promise<void> {
    if (banner.config.type !== "simple-image") {
      throw new Error(
        `[SimpleImageRenderer] Invalid config type: ${banner.config.type}`,
      );
    }
    this.banner = banner as BannerRef<SimpleImageConfig>;

    const entries: ResourceEntry[] = [
      { type: "image", src: banner.config.layer.src },
    ];

    if (banner.config.logo?.src) {
      entries.push({ type: "image", src: banner.config.logo.src });
    }

    this.assets = await loadRefAssets(banner.id, entries, signal);
  }

  public mount(container: HTMLElement): void {
    if (!this.assets || !this.banner) return;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "simple-image-banner";

    const img = this.assets.takeElement(this.banner.config.layer.src);
    this.wrapper.appendChild(img);
    container.appendChild(this.wrapper);

    this.logoView.mount(container, this.assets, this.banner);
  }

  public start(): void {
    // 静态单图无动态循环或监听
  }

  public dispose(): void {
    this.logoView.dispose();
    if (this.wrapper) {
      this.wrapper.remove();
      this.wrapper = null;
    }
    this.assets?.dispose();
    this.assets = null;
    this.banner = null;
  }
}
