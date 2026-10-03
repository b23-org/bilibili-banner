import { useEffect, useState } from "preact/hooks";
import { preloadResources } from "../../core/preload";
import { store } from "../../state/store";

export type PreloadStatus = "loading" | "ready" | "error";

/**
 * 资源批量预加载 Hook
 * - 接收 srcs: string[] 和可选的 refId: string
 * - 前置拦截：若 refId 已在失败黑名单中，直接返回 'error'，跳过网络请求
 * - 构造 image 资源项调用 preloadResources 并关联 AbortController
 * - 加载失败（非 abort）时，自动上报 store.markRefFailed(refId)
 * - 组件卸载或依赖变化时自动 abort 中止进行中的请求
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

    const entries = srcs.map((src) => ({
      type: "image" as const,
      src,
    }));

    preloadResources(entries, { signal: controller.signal })
      .then(() => {
        if (!controller.signal.aborted) {
          setStatus("ready");
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
        if (refId) {
          store.markRefFailed(refId);
        }
        setStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [srcsKey, refId, isFailed]);

  return isFailed ? "error" : status;
}
