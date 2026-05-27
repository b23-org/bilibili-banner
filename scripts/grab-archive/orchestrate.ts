import { initWaybackSession } from "./network";
import {
  parseFromApi_2022,
  parseFromCss_2013_2014,
  parseFromCss_2015,
  parseFromHtml_2019,
  parseFromHtml_2021,
  parseFromJS_2016,
} from "./parse";
import { processSimpleImage } from "./process-simple";
import { processSplitLayer } from "./process-split-layer";
import type {
  ArchiveArgs,
  ArchiveMode,
  BannerExtractor,
  SimpleBannerData2016,
  SplitBannerData2021,
} from "./types";

function extractArchiveInfo(
  url: string,
): { timestamp: string; archivePrefix: string; originalUrl: string } | null {
  const pattern = /web\.archive\.org\/web\/(\d{14})\/(.*)/;
  const match = url.match(pattern);
  if (!match) return null;
  return {
    timestamp: match[1],
    archivePrefix: `https://web.archive.org/web/${match[1]}/`,
    originalUrl: match[2],
  };
}

function isSplitLayerMode(mode: ArchiveMode): boolean {
  return mode === "split-2022-html" || mode === "split-2022-api";
}

function getExtractor(mode: ArchiveMode): BannerExtractor {
  switch (mode) {
    case "pic-2013-css-v1":
      return parseFromCss_2013_2014;
    case "pic-2015-css-v2":
      return parseFromCss_2015;
    case "pic-2016-js":
      return parseFromJS_2016;
    case "pic-2019-html":
      return parseFromHtml_2019;
    case "split-2022-html":
      return parseFromHtml_2021;
    case "split-2022-api":
      return parseFromApi_2022;
    default:
      throw new Error(`不支持的模式: ${mode}`);
  }
}

function buildDateStr(timestamp: string): string {
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

export async function runSimple(args: ArchiveArgs): Promise<void> {
  console.log(`\n🚀 [开始任务]`);
  console.log(`🔗 目标 URL: ${args.url}`);
  console.log(`🛠️  解析模式: ${args.mode}`);

  const info = extractArchiveInfo(args.url);
  if (!info) {
    console.error("错误: URL 不符合 Wayback Machine 格式");
    process.exitCode = 1;
    return;
  }

  await initWaybackSession(args.url);
  const dateStr = buildDateStr(info.timestamp);

  const extractor = getExtractor(args.mode);
  const result = await extractor(
    info.timestamp,
    info.archivePrefix,
    info.originalUrl,
  );
  if (!result) {
    console.error("未能提取到 Banner 信息 (模式选择错误或Banner资源不存在)");
    process.exitCode = 1;
    return;
  }

  if (isSplitLayerMode(args.mode)) {
    const data = result as SplitBannerData2021;
    await processSplitLayer(data, dateStr);
  } else {
    const data = result as SimpleBannerData2016;
    await processSimpleImage(data, dateStr);
  }

  console.log(`🎉 ${dateStr} 抓取成功`);
}
