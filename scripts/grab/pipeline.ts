import type { BannerRef } from "../../src/types";
import { removeDir } from "../grab-shared/fs-utils";
import { buildBannerPath, publishDir } from "../grab-shared/manifest";
import type { HandlerResult } from "./handlers";
import { handleSimpleImageBanner, handleSplitLayers } from "./handlers";
import type { BannerData } from "./parse";

// ============ 模块私有工具 ============

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parsePathInfo(filePath: string): {
  hour: number;
  tid: number;
  isPreview: boolean;
} {
  const base = filePath.split("/").pop() || "";
  const match = base.match(/-h(\d+)-t(\d+)(?:-(preview))?/);
  if (!match) {
    return { hour: 0, tid: 0, isPreview: false };
  }
  const hour = Number.parseInt(match[1], 10);
  const tid = Number.parseInt(match[2], 10);
  const isPreview = !!match[3];
  return { hour, tid, isPreview };
}

function sortRefs(refs: BannerRef[]): BannerRef[] {
  return [...refs].sort((a, b) => {
    const aInfo = parsePathInfo(a.path);
    const bInfo = parsePathInfo(b.path);

    // 1. 按分区 tid 排序 (从小到大)
    if (aInfo.tid !== bInfo.tid) {
      return aInfo.tid - bInfo.tid;
    }

    // 2. 按 h 小时 排序 (从小到大)
    if (aInfo.hour !== bInfo.hour) {
      return aInfo.hour - bInfo.hour;
    }

    // 3. 按 preview 后缀排序 (preview 排在后面)
    if (aInfo.isPreview !== bInfo.isPreview) {
      return aInfo.isPreview ? 1 : -1;
    }

    return 0;
  });
}

// ============ 管道 ============

export interface DownloadOptions {
  bannerData: BannerData;
  date: string;
  hour: string;
  tid: string;
  displayName: string;
}

export async function downloadAndPublishBanner(
  options: DownloadOptions,
): Promise<HandlerResult[]> {
  const { bannerData, date, hour, tid, displayName } = options;
  const { layers, logo, preview, link } = bannerData;
  const hasLayers = layers.length > 0;

  const baseDir = buildBannerPath(date, hour, tid);
  const simpleImageDir = hasLayers
    ? buildBannerPath(date, hour, tid, "preview")
    : baseDir;

  const localResults: HandlerResult[] = [];

  try {
    // 1. 处理 SimpleImage（包含预览图和 Logo 下载）
    const simpleResult = await handleSimpleImageBanner(
      preview,
      logo,
      date,
      simpleImageDir,
      link,
    );
    if (hasLayers) {
      simpleResult.ref.name = `${displayName} (预览)`;
    } else {
      simpleResult.ref.name = displayName;
    }
    localResults.push(simpleResult);

    // 2. 处理 SplitLayers（引用 Logo）
    if (hasLayers) {
      const layersResult = await handleSplitLayers(
        layers,
        date,
        baseDir,
        logo,
        simpleImageDir,
        link,
      );
      layersResult.ref.name = displayName;
      localResults.push(layersResult);
    }

    // 3. 发布
    for (const res of localResults) {
      publishDir(res.stagedDir, res.ref.path);
    }

    return localResults;
  } catch (error) {
    // 下载或发布中途出错，清理本次产生的 stagedDir
    for (const res of localResults) {
      if (res.stagedDir) {
        removeDir(res.stagedDir);
      }
    }
    throw error;
  }
}

export { sortRefs, today };
