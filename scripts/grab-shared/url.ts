import path from "node:path";

/**
 * 清洗 B站图片 URL，去除处理后缀（如 @560w_240h.webp），获取原图链接
 */
export function stripBilibiliSuffix(url: string): string {
  if (!url) return url;
  return url.split("@")[0];
}

/**
 * 将可能包含 Wayback Machine 前缀的 URL 还原为原始 CDN 链接
 * 同时也处理 // 协议头
 */
export function toOriginalCdnUrl(url: string): string {
  if (!url) return url;

  // 1. 处理 Wayback Machine 前缀
  const lastHttpIndex = url.lastIndexOf("http://");
  const lastHttpsIndex = url.lastIndexOf("https://");
  const lastIndex = Math.max(lastHttpIndex, lastHttpsIndex);

  let rawUrl = url;
  if (lastIndex > 0) {
    rawUrl = url.substring(lastIndex);
  }

  // 2. 处理 // 协议头
  if (rawUrl.startsWith("//")) {
    return `https:${rawUrl}`;
  }

  return rawUrl;
}

/**
 * 从完整 CDN URL 提取文件名（不含 query string）
 * 使用 URL.pathname 解析，比 split 方式更可靠
 */
export function extractFileNameFromUrl(url: string): string {
  return path.posix.basename(new URL(url).pathname);
}
