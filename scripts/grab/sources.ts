import type { BannerData } from "./parse";
import { parseBannerData, parseBannerDataFromJson } from "./parse";

// ============ 模块私有工具 ============

async function fetchHtml(targetUrl: string): Promise<string> {
  const response = await fetch(targetUrl, {
    signal: AbortSignal.timeout(5000),
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `获取页面源码失败: HTTP ${response.status} ${response.statusText}`,
    );
  }

  return await response.text();
}

function handleExtensions(
  extensions: Record<string, unknown> | undefined,
): void {
  if (extensions && Object.keys(extensions).length > 0) {
    const keys = Object.keys(extensions);
    console.log(
      `\x07\x1b[33m\n================================\n⚠️ 发现扩展字段 extensions: [${keys.join(", ")}]\n请手动检查是否需要特殊代码适配\n================================\n\x1b[0m`,
    );
  }
}

// ============ 数据源接口 ============

export interface BannerSource {
  name: string;
  tid: string;
  fetch(): Promise<BannerData | null>;
}

// ============ 主站数据源（HTML 解析） ============

export class HomeBannerSource implements BannerSource {
  name = "主站 (首页)";
  tid = "0";

  async fetch(): Promise<BannerData | null> {
    console.log("正在请求页面源码: https://www.bilibili.com/");
    const html = await fetchHtml("https://www.bilibili.com/");
    const bannerData = parseBannerData(html);
    handleExtensions(bannerData.extensions);
    return bannerData;
  }
}

// ============ 分区数据源（API JSON） ============

export class RegionBannerSource implements BannerSource {
  constructor(private region: { id: number; name: string }) {}

  get name(): string {
    return this.region.name;
  }

  get tid(): string {
    return this.region.id.toString();
  }

  async fetch(): Promise<BannerData | null> {
    const regionUrl = `https://api.bilibili.com/x/web-show/page/header/v2?category=1&region_id=${this.region.id}`;
    console.log(`正在请求分区 [${this.region.name}] Banner: ${regionUrl}`);

    const response = await fetch(regionUrl, {
      signal: AbortSignal.timeout(5000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
      },
    });

    if (!response.ok) {
      console.warn(
        `请求分区 [${this.region.name}] 接口失败: HTTP ${response.status}`,
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
        `分区 [${this.region.name}] 接口返回错误: code=${resJson.code}, message=${resJson.message}`,
      );
      return null;
    }

    const rawData = resJson.data;
    if (
      !rawData.pic &&
      (!rawData.split_layer || rawData.split_layer === "{}")
    ) {
      console.log(`分区 [${this.region.name}] 无有效 Banner 资源，跳过。`);
      return null;
    }

    return parseBannerDataFromJson(rawData);
  }
}
