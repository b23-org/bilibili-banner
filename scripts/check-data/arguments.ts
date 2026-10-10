export interface CheckDateOptions {
  clean: boolean;
  manifestOnly: boolean;
}

const USAGE = "用法: pnpm check-data [--clean] [--manifest-only]";

export function parseArguments(args: string[]): CheckDateOptions {
  const allowedArguments = new Set(["--clean", "--manifest-only"]);
  const unknownArguments = args.filter(
    (argument) => !allowedArguments.has(argument),
  );

  if (unknownArguments.length > 0) {
    throw new Error(`未知参数: ${unknownArguments.join(", ")}\n${USAGE}`);
  }

  return {
    clean: args.includes("--clean"),
    manifestOnly: args.includes("--manifest-only"),
  };
}
