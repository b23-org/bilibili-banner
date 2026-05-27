import type { LayersOfficial2021 } from "../../src/types";
import { stripBilibiliSuffix } from "../grab-shared/url";
import { buildHeaders, waybackFetch } from "./network";
import { parseBannerData2021 } from "./parse-html-2021";
import type { BannerExtractor, SimpleBannerData2016 } from "./types";

// ===== 通用 Banner 提取辅助函数 =====

export function extractBgImageUrl(style: string): string | null {
  const match = style.match(/url\(["']?([^"')]+)["']?\)/);
  return match ? match[1].trim() : null;
}

export function addArchiveHostToUrl(
  url: string,
  archivePrefix: string,
): string {
  try {
    const parsed = new URL(url);
    if (parsed.host === "web.archive.org") {
      return url;
    }
  } catch {}
  return `${archivePrefix}${url}`;
}

function logExtractResult(
  source: string,
  layerUrl: string,
  logoUrl: string | null,
): void {
  console.log(`✅ 成功从 ${source} 中提取配置`);
  console.log(`背景图URL: ${layerUrl}`);
  if (logoUrl) console.log(`Logo URL: ${logoUrl}`);
}

export function normalizeWaybackUrl(url: string): string {
  if (!url.includes("web.archive.org")) {
    return url;
  }
  const lastHttpIndex = url.lastIndexOf("http://");
  const lastHttpsIndex = url.lastIndexOf("https://");
  const lastIndex = Math.max(lastHttpIndex, lastHttpsIndex);

  if (lastIndex > 0) {
    return url.substring(lastIndex);
  }
  return url;
}

function resolveArchiveUrl(raw: string, archivePrefix: string): string {
  const normalized = normalizeWaybackUrl(raw);
  if (normalized !== raw) return normalized;

  if (raw.startsWith("//")) return `https:${raw}`;
  return addArchiveHostToUrl(raw, archivePrefix);
}

