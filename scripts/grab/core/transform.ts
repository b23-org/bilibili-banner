import type {
  BannerConfig,
  BannerRef,
  BannerTag,
  Official2021BannerConfig,
  SimpleBannerConfig,
} from "../../../src/types";
import type { BannerSnapshot, GrabEntry } from "../support/types";
import { extractFileNameFromUrl } from "../support/url";
import { getRegionDisplayName } from "./regions";

/**
 * 组装 Banner 目录名称
 * 格式示例：2026-10-02-h23-t0 或 2026-10-02-h23-t0-preview
 */
export function composeBannerDirName(
  date: string,
  hour: string,
  tid: number,
  suffix?: string,
): string {
  const baseName = `${date}-h${hour}-t${tid}`;
  return suffix ? `${baseName}-${suffix}` : baseName;
}

/**
 * 根据 Banner 配置项推导对应的分类标签（如 split-layer, video, img）
 */
export function inferBannerTags(config: BannerConfig): BannerTag[] {
  if (config.type === "simple-image") {
    return ["img"];
  }

  if (config.type === "official_2021" || config.type === "official_2020") {
    const layers = config.layers ?? [];
    if (layers.length > 1) {
      return ["split-layer"];
    }

    if (layers.length === 1) {
      const resources =
        "resources" in layers[0]
          ? (layers[0].resources ?? [])
          : "images" in layers[0]
            ? (layers[0].images ?? [])
            : [];

      const hasVideo = resources.some(
        (res: { src?: string }) =>
          res.src?.endsWith(".webm") || res.src?.endsWith(".mp4"),
      );
      return hasVideo ? ["video"] : ["img"];
    }
  }

  return ["img"];
}

/**
 * 将 BannerSnapshot 纯数据转换为一条或多条 GrabEntry
 * 当快照包含 layers 图层数据时，会同时派生出一个 preview 预览项和一个 split-layer 动画项
 * 纯函数，不进行任何文件或网络 I/O
 */
export function convertSnapshotToGrabEntries(
  snapshot: BannerSnapshot,
  date: string,
  hour: string,
): GrabEntry[] {
  const entries: GrabEntry[] = [];
  const [year, month] = date.split("-");
  const hasLayers = snapshot.layers.length > 0;

  // 使用当前快照所含分区列表中最小的 tid 作为目录名称标识
  const primaryTid = snapshot.tids[0] ?? 0;
  const displayName = snapshot.name || getRegionDisplayName(primaryTid);

  const primaryDirName = composeBannerDirName(date, hour, primaryTid);
  const previewDirName = hasLayers
    ? composeBannerDirName(date, hour, primaryTid, "preview")
    : primaryDirName;

  // 1. 构造 simple-image (预览单图) 实体
  if (snapshot.preview) {
    const previewUrls: string[] = [snapshot.preview];
    if (snapshot.logo) {
      previewUrls.push(snapshot.logo);
    }

    const simpleConfig: SimpleBannerConfig = {
      type: "simple-image",
      layer: {
        src: `assets/${year}/${month}/${previewDirName}/${extractFileNameFromUrl(snapshot.preview)}`,
      },
    };

    if (snapshot.logo) {
      simpleConfig.logo = {
        src: `assets/${year}/${month}/${previewDirName}/${extractFileNameFromUrl(snapshot.logo)}`,
      };
    }
    if (snapshot.link?.trim()) {
      simpleConfig.link = snapshot.link;
    }

    const simpleRef: BannerRef = {
      name: hasLayers ? `${displayName} (预览)` : displayName,
      id: previewDirName,
      tags: inferBannerTags(simpleConfig),
      tid: [...snapshot.tids],
      config: simpleConfig,
    };

    entries.push({
      tids: [...snapshot.tids],
      dirName: previewDirName,
      ref: simpleRef,
      config: simpleConfig,
      resourceUrls: previewUrls,
    });
  }

  // 2. 构造 official_2021 (多图层动画) 实体
  if (hasLayers) {
    const layerUrls: string[] = [];
    for (const layer of snapshot.layers) {
      for (const res of layer.resources ?? []) {
        if (res.src) {
          layerUrls.push(res.src);
        }
      }
    }

    const layerBasePath = `assets/${year}/${month}/${primaryDirName}`;
    const logoBasePath = `assets/${year}/${month}/${previewDirName}`;

    const resolvedLayers = snapshot.layers.map((layer) => ({
      ...layer,
      resources: layer.resources?.map((res) => ({
        ...res,
        src: res.src
          ? `${layerBasePath}/${extractFileNameFromUrl(res.src)}`
          : "",
      })),
    }));

    const splitLayerConfig: Official2021BannerConfig = {
      type: "official_2021",
      layers: resolvedLayers,
    };

    if (snapshot.logo) {
      splitLayerConfig.logo = {
        src: `${logoBasePath}/${extractFileNameFromUrl(snapshot.logo)}`,
      };
    }
    if (snapshot.link?.trim()) {
      splitLayerConfig.link = snapshot.link;
    }

    const splitLayerRef: BannerRef = {
      name: displayName,
      id: primaryDirName,
      tags: inferBannerTags(splitLayerConfig),
      tid: [...snapshot.tids],
      config: splitLayerConfig,
    };

    entries.push({
      tids: [...snapshot.tids],
      dirName: primaryDirName,
      ref: splitLayerRef,
      config: splitLayerConfig,
      resourceUrls: layerUrls,
    });
  }

  return entries;
}
