import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetMap } from "../src/core/asset-map";
import { loadRefAssets, RefFailedError } from "../src/core/loadRefAssets";
import * as preloadModule from "../src/core/preload";
import { resolveAssetUrl } from "../src/core/preload";
import { store } from "../src/state/store";

describe("AssetMap 作用域容器", () => {
  it("首次返回原始元素，再次返回克隆节点，视频克隆节点具备 muted 保护", () => {
    const mockCleanups: Array<() => void> = [];

    // Mock HTMLVideoElement
    const originalVideo = {
      tagName: "VIDEO",
      muted: true,
      videoWidth: 1920,
      videoHeight: 1080,
      cloneNode: vi.fn(() => ({
        tagName: "VIDEO",
        muted: false, // 模拟 cloneNode 丢失 muted 属性
        pause: vi.fn(),
        removeAttribute: vi.fn(),
        load: vi.fn(),
      })),
    } as unknown as HTMLVideoElement;

    // 确保 instanceof HTMLVideoElement 或属性判断兼容
    Object.setPrototypeOf(
      originalVideo,
      (globalThis.HTMLVideoElement || Object).prototype,
    );

    const resultMap = new Map([
      [
        "assets/test.mp4",
        {
          type: "video" as const,
          element: originalVideo,
        },
      ],
    ]);

    const assetMap = new AssetMap(resultMap, mockCleanups);

    // 首次取用：原始元素
    const firstTake = assetMap.takeElement("assets/test.mp4");
    expect(firstTake).toBe(originalVideo);

    // 再次取用：克隆节点且 muted 被强制设为 true
    const secondTake = assetMap.takeElement("assets/test.mp4");
    expect(secondTake).not.toBe(originalVideo);
    expect((secondTake as HTMLVideoElement).muted).toBe(true);

    // 验证第二次克隆追加了清理回调
    expect(mockCleanups.length).toBe(1);
  });

  it("dispose 按注册顺序倒序执行清理，且具备幂等性与抛错容错", () => {
    const executionOrder: number[] = [];
    const cleanups = [
      () => executionOrder.push(1),
      () => {
        executionOrder.push(2);
        throw new Error("Cleanup fault"); // 模拟异常
      },
      () => executionOrder.push(3),
    ];

    const assetMap = new AssetMap(new Map(), cleanups);
    assetMap.dispose();

    // 倒序执行：3 -> 2 -> 1
    expect(executionOrder).toEqual([3, 2, 1]);

    // 幂等性：再次调用不重复执行
    assetMap.dispose();
    expect(executionOrder).toEqual([3, 2, 1]);

    // dispose 后禁止再次 takeElement
    expect(() => assetMap.takeElement("any")).toThrowError();
  });
});

describe("loadRefAssets 资产门面", () => {
  beforeEach(() => {
    // 重置 store 中的失败黑名单
    store.failedRefIds.value = new Set();
    vi.restoreAllMocks();
  });

  it("命中黑名单时零网络直拒并抛出 RefFailedError", async () => {
    store.markRefFailed("failed-ref-id");
    const preloadSpy = vi.spyOn(preloadModule, "preloadResources");

    const controller = new AbortController();
    await expect(
      loadRefAssets("failed-ref-id", [], controller.signal),
    ).rejects.toThrow(RefFailedError);

    expect(preloadSpy).not.toHaveBeenCalled();
  });

  it("非 abort 异常时自动标记 refId 失败", async () => {
    vi.spyOn(preloadModule, "preloadResources").mockRejectedValue(
      new Error("404 Not Found"),
    );

    const controller = new AbortController();
    await expect(
      loadRefAssets("error-ref-id", [], controller.signal),
    ).rejects.toThrow("404 Not Found");

    expect(store.isRefFailed("error-ref-id")).toBe(true);
  });

  it("abort 中止异常不记入失败黑名单", async () => {
    const controller = new AbortController();
    controller.abort();

    vi.spyOn(preloadModule, "preloadResources").mockRejectedValue(
      new DOMException("Aborted", "AbortError"),
    );

    await expect(
      loadRefAssets("aborted-ref-id", [], controller.signal),
    ).rejects.toThrow();

    expect(store.isRefFailed("aborted-ref-id")).toBe(false);
  });
});

