import { scanBannerDirectories } from "../core/assets";
import type {
  ManifestContext,
  StepResult,
  ValidationIssue,
} from "../core/types";

const ID_PATTERN = /^(\d{4})-(\d{2})-\d{2}/;

export function checkManifestDirectories(context: ManifestContext): StepResult {
  const startedAt = performance.now();
  const issues: ValidationIssue[] = [];
  const configured = new Map<string, { manifestFile: string; refId: string }>();
  const ignoredInteractivePaths = new Set<string>();

  for (const { manifestFile, entryDate, ref } of context.refs) {
    const idMatch = ref.id.match(ID_PATTERN);

    // Workaround: interactive 资源当前不遵循标准目录映射规则，因此跳过双向校验。
    // TODO: 后续重构 Banner Engine 时应移除此分支，并恢复统一的目录映射校验。
    if (ref.tags.includes("interactive")) {
      if (idMatch) {
        const [, year, month] = idMatch;
        ignoredInteractivePaths.add(`${year}/${month}/${ref.id}`);
      }
      continue;
    }
    if (!idMatch) {
      issues.push({
        kind: "invalid-ref-id",
        path: `src/manifest/${manifestFile}`,
        manifestFile,
        refId: ref.id,
        message: "ref.id 无法映射为 YYYY/MM 资源目录",
      });
      continue;
    }

    const [, year, month] = idMatch;
    const entryYearMonth = entryDate.slice(0, 7);
    if (`${year}-${month}` !== entryYearMonth) {
      issues.push({
        kind: "date-path-mismatch",
        path: `${year}/${month}/${ref.id}`,
        manifestFile,
        refId: ref.id,
        message: `ref.id 年月与 entry.date ${entryDate} 不一致`,
      });
    }

    configured.set(`${year}/${month}/${ref.id}`, {
      manifestFile,
      refId: ref.id,
    });
  }

  const physical = new Set(
    scanBannerDirectories()
      .map(({ relativePath }) => relativePath)
      .filter((path) => !ignoredInteractivePaths.has(path)),
  );

  for (const [path, owner] of [...configured].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!physical.has(path)) {
      issues.push({
        kind: "missing-asset-directory",
        path: `public/assets/${path}`,
        manifestFile: owner.manifestFile,
        refId: owner.refId,
        message: "Manifest 配置对应的资源目录不存在",
      });
    }
  }

  for (const path of [...physical].sort()) {
    if (!configured.has(path)) {
      issues.push({
        kind: "missing-manifest-config",
        path: `public/assets/${path}`,
        message: "资源目录没有对应的 manifest 配置",
      });
    }
  }

  return {
    name: "Manifest 目录映射校验",
    checked: configured.size + physical.size,
    issues,
    durationMs: performance.now() - startedAt,
  };
}
