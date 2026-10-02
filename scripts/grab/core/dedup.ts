import type { BannerSnapshot, GrabEntry } from "../support/types";
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
 */
export function isEntryAlreadyCaptured(
  entry: GrabEntry,
  existingFileNames: ReadonlySet<string>,
): boolean {
  if (entry.resourceUrls.length === 0) {
    return false;
  }

  return entry.resourceUrls.every((url) => {
    const fileName = extractFileNameFromUrl(stripCdnSuffix(url));
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
