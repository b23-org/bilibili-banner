import type { BannerConfig } from "../types";

export interface BaseRenderer {
  preload(bannerConfig: BannerConfig, signal?: AbortSignal): Promise<void>;
  render(container: HTMLElement): void;
  dispose(): void;
}
