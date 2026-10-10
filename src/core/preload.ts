import { AssetMap } from "./asset-map";

export type ResourceEntry =
  | { type: "image"; src: string }
  | { type: "video"; src: string }
  | { type: "audio"; src: string }
  | {
      type: "fetch";
      src: string;
      as?: "json" | "blob" | "arrayBuffer" | "text";
    };

export type ResourceResult =
  | { type: "image"; element: HTMLImageElement }
  | { type: "video"; element: HTMLVideoElement }
  | { type: "audio"; element: HTMLAudioElement }
  | { type: "fetch"; data: unknown };

export function resolveAssetUrl(src: string): string {
  if (
    /^(https?:|\/\/|blob:|data:)/i.test(src) ||
    typeof window === "undefined"
  ) {
    return src;
  }
  const cleanSrc = src.replace(/^\/+/, "");
  if (import.meta.env?.DEV) {
    const bannerMatch = cleanSrc.match(/^(\d{4})-(\d{2})-\d{2}/);
    if (bannerMatch) {
      const year = bannerMatch[1];
      const month = bannerMatch[2];
      return `/assets/${year}/${month}/${cleanSrc}`;
    }
    return `/assets/${cleanSrc}`;
  }
  const baseUrl = import.meta.env?.VITE_ASSET_BASE_URL || "/";
  const cleanBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${cleanBase}${cleanSrc}`;
}

function loadImage(
  entry: Extract<ResourceEntry, { type: "image" }>,
  signal: AbortSignal,
  registerCleanup: (fn: () => void) => () => void,
): Promise<Extract<ResourceResult, { type: "image" }>> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
      img.removeAttribute("src");
    };

    const unregister = registerCleanup(cleanup);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      unregister();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });

    img.onload = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      img.onload = null;
      img.onerror = null;
      // 保留 cleanup 移交 AssetMap
      resolve({ type: "image", element: img });
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      cleanup();
      unregister();
      reject(new Error(`Failed to load image: ${entry.src}`));
    };

    img.src = resolveAssetUrl(entry.src);
  });
}

function loadVideo(
  entry: Extract<ResourceEntry, { type: "video" }>,
  signal: AbortSignal,
  registerCleanup: (fn: () => void) => () => void,
): Promise<Extract<ResourceResult, { type: "video" }>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let blobUrl = "";
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.style.objectFit = "cover";

    // 离屏样式，避免页面抖动或闪烁
    video.style.position = "fixed";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";

    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("error", onError);
      video.remove();
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = "";
      }
    };

    const unregister = registerCleanup(cleanup);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      unregister();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });

    function onLoadedMetadata() {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("error", onError);
      video.remove(); // 提取完元数据尺寸后立即移出 body
      // 保留 cleanup 移交 AssetMap
      resolve({
        type: "video",
        element: video,
      });
    }

    function onError(_err?: unknown) {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      cleanup();
      unregister();
      reject(new Error(`Failed to load video: ${entry.src}`));
    }

    video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
    video.addEventListener("error", onError, { once: true });

    const resolvedUrl = resolveAssetUrl(entry.src);
    fetch(resolvedUrl, { signal, credentials: "omit" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (settled) return;
        blobUrl = URL.createObjectURL(blob);
        video.src = blobUrl;
        document.body.appendChild(video);
      })
      .catch((err) => {
        if (!settled) onError(err);
      });
  });
}

function loadAudio(
  entry: Extract<ResourceEntry, { type: "audio" }>,
  signal: AbortSignal,
  registerCleanup: (fn: () => void) => () => void,
): Promise<Extract<ResourceResult, { type: "audio" }>> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.preload = "auto";
    let settled = false;

    const cleanup = () => {
      audio.removeEventListener("canplaythrough", onCanPlayThrough);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };

    const unregister = registerCleanup(cleanup);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      unregister();
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });

    function onCanPlayThrough() {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      audio.removeEventListener("canplaythrough", onCanPlayThrough);
      audio.removeEventListener("error", onError);
      resolve({ type: "audio", element: audio });
    }

    function onError() {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      cleanup();
      unregister();
      reject(new Error(`Failed to load audio: ${entry.src}`));
    }

    audio.addEventListener("canplaythrough", onCanPlayThrough, { once: true });
    audio.addEventListener("error", onError, { once: true });

    audio.src = resolveAssetUrl(entry.src);
  });
}

async function loadFetch(
  entry: Extract<ResourceEntry, { type: "fetch" }>,
  signal: AbortSignal,
): Promise<Extract<ResourceResult, { type: "fetch" }>> {
  const fetchFn =
    typeof window !== "undefined" && window.fetch
      ? window.fetch.bind(window)
      : fetch;
  const res = await fetchFn(resolveAssetUrl(entry.src), { signal });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch ${entry.src}: ${res.status} ${res.statusText}`,
    );
  }
  const as = entry.as ?? "json";
  let data: unknown;
  switch (as) {
    case "json":
      data = await res.json();
      break;
    case "blob":
      data = await res.blob();
      break;
    case "arrayBuffer":
      data = await res.arrayBuffer();
      break;
    case "text":
      data = await res.text();
      break;
    default:
      throw new Error(`Unsupported fetch format: ${as as string}`);
  }
  return { type: "fetch", data };
}