describe("resolveAssetUrl 资源路径解析器", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("非浏览器环境透传原始路径", () => {
    vi.stubGlobal("window", undefined);
    expect(resolveAssetUrl("2021-01-01-h00-t0/img.png")).toBe(
      "2021-01-01-h00-t0/img.png",
    );
    expect(resolveAssetUrl("logo/2021/logo.png")).toBe("logo/2021/logo.png");
  });

  it("外部协议与绝对链接原样透传", () => {
    expect(resolveAssetUrl("https://static.hdslb.com/banner.png")).toBe(
      "https://static.hdslb.com/banner.png",
    );
    expect(resolveAssetUrl("http://static.hdslb.com/banner.png")).toBe(
      "http://static.hdslb.com/banner.png",
    );
    expect(resolveAssetUrl("//cdn.example.com/asset.png")).toBe(
      "//cdn.example.com/asset.png",
    );
    expect(resolveAssetUrl("blob:http://localhost:3000/uuid")).toBe(
      "blob:http://localhost:3000/uuid",
    );
    expect(
      resolveAssetUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE="),
    ).toBe("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=");
  });

  describe("开发环境映射 (import.meta.env.DEV = true)", () => {
    it("Banner ID 年月还原匹配", () => {
      expect(
        resolveAssetUrl(
          "2021-01-01-h00-t0/ce5f5c1330f75a2788d27a3d9b620c291d489bd6.png",
        ),
      ).toBe(
        "/assets/2021/01/2021-01-01-h00-t0/ce5f5c1330f75a2788d27a3d9b620c291d489bd6.png",
      );
      // 支持去除前导斜杠
      expect(resolveAssetUrl("/2022-12-31-h12-t0/abc.png")).toBe(
        "/assets/2022/12/2022-12-31-h12-t0/abc.png",
      );
      expect(resolveAssetUrl("2024-05-20-h00-t0/resource.webp")).toBe(
        "/assets/2024/05/2024-05-20-h00-t0/resource.webp",
      );
    });

    it("Logo 资源映射", () => {
      expect(
        resolveAssetUrl(
          "logo/2021/771bd6d35c782a31565675f6d04f00fa1c48d0b9.png",
        ),
      ).toBe("/assets/logo/2021/771bd6d35c782a31565675f6d04f00fa1c48d0b9.png");
      expect(resolveAssetUrl("/logo/2023/logo.png")).toBe(
        "/assets/logo/2023/logo.png",
      );
    });

    it("Extensions 资源映射", () => {
      expect(resolveAssetUrl("extensions/snow/snowflake.png")).toBe(
        "/assets/extensions/snow/snowflake.png",
      );
      expect(resolveAssetUrl("extensions/autumn/")).toBe(
        "/assets/extensions/autumn/",
      );
      expect(resolveAssetUrl("extensions/spring/video/webglLoop.mp4")).toBe(
        "/assets/extensions/spring/video/webglLoop.mp4",
      );
      expect(
        resolveAssetUrl(
          "extensions/petals/7d2825f4034bb8106d1ee1d9adcb04d1343ad404.png",
        ),
      ).toBe(
        "/assets/extensions/petals/7d2825f4034bb8106d1ee1d9adcb04d1343ad404.png",
      );
    });

    it("404 及其它资源映射", () => {
      expect(resolveAssetUrl("404/default/list.json")).toBe(
        "/assets/404/default/list.json",
      );
      expect(resolveAssetUrl("/404/design/aoqhUIvZ3x.png")).toBe(
        "/assets/404/design/aoqhUIvZ3x.png",
      );
    });
  });

  describe("生产环境映射 (import.meta.env.DEV = false)", () => {
    it("默认 baseUrl ('/') 时正确拼接", () => {
      vi.stubEnv("DEV", false);
      expect(resolveAssetUrl("logo/2021/test.png")).toBe("/logo/2021/test.png");
      expect(resolveAssetUrl("2021-01-01-h00-t0/test.png")).toBe(
        "/2021-01-01-h00-t0/test.png",
      );
    });

    it("配置 VITE_ASSET_BASE_URL 时正确拼接", () => {
      vi.stubEnv("DEV", false);
      vi.stubEnv("VITE_ASSET_BASE_URL", "https://cdn.example.com/assets");
      expect(resolveAssetUrl("logo/2021/test.png")).toBe(
        "https://cdn.example.com/assets/logo/2021/test.png",
      );
      expect(resolveAssetUrl("/extensions/snow/snowflake.png")).toBe(
        "https://cdn.example.com/assets/extensions/snow/snowflake.png",
      );
    });

    it("配置带结尾斜杠的 VITE_ASSET_BASE_URL 时避免双斜杠", () => {
      vi.stubEnv("DEV", false);
      vi.stubEnv("VITE_ASSET_BASE_URL", "https://cdn.example.com/assets/");
      expect(resolveAssetUrl("404/default/list.json")).toBe(
        "https://cdn.example.com/assets/404/default/list.json",
      );
    });
  });
});
