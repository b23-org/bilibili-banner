import type { BannerConfig, BannerData, BannerRef } from "../types";
import { BANNER_TYPES_ARR } from "../types";

export class BannerLoader {
  private bannerCache: Map<string, BannerData> = new Map();

  public getCached(path: string): BannerData | undefined {
    return this.bannerCache.get(path);
  }

  public async load(ref: BannerRef): Promise<BannerData> {
    const cachedBanner = this.bannerCache.get(ref.path);
    if (cachedBanner) {
      console.info(`[DataLoader] 命中缓存: ${ref.path}`);
      return cachedBanner;
    }

    const banner = await parseBannerData(ref);
    this.bannerCache.set(ref.path, banner);
    return banner;
  }
}

async function parseBannerData(ref: BannerRef): Promise<BannerData> {
  const year = ref.path.substring(0, 4);
  const url = `${import.meta.env.BASE_URL}assets/${year}/${ref.path}/data.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status} at ${url}`);
  }
  const rawData = (await res.json()) as BannerConfig;

  if (!rawData.type || !BANNER_TYPES_ARR.includes(rawData.type)) {
    throw new Error(
      `[BannerDataLoader] 数据格式错误，发现未知 Banner 类型: ${rawData.type}`,
    );
  }

  console.info(
    `[DataLoader] 配置加载并解析成功: ${ref.path} (类型: ${rawData.type})`,
  );

  return {
    ...ref,
    ...rawData,
  } as BannerData;
}
