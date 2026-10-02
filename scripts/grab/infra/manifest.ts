import fs from "node:fs";
import path from "node:path";
import type { BannerEntry, BannerRef } from "../../../src/types";
import { PublishError } from "../support/errors";
import type { GrabConfig } from "../support/types";

interface BannerPathInfo {
  hour: number;
  tid: number;
  isPreview: boolean;
}

/**
 * 从 entry 或 ref 的 id 中解析时间、分区及是否为预览的元数据
 */
export function extractBannerPathInfo(id: string): BannerPathInfo {
  const match = id.match(/-h(\d+)-t(\d+)(?:-(preview))?/);
  if (!match) {
    return { hour: 0, tid: 0, isPreview: false };
  }
  return {
    hour: Number.parseInt(match[1], 10),
    tid: Number.parseInt(match[2], 10),
    isPreview: Boolean(match[3]),
  };
}

/**
 * 对同一 BannerEntry 下的 refs 数组排序：
 * 【强制性要求】：若存在预览版本，预览版必须成为 entry 的第 1 个 ref（索引 0）。
 * 排序优先级：
 * 1. 预览版本优先（isPreview === true 排在最前面）
 * 2. 分区 tid 升序
 * 3. 时间 hour 升序
 */
export function sortBannerRefs(refs: readonly BannerRef[]): BannerRef[] {
  return [...refs].sort((a, b) => {
    const aInfo = extractBannerPathInfo(a.id);
    const bInfo = extractBannerPathInfo(b.id);

    // 【强制性要求】：若存在预览版本，预览版必须成为 entry 的第 1 个 ref
    if (aInfo.isPreview !== bInfo.isPreview) {
      return aInfo.isPreview ? -1 : 1;
    }

    if (aInfo.tid !== bInfo.tid) return aInfo.tid - bInfo.tid;
    if (aInfo.hour !== bInfo.hour) return aInfo.hour - bInfo.hour;
    return 0;
  });
}

/**
 * 对 manifest 中的所有 BannerEntry 排序：
 * 规则：先按日期排序，再按首个 ref 的 tid 和 hour 升序排序
 */
export function compareBannerEntries(a: BannerEntry, b: BannerEntry): number {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date);
  }
  const aRef = a.refs?.[0];
  const bRef = b.refs?.[0];
  if (!aRef || !bRef) return 0;

  const aInfo = extractBannerPathInfo(aRef.id);
  const bInfo = extractBannerPathInfo(bRef.id);
  if (aInfo.tid !== bInfo.tid) return aInfo.tid - bInfo.tid;
  if (aInfo.hour !== bInfo.hour) return aInfo.hour - bInfo.hour;
  return aRef.id.localeCompare(bRef.id);
}

/**
 * 纯函数：将新捕获的 refs 合并到既有 entries 列表中
 */
export function mergeRefsIntoEntries(
  existingEntries: readonly BannerEntry[],
  date: string,
  newRefs: readonly BannerRef[],
): BannerEntry[] {
  const entries: BannerEntry[] = existingEntries.map((item) => ({
    ...item,
    refs: [...(item.refs || [])],
  }));

  for (const ref of newRefs) {
    const isPreview = ref.id.endsWith("-preview");
    const pairedId = isPreview
      ? ref.id.slice(0, -"-preview".length)
      : `${ref.id}-preview`;
    const baseName = ref.name.replace(/ \(预览\)$/, "");
    const previewName = `${baseName} (预览)`;

    // 查找同一日期中属于同一个 banner 的 entry
    const targetIndex = entries.findIndex(
      (entry) =>
        entry.date === date &&
        (entry.refs || []).some(
          (r) =>
            r.id === ref.id ||
            r.id === pairedId ||
            r.name === ref.name ||
            r.name === (isPreview ? baseName : previewName),
        ),
    );

    if (targetIndex !== -1) {
      const targetEntry = entries[targetIndex];
      const refs = targetEntry.refs || [];
      const existingRefIndex = refs.findIndex(
        (r) => r.id === ref.id || r.name === ref.name,
      );

      if (existingRefIndex !== -1) {
        refs[existingRefIndex] = ref;
      } else {
        refs.push(ref);
      }
      targetEntry.refs = sortBannerRefs(refs);
    } else {
      entries.push({
        date,
        refs: sortBannerRefs([ref]),
      });
    }
  }

  entries.sort(compareBannerEntries);
  return entries;
}

/**
 * 将发布的 Banner 引用写入对应年份的 src/manifest/{year}.json
 * 使用原子替换策略写入，保证数据完整性
 */
export async function syncManifestWithRefs(
  date: string,
  refs: readonly BannerRef[],
  config: GrabConfig,
): Promise<void> {
  if (refs.length === 0) return;

  const year = date.substring(0, 4);
  const manifestFilePath = path.resolve(config.manifestDir, `${year}.json`);

  let currentEntries: BannerEntry[] = [];
  if (fs.existsSync(manifestFilePath)) {
    try {
      const content = await fs.promises.readFile(manifestFilePath, "utf8");
      currentEntries = JSON.parse(content);
    } catch (err: unknown) {
      throw new PublishError(
        manifestFilePath,
        `读取或解析既有 Manifest 失败: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  } else {
    const manifestDir = path.dirname(manifestFilePath);
    if (!fs.existsSync(manifestDir)) {
      await fs.promises.mkdir(manifestDir, { recursive: true });
    }
  }

  const updatedEntries = mergeRefsIntoEntries(currentEntries, date, refs);
  const serialized = `${JSON.stringify(updatedEntries, null, 2)}\n`;

  const tempFilePath = `${manifestFilePath}.tmp-${Date.now()}`;
  try {
    await fs.promises.writeFile(tempFilePath, serialized, "utf8");
    await fs.promises.rename(tempFilePath, manifestFilePath);
  } catch (err: unknown) {
    if (fs.existsSync(tempFilePath)) {
      await fs.promises.unlink(tempFilePath).catch(() => {});
    }
    throw new PublishError(
      manifestFilePath,
      `写入 Manifest 失败: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}
