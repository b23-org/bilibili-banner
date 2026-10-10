import { collectConfigSources, scanAllPhysicalFiles } from "../core/assets";
import type {
  ManifestContext,
  StepResult,
  ValidationIssue,
} from "../core/types";

const BANNER_SRC_PATTERN = /^(\d{4})-(\d{2})-\d{2}/;

export function toPhysicalAssetPath(src: string): string {
  const match = src.match(BANNER_SRC_PATTERN);
  if (match) {
    const [, year, month] = match;
    return `${year}/${month}/${src}`;
  }
  if (/^(?:logo|extensions|404)\//.test(src)) {
    return src;
  }
  return src;
}

export function checkAssets(context: ManifestContext): StepResult {
  const startedAt = performance.now();
  const issues: ValidationIssue[] = [];
  const references = new Map<string, { manifestFile: string; refId: string }>();
  const referencedPublicPaths = new Set<string>();

  for (const { manifestFile, ref } of context.refs) {
    for (const src of collectConfigSources(ref.config)) {
      references.set(src, { manifestFile, refId: ref.id });
      const physicalAssetPath = toPhysicalAssetPath(src);
      referencedPublicPaths.add(`assets/${physicalAssetPath}`);
    }
  }

  const physicalFiles = scanAllPhysicalFiles();

  for (const [src, owner] of [...references].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const physicalAssetPath = toPhysicalAssetPath(src);
    const publicPath = `assets/${physicalAssetPath}`;

    if (!physicalFiles.has(publicPath)) {
      issues.push({
        kind: "missing-asset",
        path: src,
        manifestFile: owner.manifestFile,
        refId: owner.refId,
        message: "Manifest 引用的资源文件不存在",
      });
    }

    const logoMatch = src.match(/^(?:assets\/)?logo\/(\d{4})\//);
    if (logoMatch) {
      const logoYear = logoMatch[1];
      const manifestYear = owner.manifestFile.replace(".json", "");
      if (logoYear !== manifestYear) {
        issues.push({
          kind: "logo-year-mismatch",
          path: src,
          manifestFile: owner.manifestFile,
          refId: owner.refId,
          message: `Banner 所属年份 (${manifestYear}) 与引用的 Logo 年份 (${logoYear}) 不一致`,
        });
      }
    }
  }

  for (const path of [...physicalFiles.keys()].sort()) {
    if (!referencedPublicPaths.has(path)) {
      issues.push({
        kind: "extra-asset",
        path,
        message: "资源文件未被任何 manifest src 引用",
      });
    }
  }

  return {
    name: "资源文件校验",
    checked: references.size + physicalFiles.size,
    issues,
    durationMs: performance.now() - startedAt,
  };
}
