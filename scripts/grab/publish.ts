import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BannerConfig,
  BannerEntry,
  BannerRef,
  BannerTag,
  Official2021BannerConfig,
  SimpleBannerConfig,
} from "../../src/types";
import { extractFileNameFromUrl, removeDir } from "./helpers";
import type { BannerSnapshot, GrabBannerEntry } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function publishStagedDir(stagedDir: string, dirName: string): void {
  const year = dirName.split("-")[0];
  const month = dirName.split("-")[1];
  const targetDir = path.resolve(
    __dirname,
    `../../public/assets/${year}/${month}/${dirName}`,
  );
  const targetMonthDir = path.dirname(targetDir);
  if (!fs.existsSync(targetMonthDir)) {
    fs.mkdirSync(targetMonthDir, { recursive: true });
  }

  const targetDirExists = fs.existsSync(targetDir);
  const backupDir = `${targetDir}.bak-${Date.now()}`;

  try {
    if (targetDirExists) {
      fs.renameSync(targetDir, backupDir);
    }
    fs.renameSync(stagedDir, targetDir);
    if (targetDirExists) {
      removeDir(backupDir);
    }
  } catch (error: unknown) {
    if (!fs.existsSync(targetDir) && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, targetDir);
    }
    throw error;
  }
}

export function updateManifest(date: string, refs: BannerRef[]): void {
  const year = date.substring(0, 4);
  const configFilePath = path.resolve(
    __dirname,
    `../../src/manifest/${year}.json`,
  );

  let banners: BannerEntry[] = [];
  if (fs.existsSync(configFilePath)) {
    banners = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
  }

  for (const ref of refs) {
    const isPreview = ref.id.endsWith("-preview");
    const pairedId = isPreview
      ? ref.id.slice(0, -"-preview".length)
      : `${ref.id}-preview`;
    const baseName = ref.name.replace(/ \(预览\)$/, "");
    const previewName = `${baseName} (预览)`;

    // 查找同一日期中属于同一个 banner 的 entry：
    // preview 和主 banner 保存进同一个 entry，匹配当前 ref.id 或其配对的 ID / 名称
    const targetEntryIndex = banners.findIndex(
      (entry) =>
        entry.date === date &&
        (entry.refs || []).some(
          (r) =>
            r.id === ref.id ||
            r.id === pairedId ||
            r.name === ref.name ||
            r.name === (isPreview ? baseName : previewName),
        ),
    );

    if (targetEntryIndex !== -1) {
      const targetEntry = banners[targetEntryIndex];
      const existingRefs = targetEntry.refs || [];
      const refIndex = existingRefs.findIndex(
        (r) => r.id === ref.id || r.name === ref.name,
      );

      if (refIndex !== -1) {
        existingRefs[refIndex] = ref;
      } else {
        existingRefs.push(ref);
      }
      targetEntry.refs = sortRefs(existingRefs);
    } else {
      // 其他 banner 各自独立保存为一个 entry
      banners.push({
        date,
        refs: sortRefs([ref]),
      });
    }
  }

  banners.sort(compareEntries);
  fs.writeFileSync(
    configFilePath,
    `${JSON.stringify(banners, null, 2)}\n`,
    "utf8",
  );
}

function buildBannerDirName(
  date: string,
  hour: string,
  tid = "0",
  suffix?: string,
): string {
  const base = `${date}-h${hour}-t${tid}`;
  return suffix ? `${base}-${suffix}` : base;
}

function generateTags(config: BannerConfig): BannerTag[] {
  if (config.type === "simple-image") {
    return ["img"];
  }

  if (config.type === "official_2020") {
    const layers = config.layers || [];
    if (layers.length > 1) return ["split-layer"];
    if (layers.length === 1) {
      const images = layers[0].images || [];
      const hasVideo = images.some(
        (img) => img.src.endsWith(".webm") || img.src.endsWith(".mp4"),
      );
      return hasVideo ? ["video"] : ["img"];
    }
    return ["img"];
  }

  if (config.type === "official_2021") {
    const layers = config.layers || [];
    if (layers.length > 1) return ["split-layer"];
    if (layers.length === 1) {
      const resources = layers[0].resources || [];
      const hasVideo = resources.some(
        (res) => res.src.endsWith(".webm") || res.src.endsWith(".mp4"),
      );
      return hasVideo ? ["video"] : ["img"];
    }
    return ["img"];
  }

  return ["img"];
}

function parsePathInfo(id: string): {
  hour: number;
  tid: number;
  isPreview: boolean;
} {
  const match = id.match(/-h(\d+)-t(\d+)(?:-(preview))?/);
  if (!match) return { hour: 0, tid: 0, isPreview: false };
  return {
    hour: Number.parseInt(match[1], 10),
    tid: Number.parseInt(match[2], 10),
    isPreview: !!match[3],
  };
}

