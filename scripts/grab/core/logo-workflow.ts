import fs from "node:fs";
import path from "node:path";
import { downloadSingleFile } from "../infra/downloader";
import type { GrabConfig, GrabEntry, Reporter } from "../support/types";
import { stripCdnSuffix } from "../support/url";
import {
  areLogosVisuallySimilar,
  getLogoGeometry,
  promptConfirmLogoReplacement,
} from "./logo-matcher";

export interface StagedLogoItem {
  url: string;
  stagedPath: string;
  fileName: string;
  year: string;
}

/**
 * 将所有待抓取条目涉及的 Logo 资源并发下载至 .cache/staging/logos/ 暂存目录
 */
export async function downloadLogosToStaging(
  entries: readonly GrabEntry[],
  config: GrabConfig,
  report?: Reporter,
): Promise<StagedLogoItem[]> {
  const logoMap = new Map<string, StagedLogoItem>();
  const stagingLogosBase = path.resolve(config.stagingDir, "logos");

  for (const entry of entries) {
    if (entry.logoInfo) {
      const { url, year, fileName } = entry.logoInfo;
      const cleanUrl = stripCdnSuffix(url);
      const stagedPath = path.resolve(stagingLogosBase, year, fileName);

      if (!logoMap.has(stagedPath)) {
        logoMap.set(stagedPath, {
          url: cleanUrl,
          stagedPath,
          fileName,
          year,
        });
      }
    }
  }

  const stagedList = Array.from(logoMap.values());
  for (const item of stagedList) {
    const dir = path.dirname(item.stagedPath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    try {
      await downloadSingleFile(
        {
          sourceUrl: item.url,
          fileName: item.fileName,
          filePath: item.stagedPath,
        },
        config,
      );
    } catch (err: unknown) {
      report?.({
        type: "download:error",
        displayName: `[Staging Logo ${item.year}] ${item.fileName}`,
        error: err instanceof Error ? err : new Error(String(err)),
      });
      throw err;
    }
  }

  return stagedList;
}

/**
 * 加载年份通用白色标杆 Logo 字典
 */
function loadStandardWhiteLogos(config: GrabConfig): Record<string, string> {
  if (fs.existsSync(config.standardLogoFilePath)) {
    try {
      const content = fs.readFileSync(config.standardLogoFilePath, "utf8");
      return JSON.parse(content) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * 编排 Logo 落地前的相似度比对、交互式询问确认与原子发布
 * 决策后将所有涉及的文件名直接追加到内存的 assetIndex Set 中，由流水线最后统一写盘
 */
export async function processAndPromoteLogos(
  entries: readonly GrabEntry[],
  stagedLogos: readonly StagedLogoItem[],
  config: GrabConfig,
  assetIndex: Set<string>,
): Promise<void> {
  const standardLogos = loadStandardWhiteLogos(config);

  for (const item of stagedLogos) {
    const { stagedPath, fileName, year } = item;
    const targetAssetPath = path.resolve(
      config.assetsDir,
      "logo",
      year,
      fileName,
    );

    // 1. 若该 Logo 在正式目录中已存在（例如历史公共 Logo），直接复用并记录索引
    if (fs.existsSync(targetAssetPath)) {
      if (fs.existsSync(stagedPath)) {
        fs.unlinkSync(stagedPath);
      }
      assetIndex.add(fileName);
      continue;
    }

    // 2. 检查该年份是否有标杆白色 Logo
    const standardLogoSrc = standardLogos[year];
    const standardFileName = standardLogoSrc
      ? path.basename(standardLogoSrc)
      : null;
    const standardFullPath = standardLogoSrc
      ? path.resolve(config.projectRoot, "public/assets", standardLogoSrc)
      : null;

    let shouldReplace = false;

    if (
      standardLogoSrc &&
      standardFullPath &&
      standardFileName !== fileName &&
      fs.existsSync(standardFullPath) &&
      fs.existsSync(stagedPath)
    ) {
      const candidateBuf = fs.readFileSync(stagedPath);
      const standardBuf = fs.readFileSync(standardFullPath);

      const { isSimilar, similarity, candidateAnalysis } =
        areLogosVisuallySimilar(candidateBuf, standardBuf, 0.85);

      if (isSimilar) {
        const geo = getLogoGeometry(candidateAnalysis);
        const relPath = path.relative(config.projectRoot, stagedPath);
        const dx = geo ? geo.deltaCenterX : 0;
        const dy = geo ? geo.deltaCenterY : 0;
        const dxStr = `${dx > 0 ? "+" : ""}${dx.toFixed(1)}px`;
        const dyStr = `${dy > 0 ? "+" : ""}${dy.toFixed(1)}px`;

        console.log(`\n${"=".repeat(56)}`);
        console.log(
          `🔍 检测到新 Logo 与 ${year} 年通用白色 Logo 样式高度相似！`,
        );
        console.log(`  • 画布大小: ${geo?.canvasWidth}x${geo?.canvasHeight}`);
        console.log(
          `  • BBox 大小: ${geo?.bboxWidth}x${geo?.bboxHeight} (minX: ${geo?.minX}, minY: ${geo?.minY})`,
        );
        console.log(
          `  • 居中状态: 水平偏离中心 ${dxStr}, 垂直偏离中心 ${dyStr}`,
        );
        console.log(`  • 暂存文件路径: ${relPath}`);
        console.log(`  • 匹配相似度: ${(similarity * 100).toFixed(1)}%`);
        console.log(
          `  • 目标通用 Logo: ${standardLogoSrc} (${standardFileName})`,
        );
        console.log("=".repeat(56));

        shouldReplace = await promptConfirmLogoReplacement(
          "👉 是否替换为该年通用白色logo? (y/n): ",
        );
      }
    }

    // 3. 执行替换或发布决策
    if (shouldReplace && standardLogoSrc) {
      // 替换所有引用此变种 Logo 的 Entry 的 Manifest 配置
      for (const entry of entries) {
        if (entry.logoInfo?.fileName === fileName) {
          if (entry.config.logo) {
            entry.config.logo.src = standardLogoSrc;
          }
          if (entry.ref.config?.logo) {
            entry.ref.config.logo.src = standardLogoSrc;
          }
        }
      }

      // 丢弃 Staging 中暂存的变种 Logo 切图（不发布到 public）
      if (fs.existsSync(stagedPath)) {
        fs.unlinkSync(stagedPath);
      }
      console.log(`✅ 已确认替换并重定向至: ${standardLogoSrc}\n`);
    } else {
      // 保留暂存 Logo 并发布到 public/assets/logo/{year}/{fileName}
      const destDir = path.dirname(targetAssetPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      if (fs.existsSync(stagedPath)) {
        fs.copyFileSync(stagedPath, targetAssetPath);
        fs.unlinkSync(stagedPath);
      }
      console.log(`📦 已保留独立切图并发布: logo/${year}/${fileName}\n`);
    }

    // 4. 将文件名存入内存 assetIndex Set，统一由流水线最后一步原子写盘
    assetIndex.add(fileName);
  }

  // 清理空的暂存 logos 目录
  const stagingLogosBase = path.resolve(config.stagingDir, "logos");
  if (fs.existsSync(stagingLogosBase)) {
    try {
      fs.rmSync(stagingLogosBase, { recursive: true, force: true });
    } catch {
      // 静默清理
    }
  }
}
