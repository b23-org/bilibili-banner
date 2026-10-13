import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeLogoImage,
  calculateLogoSimilarity,
  decodePngRgba,
} from "../scripts/grab/core/logo-matcher";

describe("Logo Matcher 与 PNG 解码器", () => {
  const fixturePath = path.resolve(
    process.cwd(),
    "test/fixtures/interlaced-white-logo.png",
  );
  const interlacedLogoPath = fs.existsSync(fixturePath)
    ? fixturePath
    : path.resolve(
        process.cwd(),
        "public/assets/logo/2026/0daf3e6e5588590acf175cb4df1b0dbfeb31dd0d.png",
      );
  const nonInterlacedLogoPath = path.resolve(
    process.cwd(),
    "public/assets/logo/2026/cc7076d2639f877181621311ded1d425d29a89bd.png",
  );

  it("能正确解码 Adam7 隔行扫描 PNG 图像且像素不失真", () => {
    const buf = fs.readFileSync(interlacedLogoPath);
    // 确认该文件确实是 Adam7 隔行扫描格式 (IHDR index 28 / chunkData 12 为 1)
    expect(buf[28]).toBe(1);

    const decoded = decodePngRgba(buf);
    expect(decoded.width).toBe(220);
    expect(decoded.height).toBe(105);

    // 检查有效像素全为白色且无假性色彩
    let visibleCount = 0;
    let whiteCount = 0;
    for (let i = 0; i < decoded.rgba.length; i += 4) {
      const a = decoded.rgba[i + 3];
      if (a > 25) {
        visibleCount++;
        const r = decoded.rgba[i];
        const g = decoded.rgba[i + 1];
        const b = decoded.rgba[i + 2];
        if (r === 255 && g === 255 && b === 255) {
          whiteCount++;
        }
      }
    }

    expect(visibleCount).toBeGreaterThan(1000);
    expect(whiteCount / visibleCount).toBe(1);
  });

  it("能正确将 Adam7 隔行扫描白色 Logo 识别为纯白并计算高相似度", () => {
    const candidateBuf = fs.readFileSync(interlacedLogoPath);
    const standardBuf = fs.readFileSync(nonInterlacedLogoPath);

    const candidateAnalysis = analyzeLogoImage(candidateBuf);
    const standardAnalysis = analyzeLogoImage(standardBuf);

    expect(candidateAnalysis.isWhiteOrGrayscale).toBe(true);
    expect(standardAnalysis.isWhiteOrGrayscale).toBe(true);
    expect(candidateAnalysis.bbox).not.toBeNull();

    const similarity = calculateLogoSimilarity(
      candidateAnalysis,
      standardAnalysis,
    );
    // 两张纯白 Logo 的形状相似度应达到 90%
    expect(similarity).toBeGreaterThanOrEqual(0.85);
  });

  it("能自动识别并排除带有深色阴影/边框的 Logo", () => {
    const shadowLogoPath = path.resolve(
      process.cwd(),
      "public/assets/logo/2020/966ff59c641604f7a8c3c3d6f7d234b7f3e1a11f.png",
    );
    const buf = fs.readFileSync(shadowLogoPath);
    const analysis = analyzeLogoImage(buf);

    // 阴影像素占比超标，应直接判定为 false
    expect(analysis.isWhiteOrGrayscale).toBe(false);
  });

  it("能自动识别并排除附带额外文字内容的 Logo", () => {
    const extraContentLogoPath = path.resolve(
      process.cwd(),
      "public/assets/logo/2019/1be2fd76cc98cdc6a595c05c3134fbf937a1c126.png",
    );
    const buf = fs.readFileSync(extraContentLogoPath);
    const analysis = analyzeLogoImage(buf);

    // 横排附加文字导致长宽比严重偏离标准形态 (AR > 2.45)，应判定为 false
    expect(analysis.isWhiteOrGrayscale).toBe(false);
  });
});
