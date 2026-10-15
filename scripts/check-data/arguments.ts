export interface CheckDateOptions {
  clean: boolean;
  manifestOnly: boolean;
}

export type ParseArgumentsResult =
  | { type: "options"; options: CheckDateOptions }
  | { type: "help" };

export function printHelp(): void {
  console.log(`
元数据与物理资产一致性校验工具

Usage:
  pnpm check-data [options]

Options:
  --clean          校验数据并自动安全清理空资源目录
  --manifest-only  仅执行元数据 JSON Schema 规范性校验（跳过磁盘扫描）
  -h, --help       显示此帮助信息
`);
}

const USAGE = "用法: pnpm check-data [--clean] [--manifest-only] [-h|--help]";

export function parseArguments(args: string[]): ParseArgumentsResult {
  if (args.includes("-h") || args.includes("--help")) {
    return { type: "help" };
  }

  const allowedArguments = new Set(["--clean", "--manifest-only"]);
  const unknownArguments = args.filter(
    (argument) => !allowedArguments.has(argument),
  );

  if (unknownArguments.length > 0) {
    throw new Error(`未知参数: ${unknownArguments.join(", ")}\n${USAGE}`);
  }

  return {
    type: "options",
    options: {
      clean: args.includes("--clean"),
      manifestOnly: args.includes("--manifest-only"),
    },
  };
}
