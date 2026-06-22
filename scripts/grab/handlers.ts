import fs from "node:fs";
import path from "node:path";
import type {
  BannerRef,
  LayersOfficial2021,
  SimpleBannerConfig,
} from "../../src/types";
import {
  buildDownloadCtx,
  downloadAssets,
  type FetchAssetFn,
} from "../grab-shared/download";
import { createStagedDir, prepareEmptyDir } from "../grab-shared/fs-utils";
import { generateTags } from "../grab-shared/manifest";
import { buildSimpleImageData, buildSplitLayerData } from "./builder";

// ============ 模块私有工具 ============

const cdnFetch: FetchAssetFn = async (sourceUrl: string) => {
  const res = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return await res.arrayBuffer();
};

function writeDataJson(dir: string, data: unknown): void {
  const filePath = path.join(dir, "data.json");
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ============ 处理结果 ============

export interface HandlerResult {
  stagedDir: string;
  ref: BannerRef;
}

// ============ 处理器 ============

export async function handleSimpleImageBanner(
  previewUrl: string | undefined,
  logoUrl: string | undefined,
  date: string,
  finalDirPath: string,
  link?: string,
): Promise<HandlerResult> {
  const year = date.split("-")[0];
  const stagedDir = createStagedDir(date, "simple");
  prepareEmptyDir(stagedDir);

  const resourceUrls: string[] = [];
  if (previewUrl) resourceUrls.push(previewUrl);
  if (logoUrl) resourceUrls.push(logoUrl);

  const ctx = buildDownloadCtx(resourceUrls, stagedDir);
  const summary = await downloadAssets(ctx, cdnFetch);
  if (summary.failed.length > 0) {
    throw new Error(
      `SimpleImage 资源下载失败: ${summary.failed.map((f) => f.reason).join("; ")}`,
    );
  }

  let dataConfig: SimpleBannerConfig | undefined;
  if (previewUrl) {
    dataConfig = buildSimpleImageData(
      previewUrl,
      logoUrl,
      year,
      finalDirPath,
      link,
    );
    writeDataJson(stagedDir, dataConfig);
  }

  return {
    stagedDir,
    ref: {
      name: date,
      path: finalDirPath,
      tags: dataConfig ? generateTags(dataConfig) : ["img"],
    },
  };
}

export async function handleSplitLayers(
  layers: LayersOfficial2021[],
  date: string,
  finalDirPath: string,
  logoUrl: string | undefined,
  logoDirName: string,
  link?: string,
): Promise<HandlerResult> {
  const year = date.split("-")[0];
  const stagedDir = createStagedDir(date, "layers");
  prepareEmptyDir(stagedDir);

  const resourceUrls: string[] = [];
  for (const layer of layers) {
    for (const res of layer.resources || []) {
      if (res.src) resourceUrls.push(res.src);
    }
  }

  const ctx = buildDownloadCtx(resourceUrls, stagedDir);
  const summary = await downloadAssets(ctx, cdnFetch);
  if (summary.failed.length > 0) {
    throw new Error(
      `Layers 资源下载失败: ${summary.failed.map((f) => f.reason).join("; ")}`,
    );
  }

  const dataConfig = buildSplitLayerData(
    layers,
    logoUrl,
    year,
    finalDirPath,
    logoDirName,
    link,
  );
  writeDataJson(stagedDir, dataConfig);

  return {
    stagedDir,
    ref: {
      name: date,
      path: finalDirPath,
      tags: generateTags(dataConfig),
    },
  };
}
