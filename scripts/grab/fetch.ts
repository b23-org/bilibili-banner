import { extractFileNameFromUrl, stripBilibiliSuffix } from "./helpers";
import { parseBannerFromHtml, parseRawHeaderBannerData } from "./parse";
import { REGIONS, type RegionInfo } from "./regions";
import type { BannerSnapshot } from "./types";

const FETCH_TIMEOUT_MS = 5000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

interface Task {
  tid: number;
  name: string;
  fetch: () => Promise<BannerSnapshot | null>;
}

async function fetchHtml(targetUrl: string): Promise<string> {
  const response = await fetch(targetUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(
      `获取页面源码失败: HTTP ${response.status} ${response.statusText}`,
    );
  }

  return await response.text();
}

/**
 * 抓取主站(首页) banner 数据
 */
async function fetchHomeBanner(): Promise<BannerSnapshot> {
  const html = await fetchHtml("https://www.bilibili.com/");
  const snapshot = parseBannerFromHtml(html, 0);
  return snapshot;
}

/**
 * 抓取指定分区 banner 数据
 */
async function fetchRegionBanner(
  region: RegionInfo,
): Promise<BannerSnapshot | null> {
  const regionUrl = `https://api.bilibili.com/x/web-show/page/header/v2?category=1&region_id=${region.id}`;

  const response = await fetch(regionUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    console.warn(
      `\n请求分区 [${region.name}] 接口失败: HTTP ${response.status}`,
    );
    return null;
  }

  const resJson = (await response.json()) as {
    code: number;
    message: string;
    data?: Record<string, unknown>;
  };

  if (resJson.code !== 0 || !resJson.data) {
    console.warn(
      `\n分区 [${region.name}] 接口返回错误: code=${resJson.code}, message=${resJson.message}`,
    );
    return null;
  }

  const rawData = resJson.data;
  if (!rawData.pic && (!rawData.split_layer || rawData.split_layer === "{}")) {
    return null;
  }

  const snapshot = parseRawHeaderBannerData(rawData, region.id);
  return snapshot;
}

function buildTasks(tids: number[]): Task[] {
  const tasks: Task[] = [];

  if (tids.length === 0) {
    tasks.push({ tid: 0, name: "主站 (首页)", fetch: fetchHomeBanner });
    for (const region of REGIONS) {
      tasks.push({
        tid: region.id,
        name: region.name,
        fetch: () => fetchRegionBanner(region),
      });
    }
  } else {
    for (const tid of tids) {
      if (tid === 0) {
        tasks.push({ tid: 0, name: "主站 (首页)", fetch: fetchHomeBanner });
      } else {
        const region = REGIONS.find((r) => r.id === tid);
        if (region) {
          tasks.push({
            tid: region.id,
            name: region.name,
            fetch: () => fetchRegionBanner(region),
          });
        }
      }
    }
  }

  return tasks;
}

async function executeTasks(tasks: Task[]): Promise<BannerSnapshot[]> {
  const snapshots: BannerSnapshot[] = [];

  for (const task of tasks) {
    process.stdout.write(`\x1b[K正在请求 [${task.name}] 数据...\r`);
    try {
      const banner = await task.fetch();
      if (banner) {
        if (!banner.name || banner.name.trim() === "") {
          banner.name = task.name;
        }
        snapshots.push(banner);
      }
    } catch (err: unknown) {
      process.stdout.write("\n");
      throw new Error(
        `抓取 [${task.name}] 出错: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  process.stdout.write("\x1b[K");
  return snapshots;
}

function internalDeduplicate(snapshots: BannerSnapshot[]): BannerSnapshot[] {
  // urlKey → index in uniqueSnapshots，用排序后的所有 URL 拼接作为 banner 唯一标识
  const keyToIndex = new Map<string, number>();
  const uniqueSnapshots: BannerSnapshot[] = [];

  for (const snapshot of snapshots) {
    const key = generateBannerKey(snapshot);
    if (!key) continue;

    const existingIndex = keyToIndex.get(key);

    if (existingIndex === undefined) {
      // 新 banner，加入列表
      keyToIndex.set(key, uniqueSnapshots.length);
      uniqueSnapshots.push({ ...snapshot, tid: [...snapshot.tid] });
    } else {
      // 已存在相同 banner，合并 tid
      const existing = uniqueSnapshots[existingIndex];
      for (const tid of snapshot.tid) {
        if (!existing.tid.includes(tid)) {
          existing.tid.push(tid);
        }
      }
      existing.tid.sort((a, b) => a - b);
    }
  }

  return uniqueSnapshots;
}

function generateBannerKey(banner: BannerSnapshot): string {
  const names = getBannerNames(banner);
  if (names.length === 0) return "";
  return [...names].sort().join("|");
}

function getBannerNames(banner: BannerSnapshot): string[] {
  const processName = (url: string) =>
    extractFileNameFromUrl(stripBilibiliSuffix(url));

  const names: string[] = [];
  if (banner.preview) names.push(processName(banner.preview));
  if (banner.logo) names.push(processName(banner.logo));
  for (const layer of banner.layers || []) {
    for (const res of layer.resources || []) {
      if (res.src) names.push(processName(res.src));
    }
  }
  return names;
}

export async function fetchBanners(tids: number[]): Promise<BannerSnapshot[]> {
  const tasks = buildTasks(tids);
  const snapshots = await executeTasks(tasks);
  return internalDeduplicate(snapshots);
}
