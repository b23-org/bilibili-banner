import fs from "node:fs";
import path from "node:path";
import type { BannerEntry } from "../../src/types";
import type { LogoRules } from "../grab/support/types";
import { loadLogoRules } from "./scan";

export interface ParsedReviewDecisions {
  standardsByYear: Map<string, string[]>;
  preserveByYear: Map<string, Set<string>>;
  variantsByYear: Map<string, Set<string>>;
  totalMarkedCount: number;
}

/**
 * 解析 .cache/logo-review.md 中的 0 / 1 / 2 标记状态
 */
export function parseReviewMarkdown(content: string): ParsedReviewDecisions {
  const standardsByYear = new Map<string, string[]>();
  const preserveByYear = new Map<string, Set<string>>();
  const variantsByYear = new Map<string, Set<string>>();
  let totalMarkedCount = 0;

  const lines = content.split("\n");
  let currentYear = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // 匹配年份标题，例如 "## 2026年"
    const yearMatch = line.match(/^##\s*(\d{4})年/);
    if (yearMatch) {
      currentYear = yearMatch[1]!;
      if (!standardsByYear.has(currentYear)) {
        standardsByYear.set(currentYear, []);
      }
      if (!preserveByYear.has(currentYear)) {
        preserveByYear.set(currentYear, new Set());
      }
      if (!variantsByYear.has(currentYear)) {
        variantsByYear.set(currentYear, new Set());
      }
      continue;
    }

    if (!currentYear) continue;

    // 匹配第一列状态位: "| 0<!-- xxx.png --> |" 或 "| 2 | ![xxx.png](...) |"
    const rowMatch = line.match(
      /^\|\s*([012])(?:\s*<!--\s*([a-f0-9]{40}\.png)\s*-->)?/,
    );
    if (rowMatch) {
      const status = rowMatch[1] as "0" | "1" | "2";
      let fileName = rowMatch[2];

      // 若未从第一列注释中提取到文件名，则容错从行内图片路径提取
      if (!fileName) {
        const fileMatch = line.match(/([a-f0-9]{40}\.png)/);
        if (fileMatch) {
          fileName = fileMatch[1];
        }
      }

      if (fileName) {
        if (status === "0") {
          standardsByYear.get(currentYear)!.push(fileName);
        } else if (status === "1") {
          preserveByYear.get(currentYear)!.add(fileName);
        } else if (status === "2") {
          variantsByYear.get(currentYear)!.add(fileName);
        }
        totalMarkedCount++;
      }
    }
  }

  return {
    standardsByYear,
    preserveByYear,
    variantsByYear,
    totalMarkedCount,
  };
}

/**
 * 执行阶段二：应用审查确认与闭环归档
 */
