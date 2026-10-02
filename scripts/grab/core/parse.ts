import vm from "node:vm";
import { ParseError } from "../support/errors";
import type {
  BannerSnapshot,
  LayersOfficial2021,
  RawBannerData,
} from "../support/types";

interface SandboxWindow {
  __pinia?: {
    index?: {
      headerBannerData?: RawBannerData;
    };
  };
}

/**
 * 将从 API 返回或从 HTML 提取的原始对象清洗转换为规范化的 BannerSnapshot
 * 纯函数，不进行网络或磁盘 I/O
 */
export function transformRawBannerDataToSnapshot(
  rawData: RawBannerData,
  tid: number,
): BannerSnapshot {
  const logo = rawData.litpic?.trim() || undefined;
  const preview = rawData.pic?.trim() || undefined;
  const name = rawData.name?.trim() || undefined;
  const link = rawData.url?.trim() || undefined;

  let layers: readonly LayersOfficial2021[] = [];
  let extensions: Record<string, unknown> | undefined;

  if (rawData.split_layer) {
    let parsedLayerObject: Record<string, unknown> | undefined;
    try {
      parsedLayerObject =
        typeof rawData.split_layer === "string"
          ? JSON.parse(rawData.split_layer)
          : rawData.split_layer;
    } catch (_err: unknown) {
      // 容错处理：split_layer 若为非合法 JSON 字符串则忽略图层
      parsedLayerObject = undefined;
    }

    if (Array.isArray(parsedLayerObject?.layers)) {
      layers = parsedLayerObject.layers as LayersOfficial2021[];
    }
    if (
      parsedLayerObject?.extensions &&
      typeof parsedLayerObject.extensions === "object"
    ) {
      extensions = parsedLayerObject.extensions as Record<string, unknown>;
    }
  }

  return {
    tids: [tid],
    layers,
    logo,
    preview,
    name,
    link,
    extensions,
  };
}

/**
 * 从 B站首页 HTML 源码中提取 Pinia 中的 Banner 快照
 * @throws {ParseError} 当无法定位 script 标签或沙盒执行解析失败时抛出
 */
export function extractSnapshotFromHtml(html: string, tid = 0): BannerSnapshot {
  const scriptRegex =
    /<script\s+type="text\/javascript">\s*(window\.__pinia\s*=[\s\S]*?)<\/script>/;
  const scriptMatch = html.match(scriptRegex);

  if (!scriptMatch?.[1]) {
    throw new ParseError("未在 HTML 中找到包含 window.__pinia 的有效脚本块");
  }

  const scriptCode = scriptMatch[1];
  const sandboxContext = { window: {} as SandboxWindow };

  try {
    vm.createContext(sandboxContext);
    vm.runInContext(scriptCode, sandboxContext);

    const headerBannerData =
      sandboxContext.window.__pinia?.index?.headerBannerData;
    if (!headerBannerData) {
      throw new ParseError("window.__pinia 中缺少 index.headerBannerData 数据");
    }

    return transformRawBannerDataToSnapshot(headerBannerData, tid);
  } catch (error: unknown) {
    if (error instanceof ParseError) {
      throw error;
    }
    throw new ParseError(
      `沙盒执行失败: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
