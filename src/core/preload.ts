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
      img.src = "";
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
      unregister();
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

    img.src = entry.src;
  });
}

function loadVideo(
  entry: Extract<ResourceEntry, { type: "video" }>,
  signal: AbortSignal,
  registerCleanup: (fn: () => void) => () => void,
): Promise<Extract<ResourceResult, { type: "video" }>> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    let settled = false;

    const cleanup = () => {
      video.removeEventListener("canplaythrough", onCanPlayThrough);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.src = "";
      video.load();
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
      video.removeEventListener("canplaythrough", onCanPlayThrough);
      video.removeEventListener("error", onError);
      unregister();
      resolve({ type: "video", element: video });
    }

    function onError() {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      cleanup();
      unregister();
      reject(new Error(`Failed to load video: ${entry.src}`));
    }

    video.addEventListener("canplaythrough", onCanPlayThrough, { once: true });
    video.addEventListener("error", onError, { once: true });

    video.src = entry.src;
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
      audio.removeAttribute("src");
      audio.src = "";
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
      unregister();
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

    audio.src = entry.src;
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
  const res = await fetchFn(entry.src, { signal });
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
 * 批量并行预加载资源。全部成功 → 返回同序结果数组。
 * 任一失败或超时 → reject 并清理所有进行中的资源。signal 中止 → reject + 清理。
 */
export async function preloadResources(
  entries: ResourceEntry[],
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<ResourceResult[]> {
  if (entries.length === 0) {
    return [];
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

  try {
    const tasks = entries.map((entry) => {
      switch (entry.type) {
        case "image":
          return loadImage(entry, internalSignal, registerCleanup);
        case "video":
          return loadVideo(entry, internalSignal, registerCleanup);
        case "audio":
          return loadAudio(entry, internalSignal, registerCleanup);
        case "fetch":
          return loadFetch(entry, internalSignal);
        default: {
          const exhaustiveCheck: never = entry;
          throw new Error(
            `Unsupported resource type: ${(exhaustiveCheck as { type: string }).type}`,
          );
        }
      }
    });

    const results = await Promise.all(tasks);
    return results;
  } catch (error) {
    if (!internalController.signal.aborted) {
      internalController.abort(error);
    }
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
