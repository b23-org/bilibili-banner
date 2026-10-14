import { executeApplyPhase } from "./apply";
import { executeScanPhase } from "./scan";
import type { CleanLogoOptions } from "./types";

function printHelp(): void {
  console.log(`
Logo 变种视觉审查与清洗治理工具

Usage:
  pnpm clean-logo [options]

Commands:
  (默认)              扫描非标杆 Logo 并生成审查报告 (.cache/logo-review.md)
  --scan              显式指定执行扫描阶段
  --apply             读取 .cache/logo-review.md 中的勾选决策并执行批量治理

Options:
  -y, --year <YYYY>   指定仅扫描/处理特定年份（未指定时处理全量年份）
  -h, --help          显示此帮助信息

Workflow:
  1. 运行 pnpm clean-logo [-y YYYY] 生成审查报告；
  2. 在本地编辑器中打开 .cache/logo-review.md 查看标杆与变种对比大图，核对或修改状态数字 (0/1/2)；
  3. 运行 pnpm clean-logo --apply 批量改写 Manifest、收录变种白名单并将切片安全归档至 .cache/variants-logo/。
`);
}

function parseCliArgs(argv: string[]): CleanLogoOptions | "help" {
  const args = argv.slice(2);
  let action: "scan" | "apply" = "scan";
  let targetYear: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (arg === "-h" || arg === "--help") {
      return "help";
    }

    if (arg === "--apply") {
      action = "apply";
      i++;
      continue;
    }

    if (arg === "--scan") {
      action = "scan";
      i++;
      continue;
    }

    if (arg === "-y" || arg === "--year") {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith("-")) {
        targetYear = nextArg;
        i += 2;
        continue;
      }
    } else if (arg.startsWith("-y=")) {
      targetYear = arg.slice(3);
      i++;
      continue;
    } else if (arg.startsWith("--year=")) {
      targetYear = arg.slice(7);
      i++;
      continue;
    }

    i++;
  }

  return { action, targetYear };
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv);

  if (parsed === "help") {
    printHelp();
    return;
  }

  if (parsed.action === "apply") {
    await executeApplyPhase();
  } else {
    await executeScanPhase(parsed);
  }
}

main().catch((err: unknown) => {
  console.error("执行出错:", err);
  process.exit(1);
});
