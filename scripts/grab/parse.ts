import vm from "node:vm";
import type { LayersOfficial2021 } from "../../src/types";
import { stripBilibiliSuffix } from "../grab-shared/url";

interface SplitLayerPayload {
  version?: string | number;
  layers?: LayersOfficial2021[];
  extensions?: Record<string, unknown>;
}

interface BannerData {
  layers: LayersOfficial2021[];
  logo?: string;
  preview?: string;
  name?: string;
  link?: string;
  extensions?: Record<string, unknown>;
}

export function parseBannerData(html: string): BannerData {
  const sandboxData = parseBannerDataSandbox(html);
  if (sandboxData) {
    return sandboxData;
  }
  return parseBannerDataRegExp(html);
}

function parseBannerDataSandbox(html: string): BannerData | null {
  // 匹配 window.__pinia = (function(...){...})(...) 这样的自执行函数定义与调用
  const scriptMatch = html.match(/window\.__pinia\s*=\s*\((?:function|[\s\S]*?)\)\s*\([\s\S]*?\)\s*;/);
  if (!scriptMatch) {
    return null;
  }

  const codeToRun = scriptMatch[0];
  const sandbox = { window: {} as any };

  try {
    vm.createContext(sandbox);
    vm.runInContext(codeToRun, sandbox);

    const headerBannerData = sandbox.window.__pinia?.index?.headerBannerData;
    if (!headerBannerData) {
      return null;
    }

    const logo = stripBilibiliSuffix(headerBannerData.litpic || "");
    const preview = stripBilibiliSuffix(headerBannerData.pic || "");
    const name = headerBannerData.name || "";
    const rawUrl = headerBannerData.url || "";
    const link = rawUrl.trim() !== "" ? rawUrl : undefined;

    let layers: LayersOfficial2021[] = [];
    let extensions: Record<string, unknown> | undefined = undefined;

    if (headerBannerData.split_layer) {
      const splitLayerObj = typeof headerBannerData.split_layer === "string"
        ? JSON.parse(headerBannerData.split_layer)
        : headerBannerData.split_layer;

      layers = Array.isArray(splitLayerObj.layers) ? splitLayerObj.layers : [];
      extensions = splitLayerObj.extensions;
    }

    return {
      layers,
      logo,
      preview,
      name,
      ...(link ? { link } : {}),
      extensions,
    };
  } catch (error) {
    console.warn("[Parse] vm sandbox execution failed:", error);
    return null;
  }
}

function parseBannerDataRegExp(html: string): BannerData {
  const anchorIndex = findAnchorIndex(html);
  const { layers, extensions } = extractLayers(html, anchorIndex);
  const { logo, preview, name, url } = extractBannerInfo(html, anchorIndex);

  return {
    layers,
    logo,
    preview,
    name,
    ...(url ? { link: url } : {}),
    extensions,
  };
}
function extractLayers(
  html: string,
  anchorIndex?: number,
): {
  layers: LayersOfficial2021[];
  extensions?: Record<string, unknown>;
} {
  const { payload } = extractSplitLayerLiteral(html, anchorIndex);

  const layers = Array.isArray(payload.layers) ? payload.layers : [];
  if (
    layers.length > 0 &&
    payload.version !== undefined &&
    Number(payload.version) !== 1
  ) {
    throw new Error(
      `banner 版本校验失败: 预期官方 version=1，实际为 ${String(payload.version)}`,
    );
  }

  return { layers, extensions: payload.extensions };
}

function extractBannerInfo(
  html: string,
  anchorIndex: number,
): {
  logo?: string;
  preview?: string;
  name?: string;
  url?: string;
} {
  const contextStart = Math.max(0, anchorIndex - 1500);
  const contextStr = html.substring(contextStart, anchorIndex);

  const extractValue = (key: string): string | undefined => {
    const pattern = new RegExp(
      `(?:^|[^\\w$"'\\\`])["']?${key}["']?\\s*:\\s*(['"])(.*?)\\1`,
      "gm",
    );
    const matches = [...contextStr.matchAll(pattern)];
    if (matches.length === 0) return undefined;
    const lastMatch = matches[matches.length - 1];
    return decodeJsStringContent(lastMatch[2] as string);
  };

  const logoUrl = stripBilibiliSuffix(extractValue("litpic") || "");
  const previewUrl = stripBilibiliSuffix(extractValue("pic") || "");
  const name = extractValue("name");
  const rawUrl = extractValue("url") || "";
  const url = rawUrl.trim() !== "" ? rawUrl : undefined;

  return {
    logo: logoUrl,
    preview: previewUrl,
    name,
    url,
  };
}

