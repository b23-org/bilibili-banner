import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "../shared/logger";
import { ASSETS_ROOT, getBannerDirectories } from "../shared/utils";

export async function run(): Promise<void> {
  logger.step("[Clean] 正在清理空目录...");
  const contexts = getBannerDirectories();

  for (const { dirPath } of contexts) {
    if (existsSync(dirPath)) {
      const files = readdirSync(dirPath).filter((f) => f !== ".DS_Store");
      if (files.length === 0) {
        logger.info(`清理空目录: ${dirPath}`);
        rmSync(dirPath, { recursive: true });
      }
    }
  }

  const yearDirs = readdirSync(ASSETS_ROOT).filter((f) =>
    statSync(resolve(ASSETS_ROOT, f)).isDirectory(),
  );
  for (const year of yearDirs) {
    const yearPath = resolve(ASSETS_ROOT, year);
    if (!statSync(yearPath).isDirectory()) continue;

    const subDirs = readdirSync(yearPath).filter((f) =>
      statSync(resolve(yearPath, f)).isDirectory(),
    );
    for (const subDir of subDirs) {
      if (/^\d{2}$/.test(subDir)) {
        const monthPath = resolve(yearPath, subDir);
        const files = readdirSync(monthPath).filter((f) => f !== ".DS_Store");
        if (files.length === 0) {
          logger.info(`清理空月份目录: ${monthPath}`);
          rmSync(monthPath, { recursive: true });
        }
      }
    }

    const files = readdirSync(yearPath).filter((f) => f !== ".DS_Store");
    if (files.length === 0) {
      logger.info(`清理空年份目录: ${yearPath}`);
      rmSync(yearPath, { recursive: true });
    }
  }
}
