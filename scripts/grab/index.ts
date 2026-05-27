import { runGrabSplit2021 } from "./orchestrate";

async function main(): Promise<void> {
  const success = await runGrabSplit2021();
  if (!success) {
    process.exitCode = 1;
  }
}

void main();
