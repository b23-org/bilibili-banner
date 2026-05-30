import fs from "node:fs";
import path from "node:path";

import type { BannerRef, SimpleBannerConfig } from "../../src/types";
import {
  buildDownloadCtx,
  downloadAssets,
  type FetchAssetFn,
} from "../grab-shared/download";
import {
  createStagedDir,
  extractFileName,
  prepareEmptyDir,
} from "../grab-shared/fs-utils";
import {
  generateTags,
  publishDir,
  updateManifest,
} from "../grab-shared/manifest";
import { buildHeaders, waybackFetch } from "./network";
import type { SimpleBannerData2016 } from "./types";

function createWaybackFetchFn(): FetchAssetFn {
  return async (sourceUrl: string): Promise<ArrayBuffer> => {
    const headers = buildHeaders("image", sourceUrl);
    const res = await waybackFetch(sourceUrl, headers, "buffer");
    return (res.body as Buffer).buffer as ArrayBuffer;
  };
}

export function getSimpleImageFileNames(
  assets: SimpleBannerData2016,
): string[] {
  const names = [extractFileName(assets.layerUrl)];
  if (assets.logoUrl) names.push(extractFileName(assets.logoUrl));
  return names;
}

export async function processSimpleImage(
  assets: SimpleBannerData2016,
  dateStr: string,
): Promise<string[]> {
  const stagedDir = createStagedDir(dateStr, "grab-archive");
  try {
    prepareEmptyDir(stagedDir);

    const resourceUrls = [assets.layerUrl];
    if (assets.logoUrl) resourceUrls.push(assets.logoUrl);

    const ctx = buildDownloadCtx(resourceUrls, stagedDir);
    const summary = await downloadAssets(ctx, createWaybackFetchFn());
    if (summary.failed.length > 0) {
      throw new Error(
        `资源下载失败: ${summary.failed.map((f) => f.reason).join("; ")}`,
      );
    }

    const layerFileName = extractFileName(assets.layerUrl);
    const logoFileName = assets.logoUrl
      ? extractFileName(assets.logoUrl)
      : null;

    const year = dateStr.substring(0, 4);
    const dataConfig: SimpleBannerConfig = {
      type: "simple-image",
      layer: { src: `assets/${year}/${dateStr}/${layerFileName}` },
    };
    if (logoFileName) {
      dataConfig.logo = {
        src: `assets/${year}/${dateStr}/${logoFileName}`,
      };
    }

    fs.writeFileSync(
      path.join(stagedDir, "data.json"),
      JSON.stringify(dataConfig, null, 2),
      "utf8",
    );
    console.log("已写入 data.json 配置文件");

    const refs: BannerRef[] = [
      {
        name: assets.name || dateStr,
        path: dateStr,
        tags: generateTags(dataConfig),
      },
    ];
    publishDir(stagedDir, dateStr);
    updateManifest(dateStr, refs);

    return getSimpleImageFileNames(assets);
  } finally {
    if (fs.existsSync(stagedDir)) {
      fs.rmSync(stagedDir, { recursive: true, force: true });
    }
  }
}
