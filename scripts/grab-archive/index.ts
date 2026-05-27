import { parseArgs } from "./cli";
import { runSimple } from "./orchestrate";

async function main(): Promise<void> {
  const args = parseArgs();

  try {
    await runSimple(args);
  } catch (error: unknown) {
    console.error(
      "抓取出错:",
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}

void main();
