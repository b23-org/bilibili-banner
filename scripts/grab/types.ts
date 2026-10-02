import type {
  BannerConfig,
  BannerRef,
  LayersOfficial2021,
} from "../../src/types";

export interface BannerSnapshot {
  tid: number[];
  layers: LayersOfficial2021[];
  logo?: string;
  preview?: string;
  name?: string;
  link?: string;
  extensions?: Record<string, unknown>;
}

export interface GrabBannerEntry {
  tid: number[];
  targetDirName: string;
  ref: BannerRef;
  config: BannerConfig;
  urls: string[];
}