/**
 * 批量并行预加载资源
 * - 字典去重：同一 URL 仅发起一次请求
 * - 全部成功 → 将已记录清理回调与结果集合打包返回 AssetMap
 * - 任一失败或中止 → 内部立即执行所有已产生清理回调，防止悬挂泄漏并 reject
 */
export async function preloadResources(
  entries: ResourceEntry[],
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<AssetMap> {
  if (entries.length === 0) {
    return new AssetMap(new Map());
  }

  if (options?.signal?.aborted) {
    throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
  }

  const internalController = new AbortController();
  const internalSignal = internalController.signal;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (options?.timeoutMs !== undefined && options.timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      internalController.abort(
        new Error(`Preload timeout after ${options.timeoutMs}ms`),
      );
    }, options.timeoutMs);
  }

  const onExternalAbort = () => {
    internalController.abort(
      options?.signal?.reason ?? new DOMException("Aborted", "AbortError"),
    );
  };

  if (options?.signal) {
    options.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const cleanups = new Set<() => void>();
  const registerCleanup = (fn: () => void) => {
    cleanups.add(fn);
    return () => cleanups.delete(fn);
  };

  // 按 src 去重，避免重复加载
  const uniqueEntriesMap = new Map<string, ResourceEntry>();
  for (const entry of entries) {
    if (!uniqueEntriesMap.has(entry.src)) {
      uniqueEntriesMap.set(entry.src, entry);
    }
  }

  try {
    const tasks = Array.from(uniqueEntriesMap.values()).map(
      async (entry): Promise<[string, ResourceResult]> => {
        let result: ResourceResult;
        switch (entry.type) {
          case "image":
            result = await loadImage(entry, internalSignal, registerCleanup);
            break;
          case "video":
            result = await loadVideo(entry, internalSignal, registerCleanup);
            break;
          case "audio":
            result = await loadAudio(entry, internalSignal, registerCleanup);
            break;
          case "fetch":
            result = await loadFetch(entry, internalSignal);
            break;
          default: {
            const exhaustiveCheck: never = entry;
            throw new Error(
              `Unsupported resource type: ${(exhaustiveCheck as { type: string }).type}`,
            );
          }
        }
        return [entry.src, result];
      },
    );

    const settledResults = await Promise.all(tasks);
    const resultMap = new Map<string, ResourceResult>(settledResults);

    // 加载成功：所有权移交给 AssetMap
    return new AssetMap(resultMap, Array.from(cleanups));
  } catch (error) {
    if (!internalController.signal.aborted) {
      internalController.abort(error);
    }
    // 失败或取消：内部立即释放所有半成品资源
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        // 忽略 cleanup 过程中的次生异常
      }
    }
    cleanups.clear();
    throw error;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    if (options?.signal) {
      options.signal.removeEventListener("abort", onExternalAbort);
    }
  }
}
