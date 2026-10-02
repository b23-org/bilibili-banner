import fs from "node:fs";
import path from "node:path";
import {
  extractFileNameFromUrl,
  PROJECT_ROOT,
  stripBilibiliSuffix,
} from "./helpers";
import { REGIONS } from "./regions";
import type { GrabBannerEntry } from "./types";

function prepareEmptyDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

export interface AssetDownloadItem {
  sourceUrl: string;
  fileName: string;
  filePath: string;
}

export function buildDownloadList(
  resourceUrls: string[],
  stagedDir: string,
): AssetDownloadItem[] {
  const ctx: AssetDownloadItem[] = [];
  const seenUrls = new Set<string>();
  const fileSourceMap = new Map<string, string>();

  for (const rawUrl of resourceUrls) {
    const sourceUrl = stripBilibiliSuffix(rawUrl);
    const fileName = extractFileNameFromUrl(sourceUrl) || "unknown";

    const existingSource = fileSourceMap.get(fileName);
    if (existingSource && existingSource !== sourceUrl) {
      throw new Error(
        `资源文件名冲突: ${fileName}\n${existingSource}\n${sourceUrl}`,
      );
    }

    fileSourceMap.set(fileName, sourceUrl);

    if (!seenUrls.has(sourceUrl)) {
      seenUrls.add(sourceUrl);
      ctx.push({
        sourceUrl,
        fileName,
        filePath: path.join(stagedDir, fileName),
      });
    }
  }

  return ctx;
}

async function downloadSingleAsset(item: AssetDownloadItem): Promise<void> {
  const res = await fetch(item.sourceUrl, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(item.filePath, Buffer.from(arrayBuffer));
}

/**
 * 并发下载所有 entry 的资源
 * @returns Map 记录每个 entry 对应的 stage 目录路径
 */
export async function downloadAssets(
  entries: GrabBannerEntry[],
): Promise<Map<GrabBannerEntry, string>> {
  const entryStagedDirMap = new Map<GrabBannerEntry, string>();

  if (entries.length === 0) return entryStagedDirMap;

  console.log(`\n准备下载 ${entries.length} 个 Banner...`);

  // Allocate terminal lines
  for (let i = 0; i < entries.length; i++) {
    process.stdout.write("\n");
  }

  const updateProgress = (index: number, text: string) => {
    // Jump up to the specific line, clear it, write text, and jump back down
    const linesUp = entries.length - index;
    process.stdout.write(`\x1b[${linesUp}A\x1b[K${text}\x1b[${linesUp}B\r`);
  };

  const promises = entries.map(async (entry, index) => {
    const formattedRegions = entry.tid
      .map((tid) => {
        const name =
          tid === 0 ? "主站" : REGIONS.find((r) => r.id === tid)?.name || tid;
        return `${name}#${tid}`;
      })
      .join(", ");
    const isPreview = entry.ref.name.includes("(预览)");
    const displayName = isPreview
      ? `\x1b[4m${formattedRegions} (预览)\x1b[24m`
      : `\x1b[4m${formattedRegions}\x1b[24m`;

    try {
      updateProgress(
        index,
        `${displayName} [0/${entry.urls.length}] 下载中...`,
      );

      const stagedDir = path.resolve(PROJECT_ROOT, "temp", entry.targetDirName);
      prepareEmptyDir(stagedDir);
      entryStagedDirMap.set(entry, stagedDir);

      const downloadList = buildDownloadList(entry.urls, stagedDir);
      let successCount = 0;

      for (const item of downloadList) {
        await downloadSingleAsset(item);
        successCount++;
        updateProgress(
          index,
          `${displayName} [${successCount}/${downloadList.length}] 下载中...`,
        );
      }

      updateProgress(
        index,
        `${displayName} [${successCount}/${downloadList.length}] 下载完毕`,
      );
    } catch (err: unknown) {
      updateProgress(
        index,
        `\x1b[31m${displayName} [错误] ${err instanceof Error ? err.message : String(err)}\x1b[0m`,
      );
      throw err; // Re-throw to be caught by Promise.allSettled if we want, or just fail fast.
    }
  });

  // We await all, if any throws we will reject the whole Promise.all
  await Promise.all(promises);
  console.log("\n所有下载任务执行完成！");

  return entryStagedDirMap;
}
