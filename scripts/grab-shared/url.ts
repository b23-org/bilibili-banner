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
