import type { BannerEntry, BannerRef, BannerTag } from "../types";
import { allEntries, manifest, years } from "./manifest";

export const VALID_TAGS: readonly BannerTag[] = [
  "img",
  "video",
  "split-layer",
  "interactive",
] as const;

/**
 * 校验 Tag 是否为合法的 BannerTag
 */
export function isValidTag(tag: string): tag is BannerTag {
  return (VALID_TAGS as readonly string[]).includes(tag);
}

/**
 * 校验年份是否在现有年份列表中
 */
export function isValidYear(year: string): boolean {
  return years.includes(year);
}

/**
 * 根据查询条件（年份、Tag、排序）过滤并排序 BannerEntry
 */
export function queryEntries(
  year: string | null,
  tag: BannerTag | null,
  order: "asc" | "desc",
): BannerEntry[] {
  const source = year ? (manifest[year] ?? []) : allEntries;

  const filtered = tag
    ? source.filter((entry) => entry.refs.some((ref) => ref.tags.includes(tag)))
    : [...source];

  return filtered.sort((a, b) =>
    order === "asc"
      ? a.date.localeCompare(b.date)
      : b.date.localeCompare(a.date),
  );
}

/**
 * 根据 ID 查找对应的 BannerRef。
 * 策略：优先从 ID 日期前缀推演年份定位对应年度查找；未找到或无法推演时在全量中保底查找。
 */
export function findRefById(id: string): BannerRef | null {
  if (!id) {
    return null;
  }

  // 1. 尝试从前缀推演年份快速定位
  const year = id.slice(0, 4);
  if (isValidYear(year) && manifest[year]) {
    for (const entry of manifest[year]) {
      for (const ref of entry.refs) {
        if (ref.id === id) {
          return ref;
        }
      }
    }
  }

  // 2. 保底查找：全量 entries 中遍历
  for (const entry of allEntries) {
    for (const ref of entry.refs) {
      if (ref.id === id) {
        return ref;
      }
    }
  }

  return null;
}

/**
 * 根据 ID 查找包含该 ref 的 BannerEntry。
 * 策略：优先从 ID 日期前缀推演年份定位对应年度查找；未找到或无法推演时在全量中保底查找。
 */
export function findEntryByRefId(id: string): BannerEntry | null {
  if (!id) {
    return null;
  }

  const year = id.slice(0, 4);
  if (isValidYear(year) && manifest[year]) {
    for (const entry of manifest[year]) {
      if (entry.refs.some((ref) => ref.id === id)) {
        return entry;
      }
    }
  }

  for (const entry of allEntries) {
    if (entry.refs.some((ref) => ref.id === id)) {
      return entry;
    }
  }

  return null;
}

/**
 * 获取全站最新 Banner 的首个 ref ID
 */
export function getLatestBannerId(): string {
  return allEntries[0]?.refs[0]?.id ?? "";
}

/**
 * 校验 Banner ID 是否在 manifest 中有效存在
 */
export function isValidId(id: string): boolean {
  return findRefById(id) !== null;
}
