import fs from "node:fs";
import path from "node:path";
import type { BannerEntry } from "../../../src/types";
import type {
  BannerSnapshot,
  GrabConfig,
  GrabEntry,
  LogoRules,
} from "../support/types";
import { extractFileNameFromUrl, stripCdnSuffix } from "../support/url";

/**
 * 提取快照中所有涉及的纯文件名列表（统一清洗后缀并取 basename）
 */
export function extractResourceBasenamesFromSnapshot(
  snapshot: BannerSnapshot,
): string[] {
  const fileNames: string[] = [];

  const addIfPresent = (url?: string) => {
    if (url) {
      const cleanUrl = stripCdnSuffix(url);
      const name = extractFileNameFromUrl(cleanUrl);
      if (name) fileNames.push(name);
    }
  };

  addIfPresent(snapshot.preview);
  addIfPresent(snapshot.logo);

  for (const layer of snapshot.layers) {
    for (const res of layer.resources ?? []) {
      addIfPresent(res.src);
    }
  }

  return fileNames;
}

/**
 * 计算 Banner 快照的唯一资源指纹
 * 规则：将所有引用的文件名去重、按字母升序排序后使用 "|" 拼接
 */
export function computeSnapshotFingerprint(snapshot: BannerSnapshot): string {
  const names = extractResourceBasenamesFromSnapshot(snapshot);
  if (names.length === 0) return "";
  const uniqueNames = Array.from(new Set(names)).sort();
  return uniqueNames.join("|");
}

/**
 * 合并跨分区的同款 Banner 快照
 * 若两个分区下发的 Banner 资源完全相同，则合并它们的 tids，不产生重复条目
 * 纯函数，返回全新的快照列表
 */
export function mergeIdenticalSnapshots(
  snapshots: readonly BannerSnapshot[],
): BannerSnapshot[] {
  const fingerprintToIndex = new Map<string, number>();
  const mergedSnapshots: BannerSnapshot[] = [];

  for (const snapshot of snapshots) {
    const fingerprint = computeSnapshotFingerprint(snapshot);
    if (!fingerprint) continue;

    const existingIndex = fingerprintToIndex.get(fingerprint);

    if (existingIndex === undefined) {
      fingerprintToIndex.set(fingerprint, mergedSnapshots.length);
      mergedSnapshots.push({
        ...snapshot,
        tids: [...snapshot.tids].sort((a, b) => a - b),
      });
    } else {
      const existing = mergedSnapshots[existingIndex];
      const mergedTids = Array.from(
        new Set([...existing.tids, ...snapshot.tids]),
      ).sort((a, b) => a - b);

      mergedSnapshots[existingIndex] = {
        ...existing,
        tids: mergedTids,
      };
    }
  }

  return mergedSnapshots;
}

/**
 * 判断指定条目是否已经被本地库完全捕获（即所有引用资源文件名均已存在于已有文件集合中）
 * 规则：将 entry 的图层/预览资源列表与 Logo 视作一个整体。所有文件均已存在才算已捕获；任一文件缺失即为新条目。
 */
export function isEntryAlreadyCaptured(
  entry: GrabEntry,
  existingFileNames: ReadonlySet<string>,
): boolean {
  if (entry.resourceUrls.length === 0) {
    return false;
  }

  const allItems: string[] = [...entry.resourceUrls];
  if (entry.logoInfo?.fileName) {
    allItems.push(entry.logoInfo.fileName);
  }

  return allItems.every((item) => {
    const fileName = extractFileNameFromUrl(stripCdnSuffix(item));
    return fileName ? existingFileNames.has(fileName) : false;
  });
}

/**
 * 纯函数：根据本地已知资源文件名集合，过滤出真正需要抓取的新条目
 */
export function filterNewEntries(
  entries: readonly GrabEntry[],
  existingFileNames: ReadonlySet<string>,
): GrabEntry[] {
  return entries.filter(
    (entry) => !isEntryAlreadyCaptured(entry, existingFileNames),
  );
}

/**
 * 遍历全量 Manifest 实时投影切图文件名，并合并 logo-rules.json.variants 变种白名单
 * 构建纯内存已知资产集合，耗时仅约 20ms，零磁盘缓存维护成本
 */
export function loadKnownAssetIndex(config: GrabConfig): Set<string> {
  const knownFileNames = new Set<string>();

  // 1. 遍历 src/manifest/*.json 提取所有条目的切图引用 (layer, logo, preview)
  if (fs.existsSync(config.manifestDir)) {
    const files = fs
      .readdirSync(config.manifestDir)
      .filter((f) => f.endsWith(".json"));

    for (const file of files) {
      const fullPath = path.join(config.manifestDir, file);
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        const entries = JSON.parse(content) as BannerEntry[];
        for (const entry of entries) {
          for (const ref of entry.refs ?? []) {
            const cfg = ref.config;
            if (!cfg) continue;

            if (cfg.logo?.src) {
              const name = path.basename(cfg.logo.src);
              if (name) knownFileNames.add(name);
            }

            if (cfg.type === "simple-image" && cfg.layer?.src) {
              const name = path.basename(cfg.layer.src);
              if (name) knownFileNames.add(name);
            } else if (
              cfg.type === "official_2021" &&
              Array.isArray(cfg.layers)
            ) {
              for (const layer of cfg.layers) {
                for (const res of layer.resources ?? []) {
                  if (res.src) {
                    const name = path.basename(res.src);
                    if (name) knownFileNames.add(name);
                  }
                }
              }
            }
          }
        }
      } catch (err: unknown) {
        console.warn(`[Warn] 读取 Manifest 失败: ${fullPath}`, err);
      }
    }
  }

  // 2. 加载 logo-rules.json 中的 variants 白名单
  if (fs.existsSync(config.logoRulesFilePath)) {
    try {
      const content = fs.readFileSync(config.logoRulesFilePath, "utf8");
      const rules = JSON.parse(content) as Partial<LogoRules>;
      if (Array.isArray(rules.variants)) {
        for (const variant of rules.variants) {
          if (variant) knownFileNames.add(path.basename(variant));
        }
      }
    } catch (err: unknown) {
      console.warn(
        `[Warn] 读取 logo-rules.json 失败: ${config.logoRulesFilePath}`,
        err,
      );
    }
  }

  return knownFileNames;
}
