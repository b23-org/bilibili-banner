import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv, { type ValidateFunction } from "ajv";
import * as TJS from "ts-json-schema-generator";
import type {
  BannerConfig,
  BannerConfigOfficial2020,
  BannerConfigOfficial2021,
  BannerRef,
  BannerTag,
  DailyBannerGroup,
  SimpleBannerConfig,
} from "../src/types";

// 显式引用这些类型以消除 TypeScript 和 Biome 的未使用警告
// 这些类型在逻辑上是通过字符串名称在 targets 中引用的
void ({} as unknown as [
  BannerConfigOfficial2020,
  BannerConfigOfficial2021,
  SimpleBannerConfig,
]);

// 常量配置
const SCHEMA_DIR = "temp/schema";
const ASSETS_ROOT = resolve("public/assets");
const PUBLIC_DIR = resolve("public");
const BANNER_DIR = resolve("src/data/banner");
const TSCONFIG_PATH = resolve("tsconfig.json");
const SCHEMAS_NAMES = {
  OFFICIAL_2020: "banner-splitlayer-official-2020-schema.json",
  OFFICIAL_2021: "banner-splitlayer-official-2021-schema.json",
  SIMPLE: "banner-simple-schema.json",
};

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * 加载并编译 Schema
 */
function getValidator(fileName: string): ValidateFunction {
  const path = resolve(SCHEMA_DIR, fileName);
  if (!existsSync(path)) {
    throw new Error(
      `未找到 Schema 文件: ${fileName}。请先运行 'generate' 命令。`,
    );
  }
  const schema = JSON.parse(readFileSync(path, "utf-8"));
  return ajv.compile(schema);
}

/**
 * 提取 data.json 中引用的所有资源路径
 */
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
  return assets;
}

/**
 * 获取所有 Banner 目录的上下文路径
 */
interface BannerContext {
  yearDir: string;
  dateDir: string;
  dirPath: string;
  dataPath: string;
}

function getBannerDirectories(): BannerContext[] {
  if (!existsSync(ASSETS_ROOT)) return [];

  const results: BannerContext[] = [];
  const yearDirs = readdirSync(ASSETS_ROOT)
    .filter((f) => statSync(resolve(ASSETS_ROOT, f)).isDirectory())
    .sort();

  for (const yearDir of yearDirs) {
    const yearPath = resolve(ASSETS_ROOT, yearDir);
    const dateDirs = readdirSync(yearPath)
      .filter((f) => statSync(resolve(yearPath, f)).isDirectory())
      .sort();

    for (const dateDir of dateDirs) {
      const dirPath = resolve(yearPath, dateDir);
      const dataPath = resolve(dirPath, "data.json");
      results.push({ yearDir, dateDir, dirPath, dataPath });
    }
  }
  return results;
}

