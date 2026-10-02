import { parseCliArgs, printHelp } from "./cli";
import { runGrab } from "./run";

async function main(): Promise<void> {
  const result = parseCliArgs(process.argv);

  switch (result.status) {
    case "help":
      printHelp();
      return;
    case "error":
      process.exitCode = 1;
      return;
    case "success": {
      const success = await runGrab(result.args);
      if (!success) {
        process.exitCode = 1;
      }
      return;
    }
  }
}

void main();
