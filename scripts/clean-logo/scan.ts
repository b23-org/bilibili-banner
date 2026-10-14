import fs from "node:fs";
import path from "node:path";
import {
  analyzeLogoImage,
  calculateLogoSimilarity,
} from "../grab/core/logo-matcher";
import type { LogoRules } from "../grab/support/types";
import type {
  CandidateLogoItem,
  CleanLogoOptions,
  ClusterGroup,
  YearScanResult,
} from "./types";

/**
 * 遍历 manifest 收集每个 Logo 对应的代表 Banner ID
 */
export function collectManifestLogoBanners(
  manifestDir: string,
): Map<string, string> {
  const bannerMap = new Map<string, string>();
  if (!fs.existsSync(manifestDir)) return bannerMap;

  const files = fs
    .readdirSync(manifestDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(manifestDir, file), "utf8");
      const list = JSON.parse(content) as {
        refs?: { id?: string; config?: { logo?: { src?: string } } }[];
      }[];

      for (const group of list) {
        for (const ref of group.refs ?? []) {
          const logoSrc = ref.config?.logo?.src;
          if (logoSrc && ref.id) {
            const fileName = path.basename(logoSrc);
            if (!bannerMap.has(fileName)) {
              bannerMap.set(fileName, ref.id);
            }
          }
        }
      }
    } catch {
      // 忽略无法解析的 manifest
    }
  }

  return bannerMap;
}

/**
 * 读取 Logo 规则知识库
 */
export function loadLogoRules(rulesPath: string): LogoRules {
  if (fs.existsSync(rulesPath)) {
    try {
      const content = fs.readFileSync(rulesPath, "utf8");
      const parsed = JSON.parse(content) as Partial<LogoRules>;
      return {
        standards: parsed.standards ?? {},
        preserve: parsed.preserve ?? [],
        variants: parsed.variants ?? [],
      };
    } catch {
      return { standards: {}, preserve: [], variants: [] };
    }
  }
  return { standards: {}, preserve: [], variants: [] };
}

/**
 * 计算 Logo 有效 BBox 在画布中的居中状态
 * 允许离散像素网格引起的 1px 奇偶差值 (diffX <= 1 && diffY <= 1 视为正中心)
 */
export function evaluateBBoxCentering(
  width: number,
  height: number,
  bbox: { minX: number; maxX: number; minY: number; maxY: number } | null,
): { isCentered: boolean; centerTag: string } {
  if (!bbox) return { isCentered: false, centerTag: "" };

  const left = bbox.minX;
  const right = width - 1 - bbox.maxX;
  const top = bbox.minY;
  const bottom = height - 1 - bbox.maxY;
  const diffX = Math.abs(left - right);
  const diffY = Math.abs(top - bottom);

  if (diffX <= 1 && diffY <= 1) {
    return { isCentered: true, centerTag: "🎯 **正中心**" };
  }

  const parts: string[] = [];
  if (diffX > 1) {
    const ox = Math.round(diffX / 2);
    parts.push(left < right ? `偏左 ${ox}px` : `偏右 ${ox}px`);
  }
  if (diffY > 1) {
    const oy = Math.round(diffY / 2);
    parts.push(top < bottom ? `偏上 ${oy}px` : `偏下 ${oy}px`);
  }
  return { isCentered: false, centerTag: `*(${parts.join(", ")})*` };
}

/**
 * 层次聚类（完全链接法 Complete Linkage）
 * 用于新年份冷启动或无标杆年份时的全量无监督分组
 */
