export interface CheckDateOptions {
  clean: boolean;
}

const USAGE = "用法: pnpm check-data [--clean]";

export function parseArguments(args: string[]): CheckDateOptions {
  const unknownArguments = args.filter((argument) => argument !== "--clean");

  if (unknownArguments.length > 0) {
    throw new Error(`未知参数: ${unknownArguments.join(", ")}\n${USAGE}`);
  }

  return {
    clean: args.includes("--clean"),
  };
}
