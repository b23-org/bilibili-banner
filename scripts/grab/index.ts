import { parseCommandLineArguments, printUsageHelp } from "./cli";
import { executeGrabPipeline } from "./pipeline";

async function runMain(): Promise<void> {
  const parseResult = parseCommandLineArguments(process.argv);

  switch (parseResult.status) {
    case "help": {
      printUsageHelp();
      return;
    }
    case "error": {
      console.error(`❌ ${parseResult.errorMessage}`);
      process.exitCode = 1;
      return;
    }
    case "success": {
      try {
        await executeGrabPipeline(parseResult.options);
      } catch (error: unknown) {
        console.error(
          "\n❌ 抓取流程异常终止:",
          error instanceof Error ? error.message : String(error),
        );
        process.exitCode = 1;
      }
      return;
    }
  }
}

void runMain();
