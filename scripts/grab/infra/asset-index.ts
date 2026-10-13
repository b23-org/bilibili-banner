/**
 * @file asset-index.ts
 * 负责本地资产索引（scripts/grab/data/asset-index.json）的加载、扫盘重建与持久化。
 *
 * 核心架构约束：
 * asset-index.json 是历史上所有已知静态资源的“全集白名单记忆库”（受 Git 跟踪），
 * 遵循严格的 Append-Only（只增不减）原则，永久保留所有变种文件名，绝不允许因物理文件移走而反向剔除记录。
 * 详细设计推导请参阅 docs/architecture/grab-design.md
 */

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
 * 扫描磁盘目录并增量合并到已知索引文件中
 * 注意：asset-index.json 是历史上所有已知资产的永久白名单（包括已被合并/归档至 temp/ 的变种 Logo），
 * 扫盘结果必须与现有索引取并集（Union）追加，绝不能反向剔除已有文件名！
 */
export async function scanAndRebuildIndex(
  config: GrabConfig,
  report: Reporter,
): Promise<Set<string>> {
  report({
    type: "index:fallback-scan",
    reason: "正在异步扫描 public/assets 目录以更新索引",
  });

  try {
    const scannedSet = await scanAssetsDirectory(config.assetsDir);

    // 读取现有 asset-index.json（若存在），合并现有白名单，确保历史变种记录绝不丢失
    if (fs.existsSync(config.indexFilePath)) {
      try {
        const content = await fs.promises.readFile(
          config.indexFilePath,
          "utf8",
        );
        const parsed = JSON.parse(content) as Partial<IndexCachePayload>;
        if (parsed.version === 1 && Array.isArray(parsed.files)) {
          for (const file of parsed.files) {
            scannedSet.add(file);
          }
        }
      } catch {
        // 读取失败则直接使用扫盘结果
      }
    }

    // 异步回写合并后的缓存，异常不阻塞主流程
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
  for (const item of published) {
    for (const fileName of item.fileNames) {
      currentIndex.add(fileName);
    }
  }

  try {
    await persistIndexToFile(config.indexFilePath, currentIndex);
  } catch {
    // 缓存写入失败静默处理，不影响主流程交付
  }
}