export const parseFromJS_2016: BannerExtractor = async (
  timestamp,
  archivePrefix,
) => {
  const scriptUrl = `https://web.archive.org/web/${timestamp}js_/http://www.bilibili.com/widget/getHeader?typeid=0&is_article=0`;
  console.log("正在尝试解析脚本内容...");
  try {
    const res = await waybackFetch(
      scriptUrl,
      buildHeaders("script", archivePrefix),
    );
    const content = res.body as string;
    const regex = /var\s+bannerConfig\s*=\s*({[\s\S]*?});/;
    const match = content.match(regex);
    if (!match) {
      console.log("  ℹ️  脚本内容中未找到 bannerConfig 变量");
      return null;
    }
    const config = JSON.parse(match[1]);
    const rawLayerUrl: string = config.background || "";
    const rawLogoUrl: string = config.logo || "";
    const name: string = config.title || "";
    if (!rawLayerUrl) {
      console.log("  ℹ️  bannerConfig 中未找到背景图链接");
      return null;
    }
    const layerUrl = addArchiveHostToUrl(rawLayerUrl, archivePrefix);
    const logoUrl = rawLogoUrl
      ? addArchiveHostToUrl(rawLogoUrl, archivePrefix)
      : null;
    logExtractResult(`脚本("${name}")`, layerUrl, logoUrl);
    return { layerUrl, logoUrl, name };
  } catch (error) {
    throw new Error(
      `脚本提取失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const parseFromHtml_2019: BannerExtractor = async (
  timestamp,
  archivePrefix,
  originalUrl,
) => {
  const htmlUrl = `https://web.archive.org/web/${timestamp}/${originalUrl}`;
  console.log(`正在尝试通过 HTML 直连提取...`);
  try {
    const res = await waybackFetch(
      htmlUrl,
      buildHeaders("document", archivePrefix),
    );
    const content = res.body as string;
    const bannerSelector =
      /<[^>]*?(?:id|class)=['"][^'"]*(?:banner_link|head-banner|bili-banner)[^'"]*['"][^>]*?>/i;
    const logoSelector =
      /<[^>]*?class=['"][^'"]*(?:head-logo|logo-img)[^'"]*['"][^>]*?>/i;

    const bannerTagMatch = content.match(bannerSelector);
    if (!bannerTagMatch) {
      console.log(`  ℹ️  HTML 内容中未找到 banner 元素`);
      return null;
    }
    const rawLayerUrl = extractBgImageUrl(bannerTagMatch[0]);
    if (!rawLayerUrl) {
      console.log(`  ℹ️  banner 元素中未找到背景图链接`);
      return null;
    }
    const logoTagMatch = content.match(logoSelector);
    let rawLogoUrl: string | null = null;
    if (logoTagMatch) {
      const srcMatch = logoTagMatch[0].match(/src=['"]([^'"]+)['"]/i);
      if (srcMatch) {
        rawLogoUrl = srcMatch[1];
      } else {
        rawLogoUrl = extractBgImageUrl(logoTagMatch[0]);
      }
    }
    const layerUrl = resolveArchiveUrl(rawLayerUrl, archivePrefix);
    const logoUrl = rawLogoUrl
      ? resolveArchiveUrl(rawLogoUrl, archivePrefix)
      : null;
    const titleMatch = bannerTagMatch[0].match(/data-title=['"]([^'"]+)['"]/);
    const name = titleMatch ? titleMatch[1] : "";
    logExtractResult(`HTML`, layerUrl, logoUrl);
    return { layerUrl, logoUrl, name };
  } catch (error) {
    throw new Error(
      `HTML 直连提取失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const parseBannerFromCssGeneric = async (
  timestamp: string,
  archivePrefix: string,
  cssFilename: string,
): Promise<SimpleBannerData2016 | null> => {
  const cssUrl = `https://web.archive.org/web/${timestamp}cs_/http://static.hdslb.com/css/${cssFilename}`;
  console.log(`正在尝试通过 CSS 文件提取 (${cssFilename})...`);
  try {
    const res = await waybackFetch(
      cssUrl,
      buildHeaders("style", archivePrefix),
    );
    const content = res.body as string;
    if (content.trim().startsWith("<")) {
      console.log("  ℹ️  CSS 请求返回了 HTML，可能是快照无效");
      return null;
    }
    const headerRegex =
      /\.header\s*\{[^}]*background:\s*url\((['"]?)([^)]+)\1\)/i;
    const headerMatch = content.match(headerRegex);
    if (!headerMatch) {
      console.log("  ℹ️  CSS 内容中未找到 .header 背景图");
      return null;
    }
    const rawLayerUrl = headerMatch[2].trim();
    const logoRegex =
      /\.header\s*\.logo\s*\{[^}]*background:\s*url\((['"]?)([^)]+)\1\)/i;
    const logoMatch = content.match(logoRegex);
    const rawLogoUrl = logoMatch ? logoMatch[2].trim() : null;
    const resolveUrl = (raw: string) => {
      if (raw.startsWith("/web/")) return `https://web.archive.org${raw}`;
      return resolveArchiveUrl(raw, archivePrefix);
    };
    const layerUrl = resolveUrl(rawLayerUrl);
    const logoUrl = rawLogoUrl ? resolveUrl(rawLogoUrl) : null;
    const name = "";
    logExtractResult(`CSS(${cssFilename})`, layerUrl, logoUrl);
    return { layerUrl, logoUrl, name };
  } catch (error) {
    throw new Error(
      `CSS 提取失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const parseFromCss_2015: BannerExtractor = (timestamp, archivePrefix) =>
  parseBannerFromCssGeneric(timestamp, archivePrefix, "new_z2.css");

export const parseFromCss_2013_2014: BannerExtractor = (
  timestamp,
  archivePrefix,
) => parseBannerFromCssGeneric(timestamp, archivePrefix, "new_z.css");

export const parseFromHtml_2021: BannerExtractor = async (
  timestamp,
  archivePrefix,
  originalUrl,
) => {
  const htmlUrl = `https://web.archive.org/web/${timestamp}id_/${originalUrl}`;
  console.log("正在尝试通过 HTML 提取 split_layer 配置...");
  try {
    const res = await waybackFetch(
      htmlUrl,
      buildHeaders("document", archivePrefix),
    );
    const html = res.body as string;
    const { layers, logo, preview, name, extensions } =
      parseBannerData2021(html);

    if (layers.length === 0) {
      console.log("  ℹ️  HTML 中未找到 split_layer 数据");
      return null;
    }

    console.log(`✅ 成功从 HTML 中提取 split_layer 配置`);

    return { layers, logo, preview, name, extensions };
  } catch (error) {
    throw new Error(
      `HTML split_layer 提取失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const parseFromApi_2022: BannerExtractor = async (
  timestamp,
  archivePrefix,
) => {
  const apiUrl = `https://web.archive.org/web/${timestamp}/https://api.bilibili.com/x/web-show/page/header?resource_id=142`;
  console.log("正在尝试通过 API 提取 split_layer 配置...");
  try {
    const res = await waybackFetch(apiUrl, buildHeaders("json", archivePrefix));
    const content = res.body as string;
    const json = JSON.parse(content);
    if (json.code !== 0 || !json.data) {
      console.log(`  ℹ️  API 返回码异常: ${json.code}`);
      return null;
    }

    const { pic, litpic, name, split_layer } = json.data;

    if (!split_layer) {
      console.log("  ℹ️  API 数据中未找到 split_layer");
      return null;
    }

    let parsed: unknown;
    if (typeof split_layer === "string") {
      parsed = JSON.parse(split_layer);
    } else {
      parsed = split_layer;
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray((parsed as Record<string, unknown>).layers)
    ) {
      console.log("  ℹ️  split_layer 解析失败或无 layers");
      return null;
    }

    const payload = parsed as {
      layers: LayersOfficial2021[];
      version?: string | number;
      extensions?: Record<string, unknown>;
    };

    if (
      payload.layers.length > 0 &&
      payload.version !== undefined &&
      Number(payload.version) !== 1
    ) {
      throw new Error(
        `banner 版本校验失败: 预期 version=1，实际为 ${String(payload.version)}`,
      );
    }

    console.log(`✅ 成功从 API 中提取 split_layer 配置`);

    return {
      layers: payload.layers,
      logo: stripBilibiliSuffix(litpic || ""),
      preview: stripBilibiliSuffix(pic || ""),
      name: name || undefined,
      extensions: payload.extensions,
    };
  } catch (error) {
    throw new Error(
      `API split_layer 提取失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
