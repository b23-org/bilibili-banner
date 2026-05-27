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
  divider: () => console.log("---------------------"),
  fileError: (file: string, message: string) => {
    logger.info(`文件：${file}`);
    logger.error(`  错误：${message}`);
    logger.divider();
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
      logger.divider();
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
async function checkAssets() {
  logger.step("[Assets] 正在检查资源完整性...");
  const contexts = getBannerDirectories();

  if (contexts.length === 0) {
    logger.error(`Assets 目录未找到或为空: ${ASSETS_ROOT}`);
    return;
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
      logger.divider();
    }
  }

  if (totalMissing === 0 && totalExtra === 0) {
    logger.success("检查完毕，未发现缺失或多余文件。");
  } else {
    logger.error(
      `检查完毕，共发现 ${totalMissing} 个缺失文件，${totalExtra} 个多余文件。`,
    );
    process.exit(-1);
  }
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
    case "check":
      await checkAssets();
      break;
    case "clean":
      await cleanEmptyDirs();
      break;
    default:
      console.log("\n🛠️ Banner 数据管理工具");
      console.log("用法: tsx scripts/manage-data.ts <command>");
      console.log("\n可用命令:");
      console.log("  generate    生成 JSON Schemas (基于 src/types.ts)");
      console.log("  validate    校验 public/assets 下的 data.json 数据规范");
      console.log("  check       检查资源文件的引用完整性 (缺失/多余)");
      console.log("  clean       清理 public/assets 下的空目录");
      break;
  }
}

main().catch((err) => {
  logger.error(`未捕获的错误: ${err}`);
  process.exit(-1);
});
