import { run as runCheckAssets } from "./commands/check-assets";
import { run as runCheckManifest } from "./commands/check-manifest";
import { run as runClean } from "./commands/clean";
import { run as runHelp } from "./commands/help";
import { run as runValidate } from "./commands/validate";

const command = process.argv[2];

switch (command) {
  case "validate":
    await runValidate();
    break;
  case "check-assets":
    await runCheckAssets();
    break;
  case "check-manifest":
    await runCheckManifest();
    break;
  case "clean":
    await runClean();
    break;
  case "help":
  case "-h":
  case "--help":
  case undefined:
    runHelp();
    break;
  default:
    console.error(`❌ 未知命令: ${command}`);
    runHelp();
    process.exit(1);
}
