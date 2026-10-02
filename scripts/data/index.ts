import { parseArguments } from "./arguments";
import { runCheckDate } from "./check-date";

try {
  runCheckDate(parseArguments(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
