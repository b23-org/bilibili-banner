import type { CleanResult, StepResult } from "./core/types";

function duration(milliseconds: number): string {
  return `${milliseconds.toFixed(0)} ms`;
}

export function printStep(result: StepResult): void {
  console.log(`\n## ${result.name}`);
  console.log(`检查 ${result.checked} 项，耗时 ${duration(result.durationMs)}`);

  if (result.issues.length === 0) {
    console.log("✅ 通过");
    return;
  }

  console.error(`❌ 发现 ${result.issues.length} 个问题`);
  for (const issue of result.issues) {
    const owner = issue.refId ? ` [${issue.refId}]` : "";
    console.error(`- ${issue.path}${owner}: ${issue.message}`);
  }
}

export function printClean(result: CleanResult): void {
  console.log(result.apply ? "\n## 清理空资源目录" : "\n## 空目录检查");

  if (result.foundDirectories.length === 0) {
    console.log(`✅ 未发现空目录，耗时 ${duration(result.durationMs)}`);
    return;
  }

  if (!result.apply) {
    console.log(
      `ℹ️ 当前为只读模式，发现 ${result.foundDirectories.length} 个空目录：`,
    );
    result.foundDirectories.forEach((path) => {
      console.log(`- ${path}`);
    });
    console.log("提示：使用 pnpm check-data --clean 主动清理。");
    return;
  }

  result.removedDirectories.forEach((path) => {
    console.log(`- 已删除 ${path}`);
  });

  if (result.errors.length > 0) {
    console.error(`❌ ${result.errors.length} 个空目录清理失败：`);
    result.errors.forEach((error) => {
      console.error(`- ${error.path}: ${error.message}`);
    });
  }

  console.log(
    `✅ 共清理 ${result.removedDirectories.length} 个目录，耗时 ${duration(result.durationMs)}`,
  );
}

export function printSummary(
  results: StepResult[],
  cleanResult?: CleanResult,
): void {
  const validationIssueCount = results.reduce(
    (total, result) => total + result.issues.length,
    0,
  );
  const cleanIssueCount = cleanResult?.errors.length ?? 0;
  const issueCount = validationIssueCount + cleanIssueCount;

  console.log("\n====================");
  console.log("检查结果汇总");
  for (const result of results) {
    console.log(`- ${result.name}: ${result.issues.length} 个问题`);
  }

  if (cleanResult) {
    console.log(`- 空目录清理: ${cleanIssueCount} 个错误`);
  }

  if (issueCount === 0) {
    console.log("✅ check-date 检查通过");
  } else {
    console.error(`❌ check-date 检查失败，共发现 ${issueCount} 个问题`);
  }
}
