import { beforeEach, describe, expect, it, vi } from "vitest";
import { BannerEngine } from "../src/core/BannerEngine";
import type { Renderer } from "../src/renderer/Renderer";
import * as rendererFactory from "../src/renderer/Renderer";
import { store } from "../src/state/store";
import type { BannerRef, SimpleImageConfig } from "../src/types";

describe("BannerEngine 与 RenderSession 调度竞态", () => {
  let mockContainer: HTMLElement;

  const createMockBanner = (id: string): BannerRef<SimpleImageConfig> => ({
    id,
    name: `Banner ${id}`,
    tags: ["img"],
    tid: [0],
    config: {
      type: "simple-image",
      layer: { src: `assets/${id}.png` },
    },
  });

  beforeEach(() => {
    store.failedRefIds.value = new Set();
    vi.restoreAllMocks();

    const attributes = new Map<string, string>();
    mockContainer = {
      setAttribute: vi.fn((k: string, v: string) => attributes.set(k, v)),
      getAttribute: vi.fn((k: string) => attributes.get(k) ?? null),
      removeAttribute: vi.fn((k: string) => attributes.delete(k)),
      style: {},
    } as unknown as HTMLElement;
  });

  it("连续快速调用 100 次 display，仅最后一次成功 mount，前面的会话全部被 dispose", async () => {
    const engine = new BannerEngine();
    const createdRenderers: Renderer[] = [];

    vi.spyOn(rendererFactory, "createRenderer").mockImplementation(() => {
      const mockR: Renderer = {
        prepare: vi.fn(
          async () => new Promise<void>((resolve) => setTimeout(resolve, 5)),
        ),
        mount: vi.fn(),
        start: vi.fn(),
        dispose: vi.fn(),
      };
      createdRenderers.push(mockR);
      return mockR;
    });

    const calls: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      calls.push(engine.display(mockContainer, createMockBanner(`id-${i}`)));
    }

    await Promise.all(calls);

    expect(createdRenderers.length).toBe(100);

    // 前 99 个全部触发了 dispose，且没有调用 mount
    for (let i = 0; i < 99; i++) {
      expect(createdRenderers[i].dispose).toHaveBeenCalled();
      expect(createdRenderers[i].mount).not.toHaveBeenCalled();
    }

    // 最后一个成功 mount 和 start
    const lastRenderer = createdRenderers[99];
    expect(lastRenderer.mount).toHaveBeenCalledWith(mockContainer);
    expect(lastRenderer.start).toHaveBeenCalled();
    expect(mockContainer.getAttribute("data-state")).toBe("running");
  });

  it("mount 抛错时自动 teardown、兜底记录黑名单并切换为 failed 状态", async () => {
    const engine = new BannerEngine();

    const mockR: Renderer = {
      prepare: vi.fn(async () => {}),
      mount: vi.fn(() => {
        throw new Error("Mount error");
      }),
      start: vi.fn(),
      dispose: vi.fn(),
    };

    vi.spyOn(rendererFactory, "createRenderer").mockReturnValue(mockR);

    await engine.display(mockContainer, createMockBanner("crash-banner"));

    expect(mockR.dispose).toHaveBeenCalled();
    expect(store.isRefFailed("crash-banner")).toBe(true);
    expect(mockContainer.getAttribute("data-state")).toBe("failed");
  });

  it("同一 BannerRef 传入时防抖去重，不重复创建会话", async () => {
    const engine = new BannerEngine();
    const mockR: Renderer = {
      prepare: vi.fn(async () => {}),
      mount: vi.fn(),
      start: vi.fn(),
      dispose: vi.fn(),
    };
    const factorySpy = vi
      .spyOn(rendererFactory, "createRenderer")
      .mockReturnValue(mockR);

    const banner = createMockBanner("same-id");

    await engine.display(mockContainer, banner);
    expect(factorySpy).toHaveBeenCalledTimes(1);

    // 再次传入相同 banner
    await engine.display(mockContainer, banner);
    expect(factorySpy).toHaveBeenCalledTimes(1);
  });

  it("teardown 兜底复原容器初始行内样式快照", async () => {
    mockContainer.setAttribute("style", "height: 155px; overflow: hidden;");

    const engine = new BannerEngine();
    const mockR1: Renderer = {
      prepare: vi.fn(async () => {}),
      mount: vi.fn(() => {
        // 模拟扩展修改了容器高度
        mockContainer.setAttribute(
          "style",
          "height: 600px; overflow: visible;",
        );
      }),
      start: vi.fn(),
      dispose: vi.fn(),
    };
    const mockR2: Renderer = {
      prepare: vi.fn(async () => {}),
      mount: vi.fn(),
      start: vi.fn(),
      dispose: vi.fn(),
    };
    vi.spyOn(rendererFactory, "createRenderer")
      .mockReturnValueOnce(mockR1)
      .mockReturnValueOnce(mockR2);

    await engine.display(mockContainer, createMockBanner("style-test"));
    expect(mockContainer.getAttribute("style")).toBe(
      "height: 600px; overflow: visible;",
    );

    // 切换到下一个，旧会话 abort，触发 teardown 样式复原
    await engine.display(mockContainer, createMockBanner("next-banner"));
    expect(mockContainer.getAttribute("style")).toBe(
      "height: 155px; overflow: hidden;",
    );
  });
});
