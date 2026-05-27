import type { LayersOfficial2021 } from "../../src/types";

export interface SimpleBannerData2016 {
  layerUrl: string;
  logoUrl: string | null;
  name: string;
}

export interface SplitBannerData2021 {
  layers: LayersOfficial2021[];
  logo?: string;
  preview?: string;
  name?: string;
  extensions?: Record<string, unknown>;
}

export const VALID_ARCHIVE_MODES = [
  "pic-2013-css-v1",
  "pic-2015-css-v2",
  "pic-2016-js",
  "pic-2019-html",
  "split-2022-html",
  "split-2022-api",
] as const;

export type ArchiveMode = (typeof VALID_ARCHIVE_MODES)[number];

export interface ArchiveArgs {
  mode: ArchiveMode;
  url: string;
}

export type BannerResult = SimpleBannerData2016 | SplitBannerData2021;

export type BannerExtractor = (
  timestamp: string,
  archivePrefix: string,
  originalUrl: string,
) => Promise<BannerResult | null>;
