import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, "../..");

/**
 * 清洗 B站图片 URL，去除处理后缀（如 @560w_240h.webp），获取原图链接
 */
export function stripBilibiliSuffix(url: string): string {
  if (!url) return url;
  return url.split("@")[0];
}

/**
 * 从完整 CDN URL 提取文件名（不含 query string）
 * 使用 URL.pathname 解析，比 split 方式更可靠
 */
export function extractFileNameFromUrl(url: string): string {
  return path.posix.basename(new URL(url).pathname);
}

/**
 * 递归删除文件夹
 */
export function removeDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}
