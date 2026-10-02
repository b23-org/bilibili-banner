import fs from "node:fs";
import path from "node:path";
import { getRegionDisplayName } from "../core/regions";
import { mapWithConcurrencyLimit } from "../support/concurrency";
import { DownloadError } from "../support/errors";
import type {
  DownloadItem,
  GrabConfig,
  GrabEntry,
  Reporter,
  StagedEntry,
} from "../support/types";
import { extractFileNameFromUrl, stripCdnSuffix } from "../support/url";

/**
 * 确保目标目录存在且为空（若已存在则递归清空重建）
 */
export async function prepareEmptyDirectory(dirPath: string): Promise<void> {
  if (fs.existsSync(dirPath)) {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  }
  await fs.promises.mkdir(dirPath, { recursive: true });
}

/**
 * 根据 entry 的资源 URL 列表构建待下载文件清单
 * 进行 URL 去重与同名不同源的文件名冲突校验
 * @throws {DownloadError} 若检测到不同 URL 映射至相同本地文件名
 */
export function buildDownloadPlan(
  resourceUrls: readonly string[],
  stagedDir: string,
): DownloadItem[] {
  const downloadItems: DownloadItem[] = [];
  const seenUrls = new Set<string>();
  const fileToSourceMap = new Map<string, string>();

  for (const rawUrl of resourceUrls) {
    const cleanUrl = stripCdnSuffix(rawUrl);
    const fileName = extractFileNameFromUrl(cleanUrl) || "unknown";

    const existingUrl = fileToSourceMap.get(fileName);
    if (existingUrl && existingUrl !== cleanUrl) {
      throw new DownloadError(
        cleanUrl,
        `检测到资源文件名冲突 [${fileName}]:\n  已记录源: ${existingUrl}\n  冲突源: ${cleanUrl}`,
      );
    }

    fileToSourceMap.set(fileName, cleanUrl);

    if (!seenUrls.has(cleanUrl)) {
      seenUrls.add(cleanUrl);
      downloadItems.push({
        sourceUrl: cleanUrl,
        fileName,
        filePath: path.join(stagedDir, fileName),
      });
    }
  }

  return downloadItems;
}

/**
 * 下载单个资源文件并写入目标路径
 */
export async function downloadSingleFile(
  item: DownloadItem,
  config: GrabConfig,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(item.sourceUrl, {
      signal: AbortSignal.timeout(config.downloadTimeoutMs),
      headers: {
        "User-Agent": config.userAgent,
      },
    });
  } catch (err: unknown) {
    throw new DownloadError(
      item.sourceUrl,
      `网络请求失败: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (!response.ok) {
    throw new DownloadError(
      item.sourceUrl,
      `HTTP 请求状态码错误: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  await fs.promises.writeFile(item.filePath, Buffer.from(arrayBuffer));
}

/**
 * 生成可读的 Banner 条目展示标题（用于终端显示）
 * 规则：始终显示 Banner 第一个分区 ID 对应的名称
 */
function formatEntryDisplayName(entry: GrabEntry): string {
  const firstTid = entry.tids[0] ?? 0;
  const regionName = getRegionDisplayName(firstTid);
  const isPreview = entry.ref.name.includes("(预览)");
  return isPreview ? `${regionName} (预览)` : regionName;
}

/**
 * 受限并发下载所有待捕获条目的全部资源到 staging 目录
 * @returns 成功下载落地的 StagedEntry 列表
 */
export async function downloadAllEntries(
  entries: readonly GrabEntry[],
  config: GrabConfig,
  report: Reporter,
): Promise<StagedEntry[]> {
  if (entries.length === 0) return [];

  // 保证根 staging 目录存在
  if (!fs.existsSync(config.stagingDir)) {
    await fs.promises.mkdir(config.stagingDir, { recursive: true });
  }

  return await mapWithConcurrencyLimit(
    entries,
    async (entry) => {
      const displayName = formatEntryDisplayName(entry);
      const stagedDir = path.resolve(config.stagingDir, entry.dirName);
      await prepareEmptyDirectory(stagedDir);

      const plan = buildDownloadPlan(entry.resourceUrls, stagedDir);
      report({
        type: "download:start",
        displayName,
        totalFiles: plan.length,
      });

      let completedFiles = 0;
      for (const item of plan) {
        try {
          await downloadSingleFile(item, config);
          completedFiles++;
          report({
            type: "download:progress",
            displayName,
            doneFiles: completedFiles,
            totalFiles: plan.length,
          });
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));
          report({ type: "download:error", displayName, error: err });
          throw err;
        }
      }

      report({ type: "download:done", displayName });
      return { entry, stagedDir };
    },
    config.downloadConcurrency,
  );
}
