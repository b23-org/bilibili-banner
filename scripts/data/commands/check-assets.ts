import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { BannerConfig, BannerEntry } from "../../../src/types";
import { logger } from "../shared/logger";
import { ASSETS_ROOT } from "../shared/utils";

const PUBLIC_DIR = resolve("public");
const BANNER_DIR = resolve("src/manifest");

function collectAssets(data: BannerConfig): string[] {
  const assets: string[] = [];

  if (data.logo?.src) {
    assets.push(data.logo.src);
  }

  if (data.type === "official_2021") {
    for (const layer of data.layers) {
      if (Array.isArray(layer.resources)) {
        for (const res of layer.resources) {
          if (res.src) assets.push(res.src);
        }
      }
    }
  } else if (data.type === "official_2020") {
    for (const layer of data.layers) {
      if (Array.isArray(layer.images)) {
        for (const img of layer.images) {
          if (img.src) assets.push(img.src);
        }
      }
    }
  } else if (data.type === "simple-image") {
    if (data.layer?.src) assets.push(data.layer.src);
  }
  // canvas：无本地 layer 资源（体验公共资源在 public/assets/extensions/），
  // 仅 logo 已在上方统一收集
  return assets;
}

export async function run(): Promise<void> {
  logger.step("[Assets] 正在检查资源完整性...");

  if (!existsSync(BANNER_DIR)) {
    logger.error(`Banner 数据目录未找到: ${BANNER_DIR}`);
    process.exit(-1);
  }

  const manifestFiles = readdirSync(BANNER_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let totalMissing = 0;
  let totalExtra = 0;

  for (const file of manifestFiles) {
    const filePath = resolve(BANNER_DIR, file);
    let groups: BannerEntry[];
    try {
      groups = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch (_e) {
      logger.error(`无法解析 Manifest 文件: ${file}`);
      continue;
    }

    for (const group of groups) {
      if (!group.refs || !Array.isArray(group.refs)) continue;

      for (const ref of group.refs) {
        if (!ref.config) continue;

        const match = ref.id.match(/^(\d{4})-(\d{2})-\d{2}/);
        if (!match) continue;

        const year = match[1];
        const month = match[2];
        const dirPath = resolve(ASSETS_ROOT, year, month, ref.id);

        const referencedAssets = collectAssets(ref.config);
        const missing: string[] = [];
        const extra: string[] = [];

        for (const src of new Set(referencedAssets)) {
          const absolutePath = resolve(PUBLIC_DIR, src);
          if (!existsSync(absolutePath)) {
            missing.push(src);
          }
        }

        if (existsSync(dirPath)) {
          const allFiles = readdirSync(dirPath).filter((f) =>
            statSync(resolve(dirPath, f)).isFile(),
          );
          const referencedBasenames = new Set(
            referencedAssets.map((s) => basename(s)),
          );

          for (const f of allFiles) {
            if (!referencedBasenames.has(f)) {
              extra.push(f);
            }
          }
        }

        if (missing.length > 0 || extra.length > 0) {
          logger.info("");
          logger.info(`Banner: ${ref.name} (${ref.id})`);
          if (missing.length > 0) {
            totalMissing += missing.length;
            logger.warn(`  缺失资源 (${missing.length}):`);
            missing.forEach((m) => {
              logger.info(`    - ${m}`);
            });
          }
          if (extra.length > 0) {
            totalExtra += extra.length;
            logger.info(`  多余文件 (${extra.length}):`);
            extra.forEach((e) => {
              logger.info(`    - ${e}`);
            });
          }
          logger.subDivider();
        }
      }
    }
  }

  if (totalMissing === 0 && totalExtra === 0) {
    logger.success("检查完毕，未发现缺失或多余文件。");
  } else {
    logger.summaryDivider();
    logger.error(
      `检查完毕，发现 ${totalMissing} 个缺失资源，${totalExtra} 个多余文件。`,
    );
    process.exit(-1);
  }
}
