import {
  extractSnapshotFromHtml,
  transformRawBannerDataToSnapshot,
} from "../core/parse";
import { findRegionById, REGIONS, type RegionInfo } from "../core/regions";
import { FetchError } from "../support/errors";
import type {
  BannerSnapshot,
  GrabConfig,
  RawBannerData,
  Reporter,
} from "../support/types";

interface RegionApiResponse {
  code: number;
  message: string;
  data?: RawBannerData;
}

/**
 * 抓取 B站主站（首页）Banner 数据
 * @throws {FetchError} 网络异常或响应非 200 时抛出
 */
export async function fetchHomeSnapshot(
  config: GrabConfig,
): Promise<BannerSnapshot> {
  const targetUrl = "https://www.bilibili.com/";
  let html: string;

  try {
    const response = await fetch(targetUrl, {
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": config.userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    html = await response.text();
  } catch (error: unknown) {
    throw new FetchError(
      "主站",
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }

  return extractSnapshotFromHtml(html, 0);
}

/**
 * 抓取指定分区的 Banner 数据
 * 返回 null 表示该分区当前无有效配置
 */
export async function fetchRegionSnapshot(
  region: RegionInfo,
  config: GrabConfig,
): Promise<BannerSnapshot | null> {
  const apiUrl = `https://api.bilibili.com/x/web-show/page/header/v2?category=1&region_id=${region.id}`;

  const response = await fetch(apiUrl, {
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
    headers: {
      "User-Agent": config.userAgent,
      Accept: "application/json, text/plain, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as RegionApiResponse;

  if (payload.code !== 0 || !payload.data) {
    throw new Error(
      `接口业务码异常: code=${payload.code}, msg=${payload.message}`,
    );
  }

  const rawData = payload.data;
  // 若既无静态图也无动画图层，判定该分区当前未配置 Banner
  if (!rawData.pic && (!rawData.split_layer || rawData.split_layer === "{}")) {
    return null;
  }

  return transformRawBannerDataToSnapshot(rawData, region.id);
}

interface FetchTask {
  readonly tid: number;
  readonly name: string;
  readonly execute: () => Promise<BannerSnapshot | null>;
}

/**
 * 根据指定的 tid 列表构建请求任务队列
 */
function buildFetchTasks(
  tids: readonly number[],
  config: GrabConfig,
): FetchTask[] {
  const tasks: FetchTask[] = [];

  const addHomeTask = () => {
    tasks.push({
      tid: 0,
      name: "主站",
      execute: () => fetchHomeSnapshot(config),
    });
  };

  const addRegionTask = (region: RegionInfo) => {
    tasks.push({
      tid: region.id,
      name: region.name,
      execute: () => fetchRegionSnapshot(region, config),
    });
  };

  if (tids.length === 0) {
    addHomeTask();
    for (const region of REGIONS) {
      addRegionTask(region);
    }
  } else {
    for (const tid of tids) {
      if (tid === 0) {
        addHomeTask();
      } else {
        const found = findRegionById(tid);
        if (found) {
          addRegionTask(found);
        }
      }
    }
  }

  return tasks;
}

/**
 * 串行执行所有分区的抓取任务，收集 BannerSnapshot 列表
 */
export async function fetchAllSnapshots(
  tids: readonly number[],
  config: GrabConfig,
  report: Reporter,
): Promise<BannerSnapshot[]> {
  const tasks = buildFetchTasks(tids, config);
  const collectedSnapshots: BannerSnapshot[] = [];

  for (const task of tasks) {
    report({ type: "fetch:start", regionName: task.name });

    try {
      const snapshot = await task.execute();
      if (snapshot) {
        collectedSnapshots.push(snapshot);
        report({ type: "fetch:done", regionName: task.name });
      } else {
        report({
          type: "fetch:skip",
          regionName: task.name,
          reason: "该分区暂无配置",
        });
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      // 若首页抓取失败，属于致命异常立即中断；分区异常则记录跳过
      if (task.tid === 0) {
        report({ type: "fetch:error", regionName: task.name, error });
        throw error;
      }
      report({ type: "fetch:error", regionName: task.name, error });
    }
  }

  return collectedSnapshots;
}
