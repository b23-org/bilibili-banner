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
  prepareEmptyDir,
  removeDir,
} from "../grab-shared/fs-utils";
import { publishDir, updateManifest } from "../grab-shared/manifest";
import { parseBannerData } from "./parse";

interface HandlerResult {
  stagedDir: string;
  ref: BannerRef;
}

// ============ 工具函数 ============

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractFileName(url: string): string {
  return path.posix.basename(new URL(url).pathname);
}

function writeDataJson(dir: string, data: unknown): void {
  const filePath = path.join(dir, "data.json");
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ============ 网络请求 ============

async function fetchHtml(targetUrl: string): Promise<string> {
  const response = await fetch(targetUrl, {
    signal: AbortSignal.timeout(5000),
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `获取页面源码失败: HTTP ${response.status} ${response.statusText}`,
    );
  }

  return await response.text();
}

const cdnFetch: FetchAssetFn = async (sourceUrl: string) => {
  const res = await fetch(sourceUrl, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return await res.arrayBuffer();
};

// ============ 配置构建函数 ============

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

// ============ 处理器 ============

function handleExtensions(
  extensions: Record<string, unknown> | undefined,
): void {
  if (extensions && Object.keys(extensions).length > 0) {
    const keys = Object.keys(extensions);
    console.log(
      `\x07\x1b[33m\n================================\n⚠️ 发现扩展字段 extensions: [${keys.join(", ")}]\n请手动检查是否需要特殊代码适配\n================================\n\x1b[0m`,
    );
  }
}

async function handleSimpleImageBanner(
  previewUrl: string | undefined,
  logoUrl: string | undefined,
  date: string,
  finalDirPath: string,
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

  if (previewUrl) {
    const dataConfig = buildSimpleImageData(
      previewUrl,
      logoUrl,
      year,
      finalDirPath,
    );
    writeDataJson(stagedDir, dataConfig);
  }

  return {
    stagedDir,
    ref: {
      name: date, // 默认名，外部可覆盖
      path: finalDirPath,
      type: "simple-image",
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
  );
  writeDataJson(stagedDir, dataConfig);

  return {
    stagedDir,
    ref: {
      name: date,
      path: finalDirPath,
      type: "official_2021",
    },
  };
}

// ============ 发布函数 ============

// ============ 主函数 ============

export async function runGrabSplit2021(): Promise<boolean> {
  const date = today();
  const TARGET_URL = "https://www.bilibili.com/";
  const results: HandlerResult[] = [];

  try {
    console.log(`正在请求页面源码: ${TARGET_URL}`);
    const html = await fetchHtml(TARGET_URL);

    const { layers, logo, preview, name, extensions } = parseBannerData(html);

    handleExtensions(extensions);

    const hasLayers = layers.length > 0;
    const simpleImageDir = hasLayers ? `${date}-preview` : date;

    // 1. 处理 SimpleImage (包含预览图和 Logo 下载)
    const simpleResult = await handleSimpleImageBanner(
      preview,
      logo,
      date,
      simpleImageDir,
    );
    if (hasLayers) {
      simpleResult.ref.name = name ? `${name} (预览)` : `${date} (预览)`;
    } else {
      simpleResult.ref.name = name || date;
    }
    results.push(simpleResult);

    // 2. 处理 SplitLayers (引用 Logo)
    if (hasLayers) {
      const layersResult = await handleSplitLayers(
        layers,
        date,
        date,
        logo,
        simpleImageDir,
      );
      layersResult.ref.name = name || date;
      results.push(layersResult);
    }

    // 3. 原子发布 (提交)
    console.log("所有资源已就绪，正在发布...");
    for (const res of results) {
      publishDir(res.stagedDir, res.ref.path);
    }

    // 4. 更新索引 -preview 在最后
    const sortedRefs = results
      .map((r) => r.ref)
      .sort((a, b) => {
        const aIsPreview = a.path.endsWith("-preview");
        const bIsPreview = b.path.endsWith("-preview");
        if (aIsPreview && !bIsPreview) return 1;
        if (!aIsPreview && bIsPreview) return -1;
        return 0;
      });

    updateManifest(date, sortedRefs);

    console.log("抓取完成！运行 pnpm dev 查看效果");
    return true;
  } catch (error: unknown) {
    console.error(
      "抓取出错:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  } finally {
    // 清理所有暂存目录
    for (const res of results) {
      if (res.stagedDir) {
        removeDir(res.stagedDir);
      }
    }
  }
}
