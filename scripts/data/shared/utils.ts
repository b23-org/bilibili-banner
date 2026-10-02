import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

// 被多个命令模块共用
export const ASSETS_ROOT = resolve("public/assets");

export interface BannerContext {
  yearDir: string;
  monthDir: string;
  dateDir: string;
  dirPath: string;
}

/**
 * 获取所有 Banner 目录的上下文路径
 */
export function getBannerDirectories(): BannerContext[] {
  if (!existsSync(ASSETS_ROOT)) return [];

  const results: BannerContext[] = [];
  const yearDirs = readdirSync(ASSETS_ROOT)
    .filter(
      (f) =>
        /^\d{4}$/.test(f) && statSync(resolve(ASSETS_ROOT, f)).isDirectory(),
    )
    .sort();

  for (const yearDir of yearDirs) {
    const yearPath = resolve(ASSETS_ROOT, yearDir);
    const monthDirs = readdirSync(yearPath)
      .filter(
        (f) =>
          /^\d{2}$/.test(f) && statSync(resolve(yearPath, f)).isDirectory(),
      )
      .sort();

    for (const monthDir of monthDirs) {
      const monthPath = resolve(yearPath, monthDir);
      const dateDirs = readdirSync(monthPath)
        .filter((f) => statSync(resolve(monthPath, f)).isDirectory())
        .sort();

      for (const dateDir of dateDirs) {
        const dirPath = resolve(monthPath, dateDir);
        results.push({ yearDir, monthDir, dateDir, dirPath });
      }
    }
  }
  return results;
}
