import vm from "node:vm";
import type { LayersOfficial2021 } from "../../src/types";
import type { BannerSnapshot } from "./types";

interface RawHeaderBannerData {
  litpic?: string;
  pic?: string;
  name?: string;
  url?: string;
  is_split_layer?: number | boolean;
  split_layer?:
    | string
    | {
        layers?: LayersOfficial2021[];
        extensions?: Record<string, unknown>;
      }
    | Record<string, unknown>;
}

interface SandboxWindow {
  __pinia?: {
    index?: {
      headerBannerData?: RawHeaderBannerData;
    };
  };
}

/**
 * 从 HTML 解析 banner 数据
 */
export function parseBannerFromHtml(html: string, tid: number): BannerSnapshot {
  const scriptMatch = html.match(
    /<script\s+type="text\/javascript">\s*(window\.__pinia\s*=[\s\S]*?)<\/script>/,
  );

  if (!scriptMatch?.[1]) {
    console.error(
      "\x1b[31m[Parse Error] 匹配 window.__pinia 失败。B站可能修改了数据下发方式，无法从 HTML 中提取数据。\x1b[0m",
    );
    throw new Error("HTML 解析失败: 未找到 __pinia 数据");
  }

  const codeToRun = scriptMatch[1];
  const sandbox = { window: {} as SandboxWindow };

  try {
    vm.createContext(sandbox);
    vm.runInContext(codeToRun, sandbox);

    const headerBannerData = sandbox.window.__pinia?.index?.headerBannerData;
    if (!headerBannerData) {
      throw new Error("沙盒数据结构不符合预期");
    }

    return parseRawHeaderBannerData(headerBannerData, tid);
  } catch (error) {
    console.error(
      "\x1b[31m[Parse Error] vm sandbox 执行或数据提取失败:\x1b[0m",
      error,
    );
    throw new Error(
      `HTML 解析失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * 将 API 返回或 HTML 提取的原始数据转换为 BannerSnapshot
 */
export function parseRawHeaderBannerData(
  data: RawHeaderBannerData,
  tid: number,
): BannerSnapshot {
  const logo = data.litpic || "";
  const preview = data.pic || "";
  const name = data.name || "";
  const rawUrl = data.url || "";
  const link = rawUrl.trim() !== "" ? rawUrl : undefined;

  let layers: LayersOfficial2021[] = [];
  let extensions: Record<string, unknown> | undefined;

  if (data.split_layer) {
    let splitLayerObj: Record<string, unknown> | undefined;
    try {
      splitLayerObj =
        typeof data.split_layer === "string"
          ? JSON.parse(data.split_layer)
          : data.split_layer;
    } catch (err) {
      console.warn("[Parse] 解析 split_layer JSON 失败", err);
      splitLayerObj = undefined;
    }

    layers = Array.isArray(splitLayerObj?.layers)
      ? (splitLayerObj.layers as LayersOfficial2021[])
      : [];
    extensions = splitLayerObj?.extensions as
      | Record<string, unknown>
      | undefined;
  }

  return {
    tid: [tid],
    layers,
    logo,
    preview,
    name,
    ...(link ? { link } : {}),
    extensions,
  };
}
