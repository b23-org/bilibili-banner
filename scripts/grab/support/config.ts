import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { GrabConfig } from "./types";

const currentFilename = fileURLToPath(import.meta.url);
const currentDirname = dirname(currentFilename);

/** 项目根目录绝对路径 */
export const PROJECT_ROOT = path.resolve(currentDirname, "../../..");

export const DEFAULT_CONFIG_VALUES = {
  FETCH_TIMEOUT_MS: 5000,
  DOWNLOAD_TIMEOUT_MS: 10000,
  DOWNLOAD_CONCURRENCY: 5,
  USER_AGENT:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
} as const;

/**
 * 组装并初始化 GrabConfig 配置对象
 * 支持通过 overrides 替换任意属性（用于单元测试或非标准路径环境）
 */
export function buildGrabConfig(overrides?: Partial<GrabConfig>): GrabConfig {
  const root = overrides?.projectRoot ?? PROJECT_ROOT;
  const cacheDir = overrides?.cacheDir ?? path.resolve(root, ".cache");

  return {
    projectRoot: root,
    assetsDir: overrides?.assetsDir ?? path.resolve(root, "public/assets"),
    manifestDir: overrides?.manifestDir ?? path.resolve(root, "src/manifest"),
    cacheDir,
    stagingDir: overrides?.stagingDir ?? path.resolve(cacheDir, "staging"),
    extensionsDir:
      overrides?.extensionsDir ?? path.resolve(cacheDir, "extensions"),
    indexFilePath:
      overrides?.indexFilePath ??
      path.resolve(cacheDir, "grab-asset-index.json"),
    fetchTimeoutMs:
      overrides?.fetchTimeoutMs ?? DEFAULT_CONFIG_VALUES.FETCH_TIMEOUT_MS,
    downloadTimeoutMs:
      overrides?.downloadTimeoutMs ?? DEFAULT_CONFIG_VALUES.DOWNLOAD_TIMEOUT_MS,
    downloadConcurrency:
      overrides?.downloadConcurrency ??
      DEFAULT_CONFIG_VALUES.DOWNLOAD_CONCURRENCY,
    userAgent: overrides?.userAgent ?? DEFAULT_CONFIG_VALUES.USER_AGENT,
  };
}