export async function executeApplyPhase(
  projectRoot = process.cwd(),
): Promise<void> {
  const reviewMdPath = path.resolve(projectRoot, ".cache/logo-review.md");
  const rulesPath = path.resolve(
    projectRoot,
    "scripts/grab/data/logo-rules.json",
  );
  const manifestDir = path.resolve(projectRoot, "src/manifest");
  const assetsLogoDir = path.resolve(projectRoot, "public/assets/logo");
  const variantsLogoDir = path.resolve(projectRoot, ".cache/variants-logo");

  if (!fs.existsSync(reviewMdPath)) {
    console.error(
      "❌ 未找到审查报告 .cache/logo-review.md，请先执行 `pnpm clean-logo` 进行扫描探测。",
    );
    process.exit(1);
  }

  const reviewContent = fs.readFileSync(reviewMdPath, "utf8");
  const { standardsByYear, preserveByYear, variantsByYear, totalMarkedCount } =
    parseReviewMarkdown(reviewContent);

  if (totalMarkedCount === 0) {
    console.log("ℹ️ .cache/logo-review.md 中未发现任何标记项，无需应用变更。");
    return;
  }

  const logoRules = loadLogoRules(rulesPath);
  const standardLogos = { ...logoRules.standards };

  // ── 安全防呆校验 ──
  for (const [year, stdFiles] of standardsByYear.entries()) {
    if (stdFiles.length > 1) {
      console.error(
        `❌ [防呆校验拦截] ${year} 年标记了多个标准 Logo (0): [${stdFiles.join(", ")}]，每个年份仅允许指定一个标准 Logo！`,
      );
      process.exit(1);
    }
    if (stdFiles.length === 1) {
      standardLogos[year] = `logo/${year}/${stdFiles[0]}`;
    }
  }

  // 检查待替换变种 (2) 是否均有标杆可重定向
  for (const [year, varFiles] of variantsByYear.entries()) {
    if (varFiles.size > 0 && !standardLogos[year]) {
      console.error(
        `❌ [防呆校验拦截] ${year} 年标记了待替换变种 (2)，但该年份尚未指定标准 Logo (0)！`,
      );
      process.exit(1);
    }
  }

  console.log(`\n========================================`);
  console.log(`🚀 开始执行 Logo 数据治理与归档...`);

  // 1. 构建待替换映射: oldSrc -> targetSrc (例如 "logo/2026/0daf...png" -> "logo/2026/cc70...png")
  const replacementMap = new Map<string, string>();
  const filesToArchive = new Map<string, Set<string>>();

  for (const [year, varFiles] of variantsByYear.entries()) {
    const targetSrc = standardLogos[year]!;
    const targetFileName = path.basename(targetSrc);

    if (!filesToArchive.has(year)) {
      filesToArchive.set(year, new Set());
    }

    for (const fileName of varFiles) {
      if (fileName === targetFileName) {
        console.warn(
          `[跳过] 文件 ${fileName} 为标杆自身，拒绝将其作为变种替换！`,
        );
        continue;
      }
      const oldSrc = `logo/${year}/${fileName}`;
      replacementMap.set(oldSrc, targetSrc);
      filesToArchive.get(year)!.add(fileName);
    }
  }

  // 2. 批量改写 src/manifest/*.json
  let totalReplacedRefs = 0;
  const manifestFiles = fs
    .readdirSync(manifestDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  for (const mFile of manifestFiles) {
    const mFilePath = path.join(manifestDir, mFile);
    const content = fs.readFileSync(mFilePath, "utf8");
    const json = JSON.parse(content) as BannerEntry[];

    let modified = false;
    let fileReplacedCount = 0;

    for (const group of json) {
      for (const ref of group.refs ?? []) {
        if (ref.config?.logo?.src) {
          const currentSrc = ref.config.logo.src;
          const targetSrc = replacementMap.get(currentSrc);
          if (targetSrc && targetSrc !== currentSrc) {
            ref.config.logo.src = targetSrc;
            totalReplacedRefs++;
            fileReplacedCount++;
            modified = true;
          }
        }
      }
    }

    if (modified) {
      fs.writeFileSync(mFilePath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
      console.log(
        `  • [Manifest 更新] ${mFile} (改写 ${fileReplacedCount} 处引用)`,
      );
    }
  }

  // 3. 更新 logo-rules.json (standards, preserve, variants)
  const preserveSet = new Set(logoRules.preserve);
  const variantsSet = new Set(logoRules.variants);

  // 处理 1 (preserve 保护名单)
  let addedPreserveCount = 0;
  for (const preserveFiles of preserveByYear.values()) {
    for (const fileName of preserveFiles) {
      if (!preserveSet.has(fileName)) {
        preserveSet.add(fileName);
        addedPreserveCount++;
      }
      variantsSet.delete(fileName); // 保证互斥
    }
  }

  // 处理 2 (variants 变种名单)
  let addedVariantsCount = 0;
  for (const varFiles of filesToArchive.values()) {
    for (const fileName of varFiles) {
      if (!variantsSet.has(fileName)) {
        variantsSet.add(fileName);
        addedVariantsCount++;
      }
      preserveSet.delete(fileName); // 保证互斥
    }
  }

  const updatedLogoRules: LogoRules = {
    standards: standardLogos,
    preserve: Array.from(preserveSet).sort(),
    variants: Array.from(variantsSet).sort(),
  };

  fs.writeFileSync(
    rulesPath,
    `${JSON.stringify(updatedLogoRules, null, 2)}\n`,
    "utf8",
  );
  console.log(`  • [Logo 规则库更新]`);
  console.log(
    `    - 标准标杆设定: ${Object.keys(standardLogos).length} 个年份`,
  );
  console.log(
    `    - 豁免名单追加: ${addedPreserveCount} 个切片 (总计 ${preserveSet.size})`,
  );
  console.log(
    `    - 变种名单追加: ${addedVariantsCount} 个切片 (总计 ${variantsSet.size})`,
  );

  // 4. 校验全量 Manifest 引用，确认待移动切片引用归零
  const activeReferencedLogos = new Set<string>();
  for (const mFile of manifestFiles) {
    const content = fs.readFileSync(path.join(manifestDir, mFile), "utf8");
    const json = JSON.parse(content) as BannerEntry[];
    for (const group of json) {
      for (const ref of group.refs ?? []) {
        if (ref.config?.logo?.src) {
          activeReferencedLogos.add(ref.config.logo.src);
        }
      }
    }
  }

  // 5. 将 0 引用的物理切片安全移动归档至 .cache/variants-logo/{YYYY}/xxx.png
  // 严格遵循：没有被移动切片的年份绝对不生成文件夹
  let totalArchivedFiles = 0;
  for (const [year, fileSet] of filesToArchive.entries()) {
    const yearTargetDir = path.join(variantsLogoDir, year);

    for (const fileName of fileSet) {
      const srcPath = `logo/${year}/${fileName}`;
      if (activeReferencedLogos.has(srcPath)) {
        console.warn(`  • [安全跳过] 切片仍被引用，拒绝移动: ${srcPath}`);
        continue;
      }

      const sourceFile = path.join(assetsLogoDir, year, fileName);
      const destFile = path.join(yearTargetDir, fileName);

      if (fs.existsSync(sourceFile)) {
        if (!fs.existsSync(yearTargetDir)) {
          fs.mkdirSync(yearTargetDir, { recursive: true });
        }
        fs.renameSync(sourceFile, destFile);
        totalArchivedFiles++;
        console.log(
          `  • [切片安全归档] ${year}/${fileName} -> .cache/variants-logo/${year}/`,
        );
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`🎉 治理应用执行成功！`);
  console.log(`  • Manifest 条目改写: ${totalReplacedRefs} 处`);
  console.log(`  • 豁免名单 (1) 新增: ${addedPreserveCount} 个`);
  console.log(`  • 变种名单 (2) 新增: ${addedVariantsCount} 个`);
  console.log(
    `  • 冗余物理切片归档: ${totalArchivedFiles} 个 (存至 .cache/variants-logo/{YYYY}/)`,
  );
  console.log(`========================================\n`);
}
