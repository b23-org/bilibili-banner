export function releaseVideoElement(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute("src");
  video.srcObject = null;
  video.load();
}

export interface MediaDimensions {
  width: number;
  height: number;
}

/**
 * 通用的媒体加载等待函数
 */
export async function waitForMedia(
  el: HTMLImageElement | HTMLVideoElement,
  signal?: AbortSignal,
): Promise<MediaDimensions> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // 1. 检查是否已经就绪
  if (el instanceof HTMLVideoElement) {
    if (el.readyState >= 1 && el.videoWidth > 0) {
      return { width: el.videoWidth, height: el.videoHeight };
    }
  } else if (el instanceof HTMLImageElement) {
    if (el.complete && el.naturalWidth > 0) {
      return { width: el.naturalWidth, height: el.naturalHeight };
    }
  }

  // 2. 异步等待
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", onAbort, { once: true });

    const options = { once: true, signal };
    const successEvent =
      el instanceof HTMLVideoElement ? "loadedmetadata" : "load";

    el.addEventListener(
      successEvent,
      () => {
        signal?.removeEventListener("abort", onAbort);
        const width =
          el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
        const height =
          el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
        resolve({ width, height });
      },
      options,
    );

    el.addEventListener(
      "error",
      () => {
        signal?.removeEventListener("abort", onAbort);
        const src =
          el instanceof HTMLVideoElement ? el.currentSrc || el.src : el.src;
        reject(new Error(`媒体资源加载失败: ${src}`));
      },
      options,
    );
  });
}
