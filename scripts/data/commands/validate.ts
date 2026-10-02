import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import Ajv, { type ValidateFunction } from "ajv";
import * as TJS from "ts-json-schema-generator";
import type { BannerConfig, BannerEntry } from "../../../src/types";
import { BANNER_TYPES_ARR } from "../../../src/types";
import { logger } from "../shared/logger";

const SCHEMA_DIR = "temp/schema";
const TSCONFIG_PATH = resolve("tsconfig.json");
const BANNER_SCHEMA_NAME = "banner-schema.json";
const BANNER_DIR = resolve("src/manifest");

const ajv = new Ajv({ allErrors: true, strict: false });

function getValidator(fileName: string): ValidateFunction {
  const path = resolve(SCHEMA_DIR, fileName);
  if (!existsSync(path)) {
    throw new Error(`未找到 Schema 文件: ${fileName}。`);
  }
  const schema = JSON.parse(readFileSync(path, "utf-8"));
  return ajv.compile(schema);
}

function validateBannerConfig(
  config: BannerConfig,
  label: string,
  validate: ValidateFunction,
): boolean {
  try {
    const type = config.type;

    if (!type) {
      logger.fileError(label, "[root] 缺少必要字段 'type'");
      return false;
    }

    if (!BANNER_TYPES_ARR.includes(type)) {
      logger.fileError(label, `[type] 不支持的类型 ${type}`);
      return false;
    }

    const valid = validate(config);
    if (!valid) {
      logger.info(`目标：${label}`);
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
      label,
      `处理失败 - ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

async function generateSchemas(): Promise<void> {
  logger.step("[Schema] 正在生成 JSON Schema...");
  try {
    if (!existsSync(SCHEMA_DIR)) {
      mkdirSync(SCHEMA_DIR, { recursive: true });
    }
    const generator = TJS.createGenerator({
      path: resolve("src/types.ts"),
      tsconfig: TSCONFIG_PATH,
      expose: "all",
      topRef: true,
      jsDoc: "extended",
      sortProps: true,
    });

    const schema = generator.createSchema("BannerConfig");
    const schemaPath = resolve(SCHEMA_DIR, BANNER_SCHEMA_NAME);
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
    logger.success(`已生成: ${BANNER_SCHEMA_NAME}`);
  } catch (error) {
    logger.error(`Schema 生成失败: ${error}`);
    process.exit(-1);
  }
}

async function validateData(): Promise<void> {
  logger.step("[Validate] 正在校验 Banner 配置数据...");

  if (!existsSync(BANNER_DIR)) {
    logger.error(`Banner 数据目录未找到: ${BANNER_DIR}`);
    process.exit(-1);
  }

  const manifestFiles = readdirSync(BANNER_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  try {
    const validate = getValidator(BANNER_SCHEMA_NAME);
    let errorCount = 0;
    let totalCount = 0;

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
          totalCount++;
          const label = `src/manifest/${file} -> ${ref.id} (${ref.name})`;
          if (!ref.config) {
            logger.fileError(label, "缺少内嵌 config 字段");
            errorCount++;
            continue;
          }

          const result = validateBannerConfig(ref.config, label, validate);
          if (!result) errorCount++;
        }
      }
    }

    if (errorCount > 0) {
      logger.info("");
      logger.error(
        `校验完成，共 ${totalCount} 条，发现 ${errorCount} 条存在错误。`,
      );
      process.exit(-1);
    } else {
      logger.info("");
      logger.success(`校验完成，共 ${totalCount} 条，所有数据均符合规范！`);
    }
  } catch (error) {
    logger.error(`校验执行失败: ${error}`);
    process.exit(-1);
  }
}

export async function run(): Promise<void> {
  await generateSchemas();
  await validateData();
}
