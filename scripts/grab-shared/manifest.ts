import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BannerRef, DailyBannerGroup } from "../../src/types";
import { removeDir } from "./fs-utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function publishDir(stagedDir: string, date: string): void {
  const year = date.substring(0, 4);
  const targetDir = path.resolve(
    __dirname,
    `../../public/assets/${year}/${date}`,
  );

  const targetDirExists = fs.existsSync(targetDir);
  const backupDir = `${targetDir}.bak-${Date.now()}`;

  try {
    if (targetDirExists) {
      fs.renameSync(targetDir, backupDir);
    }

    fs.renameSync(stagedDir, targetDir);

    if (targetDirExists) {
      removeDir(backupDir);
    }

    console.log("已发布资源目录", path.basename(targetDir));
  } catch (error: unknown) {
    if (!fs.existsSync(targetDir) && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, targetDir);
    }
    throw error;
  }
}

export function updateManifest(date: string, refs: BannerRef[]): void {
  const year = date.substring(0, 4);
  const configFilePath = path.resolve(
    __dirname,
    `../../src/data/banner/${year}.json`,
  );

  let banners: DailyBannerGroup[] = [];
  if (fs.existsSync(configFilePath)) {
    banners = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
  }

  const existingIndex = banners.findIndex((banner) => banner.date === date);

  if (existingIndex !== -1) {
    const existingRefs = banners[existingIndex].refs || [];
    for (const ref of refs) {
      const existingRefIndex = existingRefs.findIndex(
        (variant) => variant.name === ref.name,
      );
      if (existingRefIndex !== -1) {
        const existing = existingRefs[existingRefIndex];
        if (existing.type !== ref.type || existing.path !== ref.path) {
          existingRefs[existingRefIndex] = ref;
        }
      } else {
        existingRefs.push(ref);
      }
    }
    banners[existingIndex].refs = existingRefs;
  } else {
    banners.push({ date, refs });
  }

  banners.sort((a, b) => a.date.localeCompare(b.date));
  fs.writeFileSync(configFilePath, JSON.stringify(banners, null, 2), "utf8");
  console.log(`已更新 ${year}.json 配置文件`);
}