export function clusterWithCompleteLinkage(
  items: CandidateLogoItem[],
  threshold = 0.8,
): CandidateLogoItem[][] {
  const clusters: CandidateLogoItem[][] = items.map((it) => [it]);

  while (true) {
    let bestPair: [number, number] | null = null;
    let bestMinSim = -1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const clusterA = clusters[i]!;
        const clusterB = clusters[j]!;
        let minSim = 1;

        for (const a of clusterA) {
          for (const b of clusterB) {
            const s = calculateLogoSimilarity(a.analysis, b.analysis);
            if (s < minSim) minSim = s;
          }
        }

        if (minSim >= threshold && minSim > bestMinSim) {
          bestMinSim = minSim;
          bestPair = [i, j];
        }
      }
    }

    if (!bestPair) break;

    const [c1, c2] = bestPair;
    clusters[c1] = clusters[c1]!.concat(clusters[c2]!);
    clusters.splice(c2, 1);
  }

  return clusters;
}

/**
 * 执行阶段一：扫描探测与报告生成
 */
export async function executeScanPhase(
  options: CleanLogoOptions,
  projectRoot = process.cwd(),
): Promise<void> {
  const t0 = performance.now();
  const baseLogoDir = path.resolve(projectRoot, "public/assets/logo");
  const cacheDir = path.resolve(projectRoot, ".cache");
  const manifestDir = path.resolve(projectRoot, "src/manifest");
  const rulesPath = path.resolve(
    projectRoot,
    "scripts/grab/data/logo-rules.json",
  );

  if (!fs.existsSync(baseLogoDir)) {
    console.error("未找到 public/assets/logo 目录");
    process.exit(1);
  }

  const logoRules = loadLogoRules(rulesPath);
  const manifestBannerMap = collectManifestLogoBanners(manifestDir);
  const preserveSet = new Set(logoRules.preserve);
  const variantsSet = new Set(logoRules.variants);

  const availableYears = fs
    .readdirSync(baseLogoDir)
    .filter((y) => {
      try {
        return fs.statSync(path.join(baseLogoDir, y)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();

  let yearsToProcess: string[];
  if (options.targetYear) {
    if (!availableYears.includes(options.targetYear)) {
      console.error(
        `[错误] 未找到指定年份 "${options.targetYear}" 对应的资源目录。`,
      );
      console.error(`当前可用年份: ${availableYears.join(", ")}`);
      process.exit(1);
    }
    yearsToProcess = [options.targetYear];
    console.log(`[单年模式] 正在扫描 ${options.targetYear} 年的 Logo...`);
  } else {
    yearsToProcess = availableYears;
    console.log(
      `[全量模式] 正在扫描全量年份 (${availableYears.length} 个年份)...`,
    );
  }

  const scanResults: YearScanResult[] = [];

  for (const year of yearsToProcess) {
    const yearDir = path.join(baseLogoDir, year);
    const standardLogoSrc = logoRules.standards[year] ?? null;
    const standardFileName = standardLogoSrc
      ? path.basename(standardLogoSrc)
      : null;
    const standardFullPath = standardLogoSrc
      ? path.resolve(projectRoot, "public/assets", standardLogoSrc)
      : null;

    let standardAnalysis = null;
    const hasStandard = Boolean(
      standardFullPath && fs.existsSync(standardFullPath),
    );
    if (hasStandard && standardFullPath) {
      try {
        const stdBuf = fs.readFileSync(standardFullPath);
        standardAnalysis = analyzeLogoImage(stdBuf);
      } catch {
        // 忽略
      }
    }

    const fileNames = fs
      .readdirSync(yearDir)
      .filter((f) => f.endsWith(".png"))
      .sort();

    const whiteItems: CandidateLogoItem[] = [];

    for (const fileName of fileNames) {
      // 排除已归档的变种和免检白名单
      if (preserveSet.has(fileName) || variantsSet.has(fileName)) {
        continue;
      }

      const filePath = path.join(yearDir, fileName);
      try {
        const buf = fs.readFileSync(filePath);
        const analysis = analyzeLogoImage(buf);

        if (analysis.isWhiteOrGrayscale) {
          const centerStatus = evaluateBBoxCentering(
            analysis.width,
            analysis.height,
            analysis.bbox,
          );
          const bboxStr = analysis.bbox
            ? `${analysis.bbox.width}x${analysis.bbox.height} (x:${analysis.bbox.minX}, y:${analysis.bbox.minY})`
            : "N/A";

          whiteItems.push({
            year,
            fileName,
            relativePublicPath: `public/assets/logo/${year}/${fileName}`,
            absolutePath: filePath,
            representativeBannerId: manifestBannerMap.get(fileName) ?? null,
            analysis,
            similarityToStandard: 0,
            isCentered: centerStatus.isCentered,
            centerTag: centerStatus.centerTag,
            bboxStr,
          });
        }
      } catch (err: unknown) {
        console.warn(
          `[跳过] 解析失败: ${fileName} (${err instanceof Error ? err.message : String(err)})`,
        );
      }
    }

    if (hasStandard && standardAnalysis) {
      // ── 模式 A：已有标杆基准模式 ──
      const candidates: CandidateLogoItem[] = [];
      for (const item of whiteItems) {
        if (item.fileName === standardFileName) {
          continue;
        }
        const sim = calculateLogoSimilarity(item.analysis, standardAnalysis);
        if (sim >= 0.8) {
          item.similarityToStandard = Number((sim * 100).toFixed(1));
          candidates.push(item);
        }
      }
      candidates.sort(
        (a, b) => b.similarityToStandard - a.similarityToStandard,
      );

      scanResults.push({
        year,
        standardSrc: standardLogoSrc,
        standardFileName,
        totalLogos: fileNames.length,
        whiteLogos: whiteItems.length,
        candidates,
      });
    } else {
      // ── 模式 B：新年份/无标杆冷启动聚类模式 ──
      const clusters = clusterWithCompleteLinkage(whiteItems, 0.8);
      // 仅保留成员数 >= 2 的相似组（单个独立 Logo 不存在重复变种，不予成组）
      const duplicateClusters = clusters.filter((c) => c.length > 1);

      // 对每个群组排序：优先有效 BBox 正中心、有效面积大、有代表 Banner ID
      const clusterGroups: ClusterGroup[] = duplicateClusters.map((c, idx) => {
        c.sort((a, b) => {
          if (a.isCentered && !b.isCentered) return -1;
          if (!a.isCentered && b.isCentered) return 1;
          const areaA =
            (a.analysis.bbox?.width ?? 0) * (a.analysis.bbox?.height ?? 0);
          const areaB =
            (b.analysis.bbox?.width ?? 0) * (b.analysis.bbox?.height ?? 0);
          if (areaA !== areaB) return areaB - areaA;
          return a.fileName.localeCompare(b.fileName);
        });

        // 计算组内所有成员与组内第 1 个元素的相似度
        const leader = c[0]!;
        for (const member of c) {
          if (member === leader) {
            member.similarityToStandard = 100;
          } else {
            const s = calculateLogoSimilarity(leader.analysis, member.analysis);
            member.similarityToStandard = Number((s * 100).toFixed(1));
          }
        }

        return {
          groupId: idx + 1,
          members: c,
        };
      });

      // 组间排序：成员多的群组排在前面
      clusterGroups.sort((a, b) => b.members.length - a.members.length);
      const clusterMemberFiles = clusterGroups.flatMap((g) => g.members);

      scanResults.push({
        year,
        standardSrc: null,
        standardFileName: null,
        totalLogos: fileNames.length,
        whiteLogos: whiteItems.length,
        candidates: clusterMemberFiles,
        clusterGroups,
      });
    }
  }

  // 组装 Markdown 报告
  let md = "# 白色普通 Logo 变种审查与清洗报告\n\n";
  md +=
    "> 本文档由 `pnpm clean-logo` 自动生成，置于 `.cache/logo-review.md`，用于视觉对比核验。\n>\n";
  md +=
    "> **标记状态说明（表格第一列，仅填写数字 0 / 1 / 2，已内置隐藏文件名注释）：**\n";
  md +=
    "> - **`0`：标准 Logo**（设定/推举为该年份官方基准标杆，写入 `standards[year]`）；\n";
  md +=
    "> - **`1`：忽略/保护列表**（免检白名单，作为独立定制 Logo 永久保留，写入 `preserve`）；\n";
  md +=
    "> - **`2`：待替换变种**（等效变种噪声，Manifest 改写重定向至标准 Logo，切片归档至 `.cache/variants-logo/`，写入 `variants`）。\n>\n";
  md +=
    "> 审阅完成后，在编辑器中核对或按需修改第一列的状态数字，然后运行 `pnpm clean-logo --apply` 即可批量自动执行。\n\n";

  md += "## 目录与汇总\n\n";
  md += "| 年份 | 总 Logo 数 | 白色 Logo 数 | 待核验变种/分组数 |\n";
  md += "| :--- | :--- | :--- | :--- |\n";

  let totalPendingFiles = 0;
  for (const s of scanResults) {
    if (s.standardFileName) {
      totalPendingFiles += s.candidates.length;
      md += `| [${s.year}](#${s.year}年) | ${s.totalLogos} | ${s.whiteLogos} | ${s.candidates.length} 个候选变种 |\n`;
    } else {
      const groupCount = s.clusterGroups?.length ?? 0;
      totalPendingFiles += s.candidates.length;
      md += `| [${s.year}](#${s.year}年) | ${s.totalLogos} | ${s.whiteLogos} | ${groupCount} 个相似聚类组 |\n`;
    }
  }
  md += "\n---\n\n";

  for (const s of scanResults) {
    if (
      s.candidates.length === 0 &&
      (!s.clusterGroups || s.clusterGroups.length === 0) &&
      !options.targetYear
    ) {
      continue;
    }

    md += `## ${s.year}年\n\n`;

    if (s.standardSrc && s.standardFileName) {
      // ── 模式 A 展示：已有官方标杆 ──
      const stdRelPublic = `public/assets/${s.standardSrc}`;
      const stdAbsPath = path.resolve(projectRoot, stdRelPublic);

      if (fs.existsSync(stdAbsPath)) {
        try {
          const buf = fs.readFileSync(stdAbsPath);
          const analysis = analyzeLogoImage(buf);
          const bbox = analysis.bbox
            ? `${analysis.bbox.width}x${analysis.bbox.height} (x:${analysis.bbox.minX}, y:${analysis.bbox.minY})`
            : "N/A";
          const centerStatus = evaluateBBoxCentering(
            analysis.width,
            analysis.height,
            analysis.bbox,
          );
          const bannerId = manifestBannerMap.get(s.standardFileName) ?? null;

          const statusCol = `0<!-- ${s.standardFileName} -->`;
          const imgMd = `![${s.standardFileName}](../${stdRelPublic})`;
          const bannerLinkMd = bannerId
            ? `[\`${bannerId}\`](http://localhost:5173/?id=${bannerId})`
            : "`-`";
          const bboxCol = centerStatus.centerTag
            ? `${analysis.width}x${analysis.height}<br/>\`${bbox}\`<br/>${centerStatus.centerTag}`
            : `${analysis.width}x${analysis.height}<br/>\`${bbox}\``;

          md += `### ${s.year} 年 - 当前基准图\n\n`;
          md +=
            "| 状态 | 预览 | 代表 Banner 预览链接 | 尺寸 (有效 BBox / 居中状态) | 标杆状态 |\n";
          md += "| :---: | :---: | :---: | :---: | :---: |\n";
          md += `| ${statusCol} | ${imgMd} | ${bannerLinkMd} | ${bboxCol} | 🎯 **官方基准 (100%)** |\n\n`;
        } catch {
          // 忽略
        }
      }

      if (s.candidates.length === 0) {
        md += "当前年份未发现疑似变种 Logo 切片。\n\n---\n\n";
        continue;
      }

      md += `### ${s.year} 年 - 候选变种列表 (${s.candidates.length} 个文件)\n\n`;
      md +=
        "| 状态 | 预览 | 代表 Banner 预览链接 | 尺寸 (有效 BBox / 居中状态) | 与基准图相似度 |\n";
      md += "| :---: | :---: | :---: | :---: | :---: |\n";

      for (const m of s.candidates) {
        // >= 85% 默认推荐替换为标杆 (2)；80%~84% 默认建议保留 (1)
        const defaultStatus = m.similarityToStandard >= 85 ? "2" : "1";
        const statusCol = `${defaultStatus}<!-- ${m.fileName} -->`;
        const imgMd = `![${m.fileName}](../${m.relativePublicPath})`;
        const bannerLinkMd = m.representativeBannerId
          ? `[\`${m.representativeBannerId}\`](http://localhost:5173/?id=${m.representativeBannerId})`
          : "`-`";
        const bboxCol = m.centerTag
          ? `${m.analysis.width}x${m.analysis.height}<br/>\`${m.bboxStr}\`<br/>${m.centerTag}`
          : `${m.analysis.width}x${m.analysis.height}<br/>\`${m.bboxStr}\``;

        md += `| ${statusCol} | ${imgMd} | ${bannerLinkMd} | ${bboxCol} | ${m.similarityToStandard}% |\n`;
      }
      md += "\n---\n\n";
    } else {
      // ── 模式 B 展示：无标杆年份聚类展示 ──
      const groups = s.clusterGroups ?? [];

      for (const g of groups) {
        md += `### ${s.year} 年 - 候选相似组 #${g.groupId} (${g.members.length} 个文件)\n\n`;
        md +=
          "| 状态 | 预览 | 代表 Banner 预览链接 | 尺寸 (有效 BBox / 居中状态) | 组内相似度 |\n";
        md += "| :---: | :---: | :---: | :---: | :---: |\n";

        for (let i = 0; i < g.members.length; i++) {
          const m = g.members[i]!;
          // 无既有标杆年份默认保留 (1)，若人工审阅确认有标杆可手动改为 0 / 2
          const defaultStatus = "1";

          const statusCol = `${defaultStatus}<!-- ${m.fileName} -->`;
          const imgMd = `![${m.fileName}](../${m.relativePublicPath})`;
          const bannerLinkMd = m.representativeBannerId
            ? `[\`${m.representativeBannerId}\`](http://localhost:5173/?id=${m.representativeBannerId})`
            : "`-`";
          const bboxCol = m.centerTag
            ? `${m.analysis.width}x${m.analysis.height}<br/>\`${m.bboxStr}\`<br/>${m.centerTag}`
            : `${m.analysis.width}x${m.analysis.height}<br/>\`${m.bboxStr}\``;

          const simText =
            i === 0 ? "组内基准 (100%)" : `${m.similarityToStandard}%`;
          md += `| ${statusCol} | ${imgMd} | ${bannerLinkMd} | ${bboxCol} | ${simText} |\n`;
        }
        md += "\n";
      }
      md += "---\n\n";
    }
  }

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const reviewMdPath = path.join(cacheDir, "logo-review.md");
  fs.writeFileSync(reviewMdPath, md, "utf8");

  const duration = (performance.now() - t0).toFixed(0);
  console.log(`\n========================================`);
  console.log(
    `🔍 扫描完成 (耗时 ${duration}ms)！审查切片总计: ${totalPendingFiles} 个。`,
  );
  console.log(`📄 审查报告已输出至: .cache/logo-review.md`);
  console.log(
    `👉 请在编辑器中审阅图片，核对第一列状态数字 (0:标准 / 1:忽略保护 / 2:待替换)；`,
  );
  console.log(`   确认无误后运行: pnpm clean-logo --apply`);
  console.log(`========================================\n`);
}
