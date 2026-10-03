import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
  collectConfigSources,
  scanBannerDirectories,
  scanBannerFiles,
} from "../core/assets";
import { PUBLIC_ROOT } from "../core/paths";
import type {
  ManifestContext,
  StepResult,
  ValidationIssue,
} from "../core/types";

export function checkAssets(context: ManifestContext): StepResult {
  const startedAt = performance.now();
  const issues: ValidationIssue[] = [];
  const references = new Map<string, { manifestFile: string; refId: string }>();

  for (const { manifestFile, ref } of context.refs) {
    for (const src of collectConfigSources(ref.config)) {
      references.set(src, { manifestFile, refId: ref.id });
    }
  }

  for (const [src, owner] of [...references].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!existsSync(resolvePath(PUBLIC_ROOT, src))) {
      issues.push({
        kind: "missing-asset",
        path: src,
        manifestFile: owner.manifestFile,
        refId: owner.refId,
        message: "Manifest 引用的资源文件不存在",
      });
    }
  }

  const physicalFiles = scanBannerFiles(scanBannerDirectories());
  for (const path of [...physicalFiles.keys()].sort()) {
    if (!references.has(path)) {
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
