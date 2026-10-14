import type { AssetMap } from "../core/asset-map";
import type { BannerRef } from "../types";

export class LogoView {
  private imgEl: HTMLImageElement | null = null;
  private linkEl: HTMLAnchorElement | null = null;
  private logoContainer: HTMLElement | null = null;

  public mount(
    container: HTMLElement,
    assets: AssetMap,
    banner: BannerRef,
  ): void {
    const logoConfig = banner.config.logo;
    if (!logoConfig?.src) return;

    // 仅基于显式传入的 container 进行查找，不回退全局 document
    this.logoContainer = container.querySelector("#logo");
    if (!this.logoContainer) return;

    this.logoContainer.style.display = "inline-block";
    if (logoConfig.width !== undefined) {
      this.logoContainer.style.width =
        typeof logoConfig.width === "number"
          ? `${logoConfig.width}px`
          : logoConfig.width;
    }
    if (logoConfig.height !== undefined) {
      this.logoContainer.style.height =
        typeof logoConfig.height === "number"
          ? `${logoConfig.height}px`
          : logoConfig.height;
    }

    // 从 AssetMap 提取已就绪节点，复用解码成果
    const el = assets.takeElement(logoConfig.src);
    if (
      (typeof HTMLImageElement !== "undefined" &&
        el instanceof HTMLImageElement) ||
      (el as HTMLElement).tagName === "IMG"
    ) {
      el.className = "logo-img";
      (el as HTMLImageElement).alt = "logo";
      this.imgEl = el as HTMLImageElement;
      this.logoContainer.appendChild(el);
    }

    if (banner.config.link?.trim()) {
      this.linkEl = document.createElement("a");
      this.linkEl.href = banner.config.link;
      this.linkEl.target = "_blank";
      this.linkEl.className = "head-title";
      this.linkEl.textContent = banner.name || "";
      container.appendChild(this.linkEl);
    }
  }

  public dispose(): void {
    this.imgEl?.remove();
    this.linkEl?.remove();
    if (this.logoContainer) {
      this.logoContainer.style.display = "none";
      this.logoContainer.style.removeProperty("width");
      this.logoContainer.style.removeProperty("height");
    }
    this.imgEl = null;
    this.linkEl = null;
    this.logoContainer = null;
  }
}
