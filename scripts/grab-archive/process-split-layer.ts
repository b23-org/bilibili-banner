import fs from "node:fs";
import path from "node:path";
import type {
  BannerConfigOfficial2021,
  BannerRef,
  LayersOfficial2021,
  SimpleBannerConfig,
} from "../../src/types";
import {
  buildDownloadCtx,
  downloadAssets,
  type FetchAssetFn,
} from "../grab-shared/download";
import {
  createStagedDir,
  extractFileName,
  prepareEmptyDir,
  removeDir,
} from "../grab-shared/fs-utils";
import {
  buildBannerPath,
  generateTags,
  publishDir,
  updateManifest,
} from "../grab-shared/manifest";
import { toOriginalCdnUrl } from "../grab-shared/url";
import type { SplitBannerData2021 } from "./types";

const cdnFetch: FetchAssetFn = async (sourceUrl: string) => {
  const cdnUrl = toOriginalCdnUrl(sourceUrl);
  const res = await fetch(cdnUrl, {
    signal: AbortSignal.timeout(10000),
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

function buildSimpleImageData(
  previewUrl: string,
  logoUrl: string | undefined,
  year: string,
  dirPath: string,
): SimpleBannerConfig {
  const output: SimpleBannerConfig = {
    type: "simple-image",
    layer: { src: `assets/${year}/${dirPath}/${extractFileName(previewUrl)}` },
  };
  if (logoUrl) {
    output.logo = {
      src: `assets/${year}/${dirPath}/${extractFileName(logoUrl)}`,
    };
  }
  return output;
}

function buildSplitLayerData(
  layers: LayersOfficial2021[],
  logoUrl: string | undefined,
  year: string,
  date: string,
  logoDir?: string,
): BannerConfigOfficial2021 {
  const basePath = `assets/${year}/${date}`;
  const logoPath = `assets/${year}/${logoDir || date}`;
  const outLayers = layers.map((layer) => ({
    ...layer,
    resources: layer.resources?.map((res) => ({
      ...res,
      src: `${basePath}/${extractFileName(res.src)}`,
    })),
  }));
  const output: BannerConfigOfficial2021 = {
    type: "official_2021",
    layers: outLayers,
  };
  if (logoUrl) {
    output.logo = { src: `${logoPath}/${extractFileName(logoUrl)}` };
  }
  return output;
}

interface HandlerResult {
  stagedDir: string;
  ref: BannerRef;
}

async function handleSimpleImageBanner(
  previewUrl: string | undefined,
  logoUrl: string | undefined,
  date: string,
  finalDirPath: string,
): Promise<HandlerResult> {
  const year = date.split("-")[0];
  const stagedDir = createStagedDir(date, "grab-archive-simple");
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
    dataConfig = buildSimpleImageData(previewUrl, logoUrl, year, finalDirPath);
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

async function handleSplitLayers(
  layers: LayersOfficial2021[],
  date: string,
  finalDirPath: string,
  logoUrl: string | undefined,
  logoDirName: string,
): Promise<HandlerResult> {
  const year = date.split("-")[0];
  const stagedDir = createStagedDir(date, "grab-archive-layers");
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

export function getSplitLayerFileNames(data: SplitBannerData2021): string[] {
  const names: string[] = [];
  if (data.preview) names.push(extractFileName(data.preview));
  if (data.logo) names.push(extractFileName(data.logo));
  for (const layer of data.layers) {
    for (const res of layer.resources || []) {
      if (res.src) names.push(extractFileName(res.src));
    }
  }
  return names;
}

export async function processSplitLayer(
  data: SplitBannerData2021,
  dateStr: string,
  timestamp: string,
): Promise<string[]> {
  const hasLayers = data.layers.length > 0;
  console.log(`📦 [处理资源]`);
  console.log(`  日期: ${dateStr}`);
  if (hasLayers) {
    console.log(`  图层数量: ${data.layers.length}`);
  }
  if (data.preview) console.log(`  预览图 URL: ${data.preview}`);
  if (data.logo) console.log(`  Logo URL: ${data.logo}`);

  const hour = timestamp.slice(8, 10) || "00";
  const baseDir = buildBannerPath(dateStr, hour, "0");
  const simpleImageDir = hasLayers
    ? buildBannerPath(dateStr, hour, "0", "preview")
    : baseDir;
  const results: HandlerResult[] = [];

  if (data.extensions && Object.keys(data.extensions).length > 0) {
    const keys = Object.keys(data.extensions);
    console.log(
      `\x07\x1b[33m\n================================\n⚠️ 发现扩展字段 extensions: [${keys.join(", ")}]\n================================\n\x1b[0m`,
    );
  }

  try {
    const simpleResult = await handleSimpleImageBanner(
      data.preview,
      data.logo,
      dateStr,
      simpleImageDir,
    );
    if (hasLayers) {
      simpleResult.ref.name = data.name
        ? `${data.name} (预览)`
        : `${dateStr} (预览)`;
    } else {
      simpleResult.ref.name = data.name || dateStr;
    }
    results.push(simpleResult);

    if (hasLayers) {
      const layersResult = await handleSplitLayers(
        data.layers,
        dateStr,
        baseDir,
        data.logo,
        simpleImageDir,
      );
      layersResult.ref.name = data.name || dateStr;
      results.push(layersResult);
    }

    console.log("所有资源已就绪，正在发布...");
    for (const res of results) {
      publishDir(res.stagedDir, res.ref.path);
    }

    const sortedRefs = results
      .map((r) => r.ref)
      .sort((a, b) => {
        const aIsPreview = a.path.endsWith("-preview");
        const bIsPreview = b.path.endsWith("-preview");
        if (aIsPreview && !bIsPreview) return 1;
        if (!aIsPreview && bIsPreview) return -1;
        return 0;
      });

    updateManifest(dateStr, sortedRefs);

    return getSplitLayerFileNames(data);
  } finally {
    for (const res of results) {
      if (res.stagedDir) {
        removeDir(res.stagedDir);
      }
    }
  }
}
