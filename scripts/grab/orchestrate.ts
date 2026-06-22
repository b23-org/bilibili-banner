import path from "node:path";
import { PROJECT_ROOT, removeDir } from "../grab-shared/fs-utils";
import { updateManifest } from "../grab-shared/manifest";
import { downloadAndPublishBanner, sortRefs, today } from "./pipeline";
import { REGIONS } from "./regions";
import { HomeBannerSource, RegionBannerSource } from "./sources";
import {
  collectExistingFileNames,
  DeduplicateStrategy,
  ForceGrabStrategy,
} from "./strategies";

export interface GrabOptions {
  targetTid?: string;
}

export async function runGrabSplit2021(
  options: GrabOptions = {},
): Promise<boolean> {
  const { targetTid } = options;
  const date = today();
  const assetsDir = path.resolve(PROJECT_ROOT, "public/assets");

  // 1. 初始化去重策略
  const skipDeduplicate = targetTid !== undefined;
  const strategy = skipDeduplicate
    ? new ForceGrabStrategy()
    : new DeduplicateStrategy(collectExistingFileNames(assetsDir));

  // 2. 初始化本次要抓取的数据源
  const sources = [];
  const shouldGrabHome = targetTid === undefined || targetTid === "0";
  if (shouldGrabHome) {
    sources.push(new HomeBannerSource());
  }

  const shouldGrabRegions = targetTid !== "0";
  if (shouldGrabRegions) {
    for (const region of REGIONS) {
      if (targetTid !== undefined && region.id.toString() !== targetTid) {
        continue;
      }
      sources.push(new RegionBannerSource(region));
    }
  }

  const d = new Date();
  const hour = String(d.getHours()).padStart(2, "0");

  // 3. 执行顺序抓取管道
  for (const source of sources) {
    try {
      const bannerData = await source.fetch();
      if (!bannerData) continue;

      if (!strategy.shouldProcess(bannerData)) {
        console.log(`[${source.name}] Banner 资源已存在，跳过下载。`);
        continue;
      }

      console.log(`开始下载 [${source.name}] Banner...`);
      const displayName =
        source.tid === "0"
          ? bannerData.name || date
          : bannerData.name && bannerData.name.trim() !== ""
            ? bannerData.name
            : source.name;

      const results = await downloadAndPublishBanner({
        bannerData,
        date,
        hour,
        tid: source.tid,
        displayName,
      });

      strategy.onSuccess(bannerData);

      // 立即更新 manifest refs
      const sortedRefs = sortRefs(results.map((r) => r.ref));
      updateManifest(date, sortedRefs);

      // 清理临时 staged 目录
      for (const res of results) {
        if (res.stagedDir) {
          removeDir(res.stagedDir);
        }
      }
    } catch (err: unknown) {
      console.error(
        `抓取 [${source.name}] 出错:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  console.log("所有指定抓取流程执行完成！");
  return true;
}
