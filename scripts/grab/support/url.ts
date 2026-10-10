import path from "node:path";

/**
 * 清洗 B站图片 URL，去除图像处理后缀（如 `@560w_240h.webp`），获取原图链接
 */
export function stripCdnSuffix(url: string): string {
  if (!url) return url;
  return url.split("@")[0];
}

/**
 * 从完整 CDN URL 中提取纯文件名（不含 query 参数与 hash）
 */
export function extractFileNameFromUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return path.posix.basename(parsed.pathname);
  } catch {
    const cleanUrl = url.split("?")[0].split("#")[0];
    return path.posix.basename(cleanUrl);
  }
}
