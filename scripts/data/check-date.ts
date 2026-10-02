import type { CheckDateOptions } from "./arguments";
import { validateManifests } from "./core/manifest";
import { printClean, printStep, printSummary } from "./reporter";
import { checkAssets } from "./steps/check-assets";
import { checkManifestDirectories } from "./steps/check-manifest-directories";
import { processEmptyDirectories } from "./steps/clean-empty-directories";

export function runCheckDate(options: CheckDateOptions): void {
  console.log("# check-date");

  const schema = validateManifests();
  printStep(schema.result);

  if (!schema.context) {
    printSummary([schema.result]);
    process.exitCode = 1;
    return;
  }

  const cleanResult = processEmptyDirectories(options.clean);
  printClean(cleanResult);

  const assets = checkAssets(schema.context);
  printStep(assets);

  const directories = checkManifestDirectories(schema.context);
  printStep(directories);

  const results = [schema.result, assets, directories];
  printSummary(results, cleanResult);
  process.exitCode =
    results.some((result) => result.issues.length > 0) ||
    cleanResult.errors.length > 0
      ? 1
      : 0;
}