function findAnchorIndex(html: string): number {
  const isSplitLayerPattern = /(^|[^\w$"'`])["']?is_split_layer["']?\s*:/m;
  const match = isSplitLayerPattern.exec(html);
  if (match && match.index !== undefined) {
    return match.index;
  }

  const splitLayerPattern = /(^|[^\w$"'`])["']?split_layer["']?\s*:/m;
  const fallback = splitLayerPattern.exec(html);
  if (fallback && fallback.index !== undefined) {
    return fallback.index;
  }

  throw new Error("未找到 banner 数据");
}

function extractSplitLayerLiteral(
  html: string,
  startIndex?: number,
): {
  payload: SplitLayerPayload;
  index: number;
} {
  const searchHtml = startIndex != null ? html.slice(startIndex) : html;
  const splitLayerPattern = /(^|[^\w$"'`])["']?split_layer["']?\s*:\s*(['"])/m;
  const match = splitLayerPattern.exec(searchHtml);
  if (!match || match.index === undefined) {
    throw new Error("未找到 split_layer 配置");
  }

  const quote = match[2];
  const valueStart = match.index + match[0].length - 1;
  let escaped = false;

  for (let i = valueStart + 1; i < searchHtml.length; i++) {
    const char = searchHtml[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === quote) {
      const literal = searchHtml.slice(valueStart + 1, i);
      const jsonText = decodeJsStringContent(literal);

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (error: unknown) {
        throw new Error(
          `JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (Array.isArray(parsed)) {
        throw new Error("split_layer 解析失败: 预期 JSON 对象，实际为数组");
      }

      if (typeof parsed !== "object" || parsed === null) {
        throw new Error(
          `split_layer 解析失败: 预期 JSON 对象，实际为 ${typeof parsed}`,
        );
      }

      return {
        payload: parsed as SplitLayerPayload,
        index: (startIndex ?? 0) + match.index,
      };
    }
  }

  throw new Error("split_layer 字符串字面量未正常闭合");
}

function decodeJsStringContent(raw: string): string {
  let decoded = "";

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];

    if (char !== "\\") {
      decoded += char;
      continue;
    }

    i++;
    if (i >= raw.length) {
      throw new Error("split_layer 字符串包含非法结尾转义");
    }

    const escapeChar = raw[i];
    switch (escapeChar) {
      case "b":
        decoded += "\b";
        break;
      case "f":
        decoded += "\f";
        break;
      case "n":
        decoded += "\n";
        break;
      case "r":
        decoded += "\r";
        break;
      case "t":
        decoded += "\t";
        break;
      case "v":
        decoded += "\v";
        break;
      case "0":
        decoded += "\0";
        break;
      case "'":
      case '"':
      case "\\":
      case "/":
        decoded += escapeChar;
        break;
      case "x": {
        const hex = raw.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
          throw new Error(`split_layer 包含非法十六进制转义: \\x${hex}`);
        }
        decoded += String.fromCharCode(Number.parseInt(hex, 16));
        i += 2;
        break;
      }
      case "u": {
        const hex = raw.slice(i + 1, i + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          throw new Error(`split_layer 包含非法 Unicode 转义: \\u${hex}`);
        }
        decoded += String.fromCharCode(Number.parseInt(hex, 16));
        i += 4;
        break;
      }
      case "\n":
        break;
      case "\r":
        if (raw[i + 1] === "\n") {
          i++;
        }
        break;
      default:
        decoded += escapeChar;
        break;
    }
  }

  return decoded;
}
