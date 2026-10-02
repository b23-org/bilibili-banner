import { useEffect, useState } from "preact/hooks";
import { preloadResources } from "../../core/preload";

export type PreloadStatus = "loading" | "ready" | "error";

/**
 * 资源批量预加载 Hook (Task 4.2a)
 * - 接收 srcs: string[]
 * - 构造 image 资源项调用 preloadResources 并关联 AbortController
 * - 组件卸载或依赖变化时自动 abort 中止进行中的请求
 * - 卡片回收时被 abort 中止不进入 error 状态
 * - 返回状态: 'loading' | 'ready' | 'error'
 */
export function usePreload(srcs: string[]): PreloadStatus {
  const [status, setStatus] = useState<PreloadStatus>(() =>
    srcs.length === 0 ? "ready" : "loading",
  );

  const srcsKey = srcs.join("\0");

  useEffect(() => {
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
        setStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [srcsKey]);

  return status;
}
