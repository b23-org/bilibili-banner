import type {
  BannerConfig,
  BannerEntry,
  BannerRef,
  BannerTag,
  LayersOfficial2021,
  Official2021BannerConfig,
  SimpleBannerConfig,
} from "../../../src/types";

// ─── 抓取阶段中间产物 ───

/** 从网络抓取到的 banner 原始快照，尚未处理为最终格式 */
export interface BannerSnapshot {
  readonly tids: readonly number[];
  readonly layers: readonly LayersOfficial2021[];
  readonly logo?: string;
  readonly preview?: string;
  readonly name?: string;
  readonly link?: string;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

// ─── 管道处理实体 ───

/** 经模型转换后、待下载和发布的完整条目 */
export interface GrabEntry {
  readonly tids: readonly number[];
  readonly dirName: string;
  readonly ref: BannerRef;
  readonly config: BannerConfig;
  readonly resourceUrls: readonly string[];
}

/** 已下载到 staging 目录的条目 */
export interface StagedEntry {
  readonly entry: GrabEntry;
  readonly stagedDir: string;
}

/** 已发布到 assets 目录的条目 */
export interface PublishedEntry {
  readonly entry: GrabEntry;
  readonly assetDir: string;
  readonly fileNames: readonly string[];
}

// ─── 配置与选项 ───

export interface GrabConfig {
  readonly projectRoot: string;
  readonly assetsDir: string; // public/assets
  readonly manifestDir: string; // src/manifest
  readonly cacheDir: string; // .cache
  readonly stagingDir: string; // .cache/staging
  readonly extensionsDir: string; // .cache/extensions
  readonly indexFilePath: string; // .cache/grab-asset-index.json
  readonly fetchTimeoutMs: number;
  readonly downloadTimeoutMs: number;
  readonly downloadConcurrency: number;
  readonly userAgent: string;
}

export interface GrabOptions {
  readonly tids: readonly number[];
  readonly force: boolean;
  readonly rescan: boolean;
  readonly config?: Partial<GrabConfig>;
  readonly report?: Reporter;
}

export interface GrabResult {
  readonly fetchedCount: number;
  readonly newCount: number;
  readonly downloadedCount: number;
  readonly publishedCount: number;
  readonly skippedCount: number;
}

// ─── 进度报告事件系统 ───

export type GrabEvent =
  | { readonly type: "fetch:start"; readonly regionName: string }
  | { readonly type: "fetch:done"; readonly regionName: string }
  | {
      readonly type: "fetch:skip";
      readonly regionName: string;
      readonly reason: string;
    }
  | {
      readonly type: "fetch:error";
      readonly regionName: string;
      readonly error: Error;
    }
  | {
      readonly type: "download:start";
      readonly displayName: string;
      readonly totalFiles: number;
    }
  | {
      readonly type: "download:progress";
      readonly displayName: string;
      readonly doneFiles: number;
      readonly totalFiles: number;
    }
  | { readonly type: "download:done"; readonly displayName: string }
  | {
      readonly type: "download:error";
      readonly displayName: string;
      readonly error: Error;
    }
  | { readonly type: "publish:start"; readonly displayName: string }
  | { readonly type: "publish:done"; readonly displayName: string }
  | { readonly type: "pipeline:stage-separator" }
  | { readonly type: "index:cache-hit"; readonly fileCount: number }
  | { readonly type: "index:fallback-scan"; readonly reason: string }
  | { readonly type: "extensions:detected"; readonly keys: readonly string[] }
  | { readonly type: "pipeline:summary"; readonly result: GrabResult };

export type Reporter = (event: GrabEvent) => void;

// ─── 下载清单项 ───

export interface DownloadItem {
  readonly sourceUrl: string;
  readonly fileName: string;
  readonly filePath: string;
}

// ─── API 原始数据结构 ───

export interface RawBannerData {
  readonly litpic?: string;
  readonly pic?: string;
  readonly name?: string;
  readonly url?: string;
  readonly is_split_layer?: number | boolean;
  readonly split_layer?:
    | string
    | {
        layers?: LayersOfficial2021[];
        extensions?: Record<string, unknown>;
      }
    | Record<string, unknown>;
}

export type {
  BannerConfig,
  BannerEntry,
  BannerRef,
  BannerTag,
  LayersOfficial2021,
  Official2021BannerConfig,
  SimpleBannerConfig,
};
