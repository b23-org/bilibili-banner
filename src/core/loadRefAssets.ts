import { store } from "../state/store";
import type { AssetMap } from "./asset-map";
import type { ResourceEntry } from "./preload";
import { preloadResources } from "./preload";

export class RefFailedError extends Error {
  constructor(public readonly refId: string) {
    super(`Ref [${refId}] has already failed in this session`);
    this.name = "RefFailedError";
  }
}

/**
 * 统一资产门面服务
 * - 前置拦截：已标记失败的 ref 直接抛出 RefFailedError，零网络请求直拒
 * - 失败上报：非 Abort 错误自动同步记录至 store 会话级失败黑名单
 * - 返回值：带有生命周期作用域与反向析构能力的 AssetMap
 */
export async function loadRefAssets(
  refId: string,
  entries: ResourceEntry[],
  signal: AbortSignal,
  timeoutMs = 20_000,
): Promise<AssetMap> {
  if (store.isRefFailed(refId)) {
    throw new RefFailedError(refId);
  }

  try {
    return await preloadResources(entries, { signal, timeoutMs });
  } catch (error) {
    if (!signal.aborted) {
      store.markRefFailed(refId);
    }
    throw error;
  }
}
