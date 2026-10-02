import fs from "node:fs";
import path from "node:path";
import { filterNewEntries, mergeIdenticalSnapshots } from "./core/dedup";
import { convertSnapshotToGrabEntries } from "./core/transform";
import {
  loadAssetIndex,
  recordNewAssets,
  scanAndRebuildIndex,
} from "./infra/asset-index";
import { downloadAllEntries } from "./infra/downloader";
import { fetchAllSnapshots } from "./infra/fetcher";
import { syncManifestWithRefs } from "./infra/manifest";
import { promoteAllToAssets } from "./infra/publisher";
import { buildGrabConfig } from "./support/config";
import { createTerminalReporter } from "./support/reporter";
import type {
  BannerSnapshot,
  GrabConfig,
  GrabOptions,
  GrabResult,
  Reporter,
} from "./support/types";

/**
 * 获取当前日期和小时（本地时间）
 */
function getCurrentDateAndHour(): { date: string; hour: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    hour,
  };
}

/**
 * 检查并保存 Banner 快照中的 extensions 扩展字段至 .cache/extensions/
 */
function inspectAndArchiveExtensions(
  snapshots: readonly BannerSnapshot[],
  config: GrabConfig,
  report: Reporter,
): void {
  let hasCreatedDirectory = false;
  const recordedKeys = new Set<string>();

  for (const snapshot of snapshots) {
    if (!snapshot.extensions || Object.keys(snapshot.extensions).length === 0) {
      continue;
    }

    if (!hasCreatedDirectory) {
      if (!fs.existsSync(config.extensionsDir)) {
        fs.mkdirSync(config.extensionsDir, { recursive: true });
      }
      hasCreatedDirectory = true;
    }

    for (const [key, value] of Object.entries(snapshot.extensions)) {
      recordedKeys.add(key);
      const targetFilePath = path.join(config.extensionsDir, `${key}.json`);
      fs.writeFileSync(targetFilePath, JSON.stringify(value, null, 2), "utf8");
    }
  }

  if (recordedKeys.size > 0) {
    report({
      type: "extensions:detected",
      keys: Array.from(recordedKeys),
    });
  }
}

/**
 * 组装空结果
 */
function createEmptyGrabResult(skipped = 0): GrabResult {
  return {
    fetchedCount: 0,
    newCount: 0,
    downloadedCount: 0,
    publishedCount: 0,
    skippedCount: skipped,
  };
}

/**
 * 执行完整的 Banner 抓取流水线
 */
export async function executeGrabPipeline(
  options: GrabOptions,
): Promise<GrabResult> {
  const config = buildGrabConfig(options.config);
  const report = options.report ?? createTerminalReporter();
  const { date, hour } = getCurrentDateAndHour();

  // 1. 加载或重建去重索引（Cache-Aside）
  const assetIndex = options.rescan
    ? await scanAndRebuildIndex(config, report)
    : await loadAssetIndex(config, report);

  // 2. 网络抓取所有指定分区的 Banner 快照
  const rawSnapshots = await fetchAllSnapshots(options.tids, config, report);
  if (rawSnapshots.length === 0) {
    const emptyResult = createEmptyGrabResult();
    report({ type: "pipeline:summary", result: emptyResult });
    return emptyResult;
  }

  // 3. 跨分区相同 Banner 快照合并（纯函数）
  const uniqueSnapshots = mergeIdenticalSnapshots(rawSnapshots);

  // 4. 检查扩展字段并持久化存档
  inspectAndArchiveExtensions(uniqueSnapshots, config, report);

  // 5. 模型转换：将快照映射为抓取条目列表（纯函数）
  const allEntries = uniqueSnapshots.flatMap((snapshot) =>
    convertSnapshotToGrabEntries(snapshot, date, hour),
  );

  // 6. 基于本地去重索引过滤出新条目（纯函数，--force 跳过）
  const entriesToProcess = options.force
    ? allEntries
    : filterNewEntries(allEntries, assetIndex);

  const skippedCount = allEntries.length - entriesToProcess.length;

  if (entriesToProcess.length === 0) {
    const skippedResult: GrabResult = {
      fetchedCount: uniqueSnapshots.length,
      newCount: 0,
      downloadedCount: 0,
      publishedCount: 0,
      skippedCount,
    };
    report({ type: "pipeline:summary", result: skippedResult });
    return skippedResult;
  }

  // 7. 并发下载条目所需的全部静态资源至 .cache/staging
  const stagedEntries = await downloadAllEntries(
    entriesToProcess,
    config,
    report,
  );

  // 在下载完成与发布之间打印分隔线
  if (stagedEntries.length > 0) {
    report({ type: "pipeline:stage-separator" });
  }

  // 8. 将 staging 目录原子提升发布至 public/assets/
  const publishedEntries = await promoteAllToAssets(
    stagedEntries,
    config,
    report,
  );

  // 9. 将新发布的条目批量写入并排序 Manifest
  const publishedRefs = publishedEntries.map((p) => p.entry.ref);
  await syncManifestWithRefs(date, publishedRefs, config);

  // 10. 增量更新去重索引缓存
  await recordNewAssets(assetIndex, publishedEntries, config);

  const finalResult: GrabResult = {
    fetchedCount: uniqueSnapshots.length,
    newCount: entriesToProcess.length,
    downloadedCount: stagedEntries.length,
    publishedCount: publishedEntries.length,
    skippedCount,
  };

  report({ type: "pipeline:summary", result: finalResult });
  return finalResult;
}
