import fs from "node:fs";
import path from "node:path";
import type { GrabConfig, PublishedEntry, Reporter } from "../support/types";

interface IndexCachePayload {
  version: number;
  updatedAt: string;
  files: string[];
}

/**
 * 异步深度递归扫描本地 assets 目录，收集所有静态资源文件名
 */
export async function scanAssetsDirectory(
  assetsDir: string,
): Promise<Set<string>> {
  const result = new Set<string>();

  if (!fs.existsSync(assetsDir)) {
    return result;
  }

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.promises.readdir(currentDir, {
      withFileTypes: true,
    });
    const subTasks: Promise<void>[] = [];

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        subTasks.push(walk(fullPath));
      } else if (entry.isFile()) {
        result.add(entry.name);
      }
    }

    await Promise.all(subTasks);
  }

  await walk(assetsDir);
  return result;
}

/**
 * 将文件名集合异步持久化到 .cache 索引文件中
 */
async function persistIndexToFile(
  filePath: string,
  fileNames: Set<string>,
): Promise<void> {
  const cacheDir = path.dirname(filePath);
  if (!fs.existsSync(cacheDir)) {
    await fs.promises.mkdir(cacheDir, { recursive: true });
  }

  const payload: IndexCachePayload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    files: Array.from(fileNames).sort(),
  };

  const tempFilePath = `${filePath}.tmp-${Date.now()}`;
  await fs.promises.writeFile(
    tempFilePath,
    JSON.stringify(payload, null, 2),
    "utf8",
  );
  await fs.promises.rename(tempFilePath, filePath);
}

/**
 * 加载去重索引（Cache-Aside 策略）
 * 1. 优先读取并解析 .cache/grab-asset-index.json。
 * 2. 若命中缓存且有效，立即返回内存 Set。
 * 3. 若缓存缺失或格式异常，自动回退到异步全量扫盘，并异步回写缓存。
 */
export async function loadAssetIndex(
  config: GrabConfig,
  report: Reporter,
): Promise<Set<string>> {
  try {
    if (fs.existsSync(config.indexFilePath)) {
      const content = await fs.promises.readFile(config.indexFilePath, "utf8");
      const parsed = JSON.parse(content) as Partial<IndexCachePayload>;

      if (parsed.version === 1 && Array.isArray(parsed.files)) {
        const fileSet = new Set(parsed.files);
        report({ type: "index:cache-hit", fileCount: fileSet.size });
        return fileSet;
      }
    }
  } catch (err: unknown) {
    report({
      type: "index:fallback-scan",
      reason: `缓存文件异常 (${err instanceof Error ? err.message : String(err)})，回退至扫盘`,
    });
  }

  return await scanAndRebuildIndex(config, report);
}

/**
 * 强制扫描磁盘目录并重新生成 .cache 索引文件
 */
export async function scanAndRebuildIndex(
  config: GrabConfig,
  report: Reporter,
): Promise<Set<string>> {
  report({
    type: "index:fallback-scan",
    reason: "正在异步扫描 public/assets 目录以重建索引",
  });

  try {
    const scannedSet = await scanAssetsDirectory(config.assetsDir);
    // 异步回写缓存，异常不阻塞主流程
    persistIndexToFile(config.indexFilePath, scannedSet).catch(() => {});
    return scannedSet;
  } catch (err: unknown) {
    report({
      type: "index:fallback-scan",
      reason: `扫描 assets 失败: ${err instanceof Error ? err.message : String(err)}`,
    });
    return new Set<string>();
  }
}

/**
 * 在抓取与发布全部成功后，将新增文件名追加到内存索引并持久化覆写缓存
 */
export async function recordNewAssets(
  currentIndex: Set<string>,
  published: readonly PublishedEntry[],
  config: GrabConfig,
): Promise<void> {
  if (published.length === 0) return;

  const previousSize = currentIndex.size;

  for (const item of published) {
    for (const fileName of item.fileNames) {
      currentIndex.add(fileName);
    }
  }

  // 若无新增文件名（如 --force 重新下载已有 Banner），则跳过写盘以避免无意义的磁盘 I/O
  if (currentIndex.size === previousSize) {
    return;
  }

  try {
    await persistIndexToFile(config.indexFilePath, currentIndex);
  } catch {
    // 缓存写入失败静默处理，不影响主流程交付
  }
}
