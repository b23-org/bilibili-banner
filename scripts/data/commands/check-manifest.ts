import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { BannerEntry, BannerRef, BannerTag } from "../../../src/types";
import { BANNER_TYPES_ARR } from "../../../src/types";
import { logger } from "../shared/logger";
import { ASSETS_ROOT } from "../shared/utils";

const BANNER_DIR = resolve("src/manifest");

const VALID_TAGS: BannerTag[] = ["img", "video", "split-layer", "interactive"];

async function checkTags(): Promise<boolean> {
  logger.step("[Tags] 正在检查 Banner 元数据 tags 完整性...");

  if (!existsSync(BANNER_DIR)) {
    logger.error(`Banner 数据目录未找到: ${BANNER_DIR}`);
    return false;
  }

  const files = readdirSync(BANNER_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let errorCount = 0;
  let totalRefs = 0;

  for (const file of files) {
    const filePath = resolve(BANNER_DIR, file);
    let groups: BannerEntry[];
    try {
      groups = JSON.parse(readFileSync(filePath, "utf-8")) as BannerEntry[];
    } catch (_e) {
      logger.error(`无法解析文件: ${file}`);
      continue;
    }

    for (const group of groups) {
      for (const ref of group.refs as BannerRef[]) {
        totalRefs++;
        const tags = ref.tags;
        const hasValidTag =
          Array.isArray(tags) &&
          tags.length > 0 &&
          tags.every((t) => VALID_TAGS.includes(t));

        if (!hasValidTag) {
          logger.info(`文件：src/manifest/${file}`);
          logger.error(
            `  ID：${ref.id}  tags：${JSON.stringify(tags ?? null)}`,
          );
          logger.subDivider();
          errorCount++;
        }
      }
    }
  }

  if (errorCount > 0) {
    logger.summaryDivider();
    logger.error(
      `检查完毕，共 ${totalRefs} 条，发现 ${errorCount} 条 tags 缺失或非法。`,
    );
    return false;
  }

  logger.success(`[Tags] 检查完毕，共 ${totalRefs} 条，所有 tags 均合法。`);
  return true;
}

async function checkRefs(): Promise<boolean> {
  logger.info("## [Refs] 开始检查 refs 与物理目录的一致性...");

  if (!existsSync(BANNER_DIR)) {
    logger.error(`Banner 数据目录未找到: ${BANNER_DIR}`);
    return false;
  }

  const files = readdirSync(BANNER_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const configuredPaths = new Set<string>();

  let totalRefs = 0;
  let missingDirs = 0;
  let invalidConfigs = 0;

  logger.step("[正向检查] 开始检查 refs 的资源路径和 config 数据...");

  for (const file of files) {
    const filePath = resolve(BANNER_DIR, file);
    try {
      const content = readFileSync(filePath, "utf-8");
      const groups: BannerEntry[] = JSON.parse(content);

      for (const group of groups) {
        if (!group.refs || !Array.isArray(group.refs)) continue;

        for (const ref of group.refs as BannerRef[]) {
          totalRefs++;
          const refId = ref.id;

          // 校验 id 格式，如 "2026-01-09-h00-t0"
          const match = refId.match(/^(\d{4})-(\d{2})-\d{2}/);
          if (!match) {
            logger.error(
              `[格式错误] 文件: ${file}, 日期: ${group.date}, id 格式不合法: ${refId}`,
            );
            logger.subDivider();
            continue;
          }

          const year = match[1];
          const month = match[2];
          const fullRelPath = `${year}/${month}/${refId}`;
          configuredPaths.add(fullRelPath);

          const targetDir = resolve(ASSETS_ROOT, fullRelPath);

          if (!existsSync(targetDir)) {
            missingDirs++;
            logger.error(
              `[缺失目录] 文件: ${file}, 日期: ${group.date}, 名称: ${ref.name}`,
            );
            logger.info(`   - 预期路径: ${targetDir}`);
            logger.subDivider();
          }

          if (
            !ref.config?.type ||
            !BANNER_TYPES_ARR.includes(ref.config.type)
          ) {
            invalidConfigs++;
            logger.error(
              `[非法 config] 文件: ${file}, 日期: ${group.date}, 名称: ${ref.name} (ID: ${ref.id})`,
            );
            logger.info(`   - config.type: ${ref.config?.type ?? "undefined"}`);
            logger.subDivider();
          }
        }
      }
    } catch (e) {
      logger.error(`读取/解析文件失败: ${filePath} - ${e}`);
      logger.subDivider();
    }
  }

  if (missingDirs === 0 && invalidConfigs === 0) {
    logger.success("[正向检查] 所有配置的物理目录及内嵌 config 均存在且有效。");
    logger.subDivider();
  }

  logger.step("[反向检查] 开始寻找未配置的多余物理目录...");

  let redundantDirs = 0;

  if (existsSync(ASSETS_ROOT)) {
    const years = readdirSync(ASSETS_ROOT);
    for (const year of years) {
      if (!/^\d{4}$/.test(year)) continue;

      const yearDir = resolve(ASSETS_ROOT, year);
      const stat = statSync(yearDir);
      if (!stat.isDirectory()) continue;

      const subDirs = readdirSync(yearDir);
      for (const subDir of subDirs) {
        const fullSubDir = resolve(yearDir, subDir);
        if (!statSync(fullSubDir).isDirectory()) continue;

        if (!/^\d{2}$/.test(subDir)) {
          redundantDirs++;
          logger.warn(
            `[多余物理目录] 路径: ${fullSubDir} 未在任何 JSON 的 refs 中配置！`,
          );
          continue;
        }

        const month = subDir;
        const bannerDirs = readdirSync(fullSubDir);
        for (const bannerDir of bannerDirs) {
          const fullBannerDir = resolve(fullSubDir, bannerDir);
          if (!statSync(fullBannerDir).isDirectory()) continue;

          const fullRelPath = `${year}/${month}/${bannerDir}`;
          if (!configuredPaths.has(fullRelPath)) {
            redundantDirs++;
            logger.warn(
              `[多余物理目录] 路径: ${fullBannerDir} 未在任何 JSON 的 refs 中配置！`,
            );
          }
        }
      }
    }
  }

  if (redundantDirs === 0) {
    logger.success("[反向检查] 未发现未配置的多余物理目录。");
  }

  logger.summaryDivider();
  logger.info("📊 检查完毕报告：");
  logger.info(`- 扫描 refs 数量: ${totalRefs}`);
  logger.info(`- 缺失物理目录数: ${missingDirs}`);
  logger.info(`- 非法 config 数: ${invalidConfigs}`);
  logger.info(`- 未配置的多余物理目录数: ${redundantDirs}`);

  if (missingDirs === 0 && invalidConfigs === 0 && redundantDirs === 0) {
    logger.success("数据完全一致，完美！");
    return true;
  }

  logger.error("数据发现不一致，请根据上方日志进行修复。");
  return false;
}

async function checkTid(): Promise<boolean> {
  logger.step("[Tid] 正在检查 Banner 元数据 tid 完整性...");

  if (!existsSync(BANNER_DIR)) {
    logger.error(`Banner 数据目录未找到: ${BANNER_DIR}`);
    return false;
  }

  const files = readdirSync(BANNER_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let errorCount = 0;
  let totalRefs = 0;

  for (const file of files) {
    const filePath = resolve(BANNER_DIR, file);
    let groups: BannerEntry[];
    try {
      groups = JSON.parse(readFileSync(filePath, "utf-8")) as BannerEntry[];
    } catch (_e) {
      logger.error(`无法解析文件: ${file}`);
      continue;
    }

    for (const group of groups) {
      for (const ref of group.refs as BannerRef[]) {
        totalRefs++;
        const tid = ref.tid;
        const hasValidTid = Array.isArray(tid);

        if (!hasValidTid) {
          logger.info(`文件：src/manifest/${file}`);
          logger.error(`  ID：${ref.id}  tid：${JSON.stringify(tid ?? null)}`);
          logger.subDivider();
          errorCount++;
        }
      }
    }
  }

  if (errorCount > 0) {
    logger.summaryDivider();
    logger.error(
      `检查完毕，共 ${totalRefs} 条，发现 ${errorCount} 条 tid 缺失或非法。`,
    );
    return false;
  }

  logger.success(`[Tid] 检查完毕，共 ${totalRefs} 条，所有 tid 均合法。`);
  return true;
}

export async function run(): Promise<void> {
  logger.info("## [Manifest] 开始检查 manifest 相关数据...");

  const tagsOk = await checkTags();
  logger.subDivider();

  const tidOk = await checkTid();
  logger.subDivider();

  const refsOk = await checkRefs();

  if (!tagsOk || !tidOk || !refsOk) process.exit(-1);
}
