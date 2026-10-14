import { describe, expect, it } from "vitest";
import { parseReviewMarkdown } from "../scripts/clean-logo/apply";
import {
  evaluateBBoxCentering,
  loadLogoRules,
} from "../scripts/clean-logo/scan";
import { loadKnownAssetIndex } from "../scripts/grab/core/dedup";
import { buildGrabConfig } from "../scripts/grab/support/config";

describe("纯内存判重与已知资产索引 loadKnownAssetIndex", () => {
  it("能快速从 Manifest 与 logo-rules 中投影出已知切图集合", () => {
    const config = buildGrabConfig();
    const t0 = performance.now();
    const assetIndex = loadKnownAssetIndex(config);
    const duration = performance.now() - t0;

    // 耗时应在 100ms 级别内（实测约 20ms）
    expect(duration).toBeLessThan(300);
    // 包含历史 variants 和 manifest 中的资源，总数应大于 2000 个
    expect(assetIndex.size).toBeGreaterThan(2000);

    // 检查 2026 年已知标杆与最新切片是否命中
    expect(assetIndex.has("cc7076d2639f877181621311ded1d425d29a89bd.png")).toBe(
      true,
    );

    // 检查 logo-rules.json.variants 中的变种切片是否命中
    const rules = loadLogoRules(config.logoRulesFilePath);
    for (const variant of rules.variants) {
      expect(assetIndex.has(variant)).toBe(true);
    }
  });
});

describe("Logo 审查与解析器 parseReviewMarkdown (三态解析)", () => {
  it("能精确解析 0 / 1 / 2 状态与年份归属", () => {
    const mockMarkdown = `
# 白色普通 Logo 变种审查与清洗报告

## 2026年

| 状态 | 预览 | 代表 Banner 预览链接 | 尺寸 (有效 BBox / 居中状态) | 与基准图相似度 |
| :---: | :---: | :---: | :---: | :---: |
| 0<!-- 0daf3e6e5588590acf175cb4df1b0dbfeb31dd0d.png --> | ![0daf3e6e...](...) | [\`banner1\`](...) | 220x105 | 100% |
| 2<!-- 1a17811adfffd83308d385028113228bf61e62c8.png --> | ![1a17811a...](...) | [\`banner2\`](...) | 220x105 | 89.0% |
| 1<!-- 33522952cf05f63982883be7d3f79a7bca2fef6e.png --> | ![33522952...](...) | [\`banner3\`](...) | 220x105 | 81.0% |

## 2024年

| 状态 | 预览 | 代表 Banner 预览链接 | 尺寸 (有效 BBox / 居中状态) | 与基准图相似度 |
| :---: | :---: | :---: | :---: | :---: |
| 2 | ![2b98ddd3f0e8dac45ddb95a77c3b18f751d3d8e2.png](...) | [\`banner4\`](...) | 220x105 | 95.0% |
`;

    const {
      standardsByYear,
      preserveByYear,
      variantsByYear,
      totalMarkedCount,
    } = parseReviewMarkdown(mockMarkdown);

    expect(totalMarkedCount).toBe(4);
    // 2026年 0 是标准 Logo
    expect(standardsByYear.get("2026")).toEqual([
      "0daf3e6e5588590acf175cb4df1b0dbfeb31dd0d.png",
    ]);
    // 2026年 2 是变种
    expect(
      variantsByYear
        .get("2026")
        ?.has("1a17811adfffd83308d385028113228bf61e62c8.png"),
    ).toBe(true);
    // 2026年 1 是保护项
    expect(
      preserveByYear
        .get("2026")
        ?.has("33522952cf05f63982883be7d3f79a7bca2fef6e.png"),
    ).toBe(true);
    // 2024年 无注释但行内包含图片路径，容错提取 2 为变种
    expect(
      variantsByYear
        .get("2024")
        ?.has("2b98ddd3f0e8dac45ddb95a77c3b18f751d3d8e2.png"),
    ).toBe(true);
  });
});

describe("evaluateBBoxCentering 居中度评估", () => {
  it("微小奇偶差值 (<= 1px) 判定为正中心", () => {
    // 宽 220，bbox 180 (minX: 20, maxX: 199 -> left: 20, right: 220-1-199 = 20)
    // 高 100，bbox 50 (minY: 25, maxY: 74 -> top: 25, bottom: 100-1-74 = 25)
    const result = evaluateBBoxCentering(220, 100, {
      minX: 20,
      maxX: 199,
      minY: 25,
      maxY: 74,
    });
    expect(result.isCentered).toBe(true);
    expect(result.centerTag).toContain("正中心");
  });

  it("偏离中心时计算偏移像素与方向描述", () => {
    // 宽 220，minX: 30, maxX: 209 -> left: 30, right: 10
    const result = evaluateBBoxCentering(220, 100, {
      minX: 30,
      maxX: 209,
      minY: 25,
      maxY: 74,
    });
    expect(result.isCentered).toBe(false);
    expect(result.centerTag).toContain("偏右 10px");
  });
});
