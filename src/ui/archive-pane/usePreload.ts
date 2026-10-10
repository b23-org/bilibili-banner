import { useEffect, useState } from "preact/hooks";
import type { AssetMap } from "../../core/asset-map";
import { loadRefAssets } from "../../core/loadRefAssets";
import type { ResourceEntry } from "../../core/preload";
import { preloadResources } from "../../core/preload";
import { store } from "../../state/store";

export type PreloadStatus = "loading" | "ready" | "error";

/**
 * 资源批量预加载 Hook
 * - 接收 srcs: string[] 和可选的 refId: string
 * - 前置拦截：若 refId 已在失败黑名单中，直接返回 'error'，跳过网络请求
 * - 构造 image 资源项调用 loadRefAssets / preloadResources 并关联 AbortController
 * - 卸载时调用 assets.dispose() 释放资源作用域
 * - 返回状态: 'loading' | 'ready' | 'error'
 */
export function usePreload(srcs: string[], refId?: string): PreloadStatus {
  const isFailed = refId ? store.isRefFailed(refId) : false;

  const [status, setStatus] = useState<PreloadStatus>(() => {
    if (isFailed) return "error";
    return srcs.length === 0 ? "ready" : "loading";
  });

  const srcsKey = srcs.join("\0");

  useEffect(() => {
    if (isFailed) {
      setStatus("error");
      return;
    }

    if (srcs.length === 0) {
      setStatus("ready");
      return;
    }

    setStatus("loading");
    const controller = new AbortController();
    let loadedAssets: AssetMap | null = null;

    const entries: ResourceEntry[] = srcs.map((src) => ({
      type: "image" as const,
      src,
    }));

    const task = refId
      ? loadRefAssets(refId, entries, controller.signal)
      : preloadResources(entries, { signal: controller.signal });

    task
      .then((assets) => {
        if (!controller.signal.aborted) {
          loadedAssets = assets;
          setStatus("ready");
        } else {
          assets.dispose();
        }
      })
      .catch((err: unknown) => {
        // 卡片被回收/卸载或依赖重置触发 abort，不进入 error 状态
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        setStatus("error");
      });

    return () => {
      controller.abort();
      loadedAssets?.dispose();
      loadedAssets = null;
    };
  }, [srcsKey, refId, isFailed]);

  return isFailed ? "error" : status;
}
