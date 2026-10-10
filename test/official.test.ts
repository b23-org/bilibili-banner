import { describe, expect, it } from "vitest";
import { FrameAnimator } from "../src/renderer/official/FrameAnimator";
import {
  computeLayerStyle,
  createLayerCurves,
  resolveBlurValue,
  resolveOpacityValue,
} from "../src/renderer/official/layer-style";
import type { LayersOfficial2021 } from "../src/types";

describe("官方视差 layer-style 纯函数计算", () => {
  it("resolveBlurValue 正确处理 clamp 与 alternate", () => {
    const identityCurve = (x: number) => x;

    // clamp 模式：值小于 0 截断为 0
    expect(resolveBlurValue(2, -5, identityCurve, 1, { wrap: "clamp" })).toBe(
      0,
    );

    // alternate 模式：取绝对值
    expect(
      resolveBlurValue(2, -5, identityCurve, 1, { wrap: "alternate" }),
    ).toBe(3);
  });

  it("resolveOpacityValue 正确处理 clamp 与 alternate", () => {
    const identityCurve = (x: number) => x;

    // clamp 模式：截断在 0~1
    expect(
      resolveOpacityValue(0.5, 1, identityCurve, 1, { wrap: "clamp" }),
    ).toBe(1);
    expect(
      resolveOpacityValue(0.5, -1, identityCurve, 1, { wrap: "clamp" }),
    ).toBe(0);

    // alternate 模式：三角波周期折叠
    expect(
      resolveOpacityValue(0, 1.5, identityCurve, 1, { wrap: "alternate" }),
    ).toBe(0.5);
  });

  it("computeLayerStyle 输出标准样式字符串", () => {
    const layer: LayersOfficial2021 = {
      resources: [{ src: "assets/layer.png" }],
      scale: { initial: 1, offset: 0.2 },
      rotate: { initial: 0, offset: 10 },
      translate: { initial: [0, 0], offset: [20, 10] },
      blur: { initial: 0, offset: 5 },
      opacity: { initial: 1, offset: -0.5 },
    };

    const curves = createLayerCurves(layer);
    const style = computeLayerStyle(layer, curves, 0.5, 1.5);

    expect(style.transform).toContain("translate(");
    expect(style.transform).toContain("rotate(");
    expect(style.transform).toContain("scale(");
    expect(style.filter).toContain("blur(");
    expect(Number(style.opacity)).toBeGreaterThan(0);
  });
});

describe("FrameAnimator 纯时间累加与跳帧", () => {
  it("正常时间流转按 duration 顺序切换帧", () => {
    const animator = new FrameAnimator();
    // 3 帧：每帧 100ms
    animator.registerLayer(0, [100, 100, 100]);

    animator.start(0);

    // 50ms: 仍在第 0 帧
    let changes = animator.tick(50);
    expect(changes.has(0)).toBe(false);
    expect(animator.getCurrentIndex(0)).toBe(0);

    // 120ms: 切换到第 1 帧
    changes = animator.tick(120);
    expect(changes.get(0)).toBe(1);
    expect(animator.getCurrentIndex(0)).toBe(1);

    // 250ms: 切换到第 2 帧
    changes = animator.tick(250);
    expect(changes.get(0)).toBe(2);
    expect(animator.getCurrentIndex(0)).toBe(2);

    // 310ms: 循环回到第 0 帧
    changes = animator.tick(310);
    expect(changes.get(0)).toBe(0);
    expect(animator.getCurrentIndex(0)).toBe(0);
  });

  it("大跨度时间漂移（如后台休眠数小时）取模跳帧，不卡死", () => {
    const animator = new FrameAnimator();
    animator.registerLayer(0, [100, 200]); // 总时长 300ms

    animator.start(0);

    // 模拟后台休眠 3,000,050ms (10000个周期 + 50ms)
    animator.tick(3_000_050);
    expect(animator.getCurrentIndex(0)).toBe(0); // 仍在第 0 帧 (余 50ms < 100ms)

    // 进一步推进 60ms (达到第 110ms，跨到第 1 帧)
    const nextChanges = animator.tick(3_000_110);
    expect(nextChanges.get(0)).toBe(1);
    expect(animator.getCurrentIndex(0)).toBe(1);
  });
});
