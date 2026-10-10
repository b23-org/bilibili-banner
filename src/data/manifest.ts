import rawManifest from "../manifest";
import type { BannerEntry } from "../types";

export type BannerManifest = Record<string, BannerEntry[]>;

/**
 * 全量 BannerEntry 列表，按日期降序排列（最新在前）
 */
export const allEntries: BannerEntry[] = [...rawManifest].sort((a, b) =>
  b.date.localeCompare(a.date),
);

/**
 * 按年份组织的 BannerManifest 字典，各年份内条目按日期降序排列
 */
const manifestMap: BannerManifest = {};

for (const entry of allEntries) {
  const year = entry.date.slice(0, 4);
  if (!manifestMap[year]) {
    manifestMap[year] = [];
  }
  manifestMap[year].push(entry);
}

export const manifest: BannerManifest = manifestMap;

/**
 * 降序唯一年份列表（如 ["2026", "2025", ...]）
 */
export const years: string[] = Object.keys(manifestMap).sort((a, b) =>
  b.localeCompare(a),
);
