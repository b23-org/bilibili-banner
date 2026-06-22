import { getTidArg, validateTidArg } from "./cli";
import { runGrabSplit2021 } from "./orchestrate";

async function main(): Promise<void> {
  const targetTid = getTidArg();
  if (targetTid !== undefined && !validateTidArg(targetTid)) {
    process.exitCode = 1;
    return;
  }

  const success = await runGrabSplit2021({ targetTid });
  if (!success) {
    process.exitCode = 1;
  }
}

void main();
