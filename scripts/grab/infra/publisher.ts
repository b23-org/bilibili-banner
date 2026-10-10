import fs from "node:fs";
import path from "node:path";
import { getRegionDisplayName } from "../core/regions";
import { PublishError } from "../support/errors";
import type {
  GrabConfig,
  PublishedEntry,
  Reporter,
  StagedEntry,
} from "../support/types";

/**
 * 递归删除文件夹
 */
async function removeDirectory(dirPath: string): Promise<void> {
  if (fs.existsSync(dirPath)) {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  }
}

/**
 * 将 staging 目录原子提升至正式 assets 资源仓库
 * @throws {PublishError} 当目录移动或回滚发生不可恢复异常时抛出
 */
export async function promoteStagedEntryToAssets(
  staged: StagedEntry,
  config: GrabConfig,
): Promise<PublishedEntry> {
  const { entry, stagedDir } = staged;
  const [year, month] = entry.dirName.split("-");
  const targetAssetDir = path.resolve(
    config.assetsDir,
    year,
    month,
    entry.dirName,
  );
  const targetMonthDir = path.dirname(targetAssetDir);

  if (!fs.existsSync(targetMonthDir)) {
    await fs.promises.mkdir(targetMonthDir, { recursive: true });
  }

  const isTargetAlreadyExists = fs.existsSync(targetAssetDir);
  const backupDir = `${targetAssetDir}.bak-${Date.now()}`;

  try {
    if (isTargetAlreadyExists) {
      await fs.promises.rename(targetAssetDir, backupDir);
    }
    await fs.promises.rename(stagedDir, targetAssetDir);
    if (isTargetAlreadyExists) {
      await removeDirectory(backupDir);
    }
  } catch (err: unknown) {
    // 事务回滚：若已备份且目标已被覆盖或不存在，则还原备份
    if (!fs.existsSync(targetAssetDir) && fs.existsSync(backupDir)) {
      try {
        await fs.promises.rename(backupDir, targetAssetDir);
      } catch {
        // 回滚重试失败
      }
    }
    throw new PublishError(
      entry.dirName,
      `移动目录失败: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  // 读取已发布目录下的所有文件名，供下游更新索引使用
  const files = await fs.promises.readdir(targetAssetDir);
  return {
    entry,
    assetDir: targetAssetDir,
    fileNames: files,
  };
}

/**
 * 批量将所有 staged 条目发布至 assets 目录
 * 具备容错隔离机制：单个条目发布失败不会中断已下载的其他条目发布
 */
export async function promoteAllToAssets(
  stagedList: readonly StagedEntry[],
  config: GrabConfig,
  report: Reporter,
): Promise<PublishedEntry[]> {
  const publishedEntries: PublishedEntry[] = [];

  for (const staged of stagedList) {
    const firstTid = staged.entry.tids[0] ?? 0;
    const regionName = getRegionDisplayName(firstTid);
    const isPreview = staged.entry.ref.name.includes("(预览)");
    const tag = isPreview ? `${regionName} (预览)` : regionName;
    const displayName = `[${tag}] ${staged.entry.dirName}`;

    report({ type: "publish:start", displayName });
    try {
      const published = await promoteStagedEntryToAssets(staged, config);
      publishedEntries.push(published);
      report({ type: "publish:done", displayName });
    } catch (err: unknown) {
      console.error(
        `发布 ${displayName} 失败:`,
        err instanceof Error ? err.message : String(err),
      );
      // 清理残留的 staging 目录
      await removeDirectory(staged.stagedDir);
    }
  }

  return publishedEntries;
}
