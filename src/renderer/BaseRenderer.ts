import type { BannerData } from "../types";

export interface BaseRenderer {
  preload(bannerConfig: BannerData, signal?: AbortSignal): Promise<void>;
  render(container: HTMLElement): void;
  dispose(): void;
}
