import { parseArguments, printHelp } from "./arguments";
import { runCheckDate } from "./check-date";

try {
  const result = parseArguments(process.argv.slice(2));
  if (result.type === "help") {
    printHelp();
  } else {
    runCheckDate(result.options);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