const logger = {
  error: (msg: string) => console.error(`❌ ${msg}`),
  warn: (msg: string) => console.log(`⚠️ ${msg}`),
  info: (msg: string) => console.log(`${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  step: (msg: string) => console.log(`🚀 ${msg}`),
  subDivider: () => console.log("---------------------"),
  summaryDivider: () => console.log("====================="),
  fileError: (file: string, message: string) => {
    logger.info(`文件：${file}`);
    logger.error(`  错误：${message}`);
    logger.subDivider();
  },
};

/**
 * 校验单个文件
 */
function validateFile(
  filePath: string,
  relativePath: string,
  validators: {
    official2020: ValidateFunction;
    official2021: ValidateFunction;
    simple: ValidateFunction;
  },
): boolean {
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as BannerConfig;
    const type = data.type;

    if (!type) {
      logger.fileError(relativePath, "[root] 缺少必要字段 'type'");
      return false;
    }

    let validate: ValidateFunction;
    if (type === "official_2021") {
      validate = validators.official2021;
    } else if (type === "official_2020") {
      validate = validators.official2020;
    } else if (type === "simple-image" || type === "simple-video") {
      validate = validators.simple;
    } else {
      logger.fileError(relativePath, `[type] 不支持的类型 ${type}`);
      return false;
    }

    const valid = validate(data);
    if (!valid) {
      logger.info(`文件：${relativePath}`);
      validate.errors?.forEach((err) => {
        const field = err.instancePath || "root";
        logger.error(`  错误：[${field}] ${err.message}`);
      });
      logger.subDivider();
      return false;
    }
    return true;
  } catch (error) {
    logger.fileError(
      relativePath,
      `处理失败 - ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * 命令：生成 JSON Schemas
 */
async function generateSchemas() {
  logger.step("[Schema] 正在生成 JSON Schemas...");
  try {
    if (!existsSync(SCHEMA_DIR)) {
      mkdirSync(SCHEMA_DIR, { recursive: true });
    }
    const generator = TJS.createGenerator({
      path: fileURLToPath(import.meta.url),
      tsconfig: TSCONFIG_PATH,
      expose: "all",
      topRef: true,
      jsDoc: "extended",
      sortProps: true,
    });

    const targets = [
      {
        type: "BannerConfigOfficial2020",
        file: SCHEMAS_NAMES.OFFICIAL_2020,
      },
      {
        type: "BannerConfigOfficial2021",
        file: SCHEMAS_NAMES.OFFICIAL_2021,
      },
      { type: "SimpleBannerConfig", file: SCHEMAS_NAMES.SIMPLE },
    ];

    for (const target of targets) {
      const schema = generator.createSchema(target.type);
      const schemaPath = resolve(SCHEMA_DIR, target.file);
      writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
      logger.success(`已生成: ${target.file}`);
    }
  } catch (error) {
    logger.error(`Schema 生成失败: ${error}`);
    process.exit(-1);
  }
}

/**
 * 命令：校验 assets 目录下的所有 data.json
 */
async function validateData() {
  logger.step("[Validate] 正在校验 Banner 数据...");
  const contexts = getBannerDirectories();

  if (contexts.length === 0) {
    logger.error(`Assets 目录未找到或为空: ${ASSETS_ROOT}`);
    process.exit(-1);
  }

  try {
    const validators = {
      official2020: getValidator(SCHEMAS_NAMES.OFFICIAL_2020),
      official2021: getValidator(SCHEMAS_NAMES.OFFICIAL_2021),
      simple: getValidator(SCHEMAS_NAMES.SIMPLE),
    };

    let errorCount = 0;

    for (const { yearDir, dateDir, dataPath } of contexts) {
      if (existsSync(dataPath)) {
        const result = validateFile(
          dataPath,
          `public/assets/${yearDir}/${dateDir}/data.json`,
          validators,
        );
        if (!result) errorCount++;
      }
    }

    if (errorCount > 0) {
      logger.info("");
      logger.error(`校验完成，发现 ${errorCount} 个文件存在错误。`);
      process.exit(-1);
    } else {
      logger.info("");
      logger.success("校验完成，所有数据均符合规范！");
    }
  } catch (error) {
    logger.error(`校验执行失败: ${error}`);
    process.exit(-1);
  }
}

/**
 * 命令：清理空目录
 */
async function cleanEmptyDirs() {
  logger.step("[Clean] 正在清理空目录...");
  const contexts = getBannerDirectories();

  for (const { dirPath, dataPath } of contexts) {
    if (!existsSync(dataPath)) {
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
    const files = readdirSync(yearPath).filter((f) => f !== ".DS_Store");
    if (files.length === 0) {
      logger.info(`清理空年份目录: ${yearPath}`);
      rmSync(yearPath, { recursive: true });
    }
  }
}

/**
 * 命令：检查资源引用完整性
 */
async function checkAssets(): Promise<boolean> {
  logger.step("[Assets] 正在检查资源完整性...");
  const contexts = getBannerDirectories();

  if (contexts.length === 0) {
    logger.error(`Assets 目录未找到或为空: ${ASSETS_ROOT}`);
    return false;
  }

  let totalMissing = 0;
  let totalExtra = 0;

  for (const { dateDir, dirPath, dataPath } of contexts) {
    if (!existsSync(dataPath)) continue;

    let data: BannerConfig;
    try {
      data = JSON.parse(readFileSync(dataPath, "utf8"));
    } catch (_e) {
      logger.error(`[Error] 无法解析配置文件: ${dataPath}`);
      continue;
    }

    const referencedAssets = collectAssets(data);
    const missing: string[] = [];
    const extra: string[] = [];

    // 检查缺失
    for (const src of new Set(referencedAssets)) {
      const absolutePath = resolve(PUBLIC_DIR, src);
      if (!existsSync(absolutePath)) {
        missing.push(src);
      }
    }

    // 检查冗余 (dirPath 下除了 data.json 以外的文件是否被引用)
    const allFiles = readdirSync(dirPath).filter((f) =>
      statSync(resolve(dirPath, f)).isFile(),
    );
    const referencedBasenames = new Set(
      referencedAssets.map((s) => basename(s)),
    );

    for (const file of allFiles) {
      if (file === "data.json" || file === ".DS_Store") continue;
      if (!referencedBasenames.has(file)) {
        extra.push(file);
      }
    }

    if (missing.length > 0 || extra.length > 0) {
      logger.info("");
      logger.info(`目录: ${dateDir}`);
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

  if (totalMissing === 0 && totalExtra === 0) {
    logger.success("检查完毕，未发现缺失或多余文件。");
    return true;
  }

  logger.summaryDivider();
  logger.error(
    `检查完毕，共发现 ${totalMissing} 个缺失文件，${totalExtra} 个多余文件。`,
  );
  return false;
}

/**
 * 检查 src/data/banner 中每条 BannerRef 的 tags 完整性
 */
async function checkTags(): Promise<boolean> {
  logger.step("[Tags] 正在检查 Banner 元数据 tags 完整性...");

  const VALID_TAGS: BannerTag[] = [
    "img",
    "video",
    "split-layer",
    "interactive",
  ];

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
    let groups: DailyBannerGroup[];
    try {
      groups = JSON.parse(
        readFileSync(filePath, "utf-8"),
      ) as DailyBannerGroup[];
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
          logger.info(`文件：src/data/banner/${file}`);
          logger.error(
            `  路径：${ref.path}  tags：${JSON.stringify(tags ?? null)}`,
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

/**
 * 检查 refs 与物理目录的一致性 (包括正向/反向一致性)
 */
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
  let missingDataJsons = 0;

  logger.step("[正向检查] 开始检查 refs 的资源路径和 data.json...");

  for (const file of files) {
    const filePath = resolve(BANNER_DIR, file);
    try {
      const content = readFileSync(filePath, "utf-8");
      const groups: DailyBannerGroup[] = JSON.parse(content);

      for (const group of groups) {
        if (!group.refs || !Array.isArray(group.refs)) continue;

        for (const ref of group.refs as BannerRef[]) {
          totalRefs++;
          const refPath = ref.path;
          configuredPaths.add(refPath);

          // 从 path 提取年份 YYYY，如 "2026-01-09-h00-t0" 提取为 "2026"
          const match = refPath.match(/^(\d{4})-\d{2}-\d{2}/);
          if (!match) {
            logger.error(
              `[格式错误] 文件: ${file}, 日期: ${group.date}, path 格式不合法: ${refPath}`,
            );
            logger.subDivider();
            continue;
          }
          const year = match[1];
          const targetDir = resolve(ASSETS_ROOT, year, refPath);
          const targetDataJson = resolve(targetDir, "data.json");

          // 1. 检查目录是否存在
          if (!existsSync(targetDir)) {
            missingDirs++;
            logger.error(
              `[缺失目录] 文件: ${file}, 日期: ${group.date}, 名称: ${ref.name}`,
            );
            logger.info(`   - 预期路径: ${targetDir}`);
            logger.subDivider();
            continue;
          }

          // 2. 检查 data.json 是否存在
          if (!existsSync(targetDataJson)) {
            missingDataJsons++;
            logger.error(
              `[缺失 data.json] 文件: ${file}, 日期: ${group.date}, 名称: ${ref.name}`,
            );
            logger.info(`   - 预期路径: ${targetDataJson}`);
            logger.subDivider();
          }
        }
      }
    } catch (e) {
      logger.error(`读取/解析文件失败: ${filePath} - ${e}`);
      logger.subDivider();
    }
  }

  if (missingDirs === 0 && missingDataJsons === 0) {
    logger.success("[正向检查] 所有配置的物理目录及 data.json 均存在。");
    logger.subDivider();
  }

  logger.step("[反向检查] 开始寻找未配置的多余物理目录...");

  let redundantDirs = 0;

  if (existsSync(ASSETS_ROOT)) {
    const years = readdirSync(ASSETS_ROOT);
    for (const year of years) {
      // 确保是 4 位数字代表的年份目录
      if (!/^\d{4}$/.test(year)) continue;

      const yearDir = resolve(ASSETS_ROOT, year);
      const stat = statSync(yearDir);
      if (!stat.isDirectory()) continue;

      const subDirs = readdirSync(yearDir);
      for (const dirName of subDirs) {
        const fullSubDir = resolve(yearDir, dirName);
        if (!statSync(fullSubDir).isDirectory()) continue;

        // 校验该物理文件夹名称是否在配置中
        if (!configuredPaths.has(dirName)) {
          redundantDirs++;
          logger.warn(
            `[多余物理目录] 路径: ${fullSubDir} 未在任何 JSON 的 refs 中配置！`,
          );
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
  logger.info(`- 缺失 data.json 数: ${missingDataJsons}`);
  logger.info(`- 未配置的多余物理目录数: ${redundantDirs}`);

  if (missingDirs === 0 && missingDataJsons === 0 && redundantDirs === 0) {
    logger.success("数据完全一致，完美！");
    return true;
  }

  logger.error("数据发现不一致，请根据上方日志进行修复。");
  return false;
}

/**
 * 整合检查：检查 tags 元数据以及 refs 与物理目录的一致性
 */
async function checkManifest(): Promise<boolean> {
  logger.info("## [Manifest] 开始检查 manifest 相关数据...");

  const tagsOk = await checkTags();
  logger.subDivider();

  const refsOk = await checkRefs();

  return tagsOk && refsOk;
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "generate":
      await generateSchemas();
      break;
    case "validate":
      await validateData();
      break;
    case "check-assets": {
      const ok = await checkAssets();
      if (!ok) process.exit(-1);
      break;
    }
    case "check-manifest": {
      const ok = await checkManifest();
      if (!ok) process.exit(-1);
      break;
    }
    case "clean":
      await cleanEmptyDirs();
      break;
    default:
      console.log("\n🛠️ Banner 数据管理工具");
      console.log("用法: tsx scripts/manage-data.ts <command>");
      console.log("\n可用命令:");
      console.log("  generate        生成 JSON Schemas (基于 src/types.ts)");
      console.log(
        "  validate        校验 public/assets 下的 data.json 配置文件数据规范",
      );
      console.log("  check-assets    检查资源文件的引用完整性 (缺失/多余)");
      console.log(
        "  check-manifest  检查 Banner 配置的合法性及与实际物理目录一致性",
      );
      console.log("  clean           清理 public/assets 下的空目录");
      break;
  }
}

main().catch((err) => {
  logger.error(`未捕获的错误: ${err}`);
  process.exit(-1);
});
