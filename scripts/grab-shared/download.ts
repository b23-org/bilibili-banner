import fs from "node:fs";
import path from "node:path";
import { stripBilibiliSuffix } from "./url";

interface AssetDownloadCtx {
  sourceUrl: string;
  fileName: string;
  filePath: string;
}
export type FetchAssetFn = (sourceUrl: string) => Promise<ArrayBuffer>;

interface DownloadSummary {
  total: number;
  successCount: number;
  failed: Array<{ url: string; reason: string }>;
}

export function buildDownloadCtx(
  resourceUrls: string[],
  stagedDir: string,
): AssetDownloadCtx[] {
  const ctx: AssetDownloadCtx[] = [];
  const seenUrls = new Set<string>();
  const fileSourceMap = new Map<string, string>();

  for (const rawUrl of resourceUrls) {
    const sourceUrl = stripBilibiliSuffix(rawUrl);
    const fileName =
      path.posix.basename(new URL(sourceUrl).pathname) || "unknown";

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

export async function downloadAssets(
  ctx: AssetDownloadCtx[],
  fetchAsset: FetchAssetFn,
): Promise<DownloadSummary> {
  const total = ctx.length;
  console.log(`开始下载资源素材 (共 ${total} 个)...`);
  let successCount = 0;
  const failed: DownloadSummary["failed"] = [];

  for (const task of ctx) {
    process.stdout.write(`\r📥 下载进度: (${successCount + 1}/${total}) `);
    try {
      const arrayBuffer = await fetchAsset(task.sourceUrl);
      fs.writeFileSync(task.filePath, Buffer.from(arrayBuffer));
      successCount++;
    } catch (error: unknown) {
      process.stdout.write("\n");
      failed.push({
        url: task.sourceUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  process.stdout.write("\n");
  return { total, successCount, failed };
}
