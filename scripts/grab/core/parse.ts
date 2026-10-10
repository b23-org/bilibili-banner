import type {
  BannerSnapshot,
  LayersOfficial2021,
  RawBannerData,
} from "../support/types";

/**
 * 将从 API 返回的原始对象清洗转换为规范化的 BannerSnapshot
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