export function sortRefs(refs: BannerRef[]): BannerRef[] {
  return [...refs].sort((a, b) => {
    const aInfo = parsePathInfo(a.id);
    const bInfo = parsePathInfo(b.id);
    if (aInfo.tid !== bInfo.tid) return aInfo.tid - bInfo.tid;
    if (aInfo.hour !== bInfo.hour) return aInfo.hour - bInfo.hour;
    // preview 必须排在第 1 位
    if (aInfo.isPreview !== bInfo.isPreview) return aInfo.isPreview ? -1 : 1;
    return 0;
  });
}

function compareEntries(a: BannerEntry, b: BannerEntry): number {
  if (a.date !== b.date) {
    return a.date.localeCompare(b.date);
  }
  const aRef = a.refs?.[0];
  const bRef = b.refs?.[0];
  if (!aRef || !bRef) return 0;
  const aInfo = parsePathInfo(aRef.id);
  const bInfo = parsePathInfo(bRef.id);
  if (aInfo.tid !== bInfo.tid) return aInfo.tid - bInfo.tid;
  if (aInfo.hour !== bInfo.hour) return aInfo.hour - bInfo.hour;
  return aRef.id.localeCompare(bRef.id);
}

/**
 * 将单个 BannerSnapshot 转换为待处理的 GrabBannerEntry 列表
 */
export function handleBannerSnapshot(
  snapshot: BannerSnapshot,
  date: string,
  hour: string,
): GrabBannerEntry[] {
  const entries: GrabBannerEntry[] = [];
  const year = date.split("-")[0];
  const month = date.split("-")[1];
  const hasLayers = snapshot.layers && snapshot.layers.length > 0;
  const tidStr = snapshot.tid[0].toString(); // 目录名使用最小 tid（已从小到大排序）
  const displayName =
    snapshot.name ||
    (snapshot.tid.includes(0) ? date : `分区 ${snapshot.tid[0]}`);

  const baseDirName = buildBannerDirName(date, hour, tidStr);
  const simpleImageDirName = hasLayers
    ? buildBannerDirName(date, hour, tidStr, "preview")
    : baseDirName;

  // 1. 构造 simple-image 的 entry
  if (snapshot.preview) {
    const simpleUrls: string[] = [snapshot.preview];
    if (snapshot.logo) simpleUrls.push(snapshot.logo);

    const config: SimpleBannerConfig = {
      type: "simple-image",
      layer: {
        src: `assets/${year}/${month}/${simpleImageDirName}/${extractFileNameFromUrl(snapshot.preview)}`,
      },
    };

    if (snapshot.logo) {
      config.logo = {
        src: `assets/${year}/${month}/${simpleImageDirName}/${extractFileNameFromUrl(snapshot.logo)}`,
      };
    }
    if (snapshot.link && snapshot.link.trim() !== "") {
      config.link = snapshot.link;
    }

    entries.push({
      tid: snapshot.tid,
      targetDirName: simpleImageDirName,
      config,
      urls: simpleUrls,
      ref: {
        name: hasLayers ? `${displayName} (预览)` : displayName,
        id: simpleImageDirName,
        tags: generateTags(config),
        tid: snapshot.tid,
        config,
      },
    });
  }

  // 2. 构造 split-layer 的 entry
  if (hasLayers) {
    const layerUrls: string[] = [];
    for (const layer of snapshot.layers) {
      for (const res of layer.resources || []) {
        if (res.src) layerUrls.push(res.src);
      }
    }

    const basePath = `assets/${year}/${month}/${baseDirName}`;
    const logoPath = `assets/${year}/${month}/${simpleImageDirName}`; // 复用 simple-image 里的 logo

    const outLayers = snapshot.layers.map((layer) => ({
      ...layer,
      resources: layer.resources?.map((res) => ({
        ...res,
        src: `${basePath}/${extractFileNameFromUrl(res.src)}`,
      })),
    }));

    const config: Official2021BannerConfig = {
      type: "official_2021",
      layers: outLayers,
    };

    if (snapshot.logo) {
      config.logo = {
        src: `${logoPath}/${extractFileNameFromUrl(snapshot.logo)}`,
      };
    }
    if (snapshot.link && snapshot.link.trim() !== "") {
      config.link = snapshot.link;
    }

    entries.push({
      tid: snapshot.tid,
      targetDirName: baseDirName,
      config,
      urls: layerUrls,
      ref: {
        name: displayName,
        id: baseDirName,
        tags: generateTags(config),
        tid: snapshot.tid,
        config,
      },
    });
  }

  return entries;
}
