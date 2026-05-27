import type { ArchiveArgs, ArchiveMode } from "./types";
import { VALID_ARCHIVE_MODES } from "./types";

function exitWithArgError(message: string): never {
  console.error(message);
  process.exit(1);
}

export function parseArgs(): ArchiveArgs {
  const args = process.argv.slice(2);
  let mode: ArchiveMode | null = null;
  let url: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if ((arg === "-m" || arg === "--mode") && args[i + 1]) {
      const val = args[i + 1] as ArchiveMode;
      if (VALID_ARCHIVE_MODES.includes(val)) {
        mode = val;
      } else {
        function getAvailableModesText(): string {
          const lines: string[] = [];
          for (let i = 0; i < VALID_ARCHIVE_MODES.length; i += 5) {
            const chunk = VALID_ARCHIVE_MODES.slice(i, i + 5);
            lines.push(`  ${chunk.join(", ")}`);
          }
          return `${lines.join("\n")}\n`;
        }

        exitWithArgError(
          `错误: 无效的模式 "${val}"。\n可用模式:\n${getAvailableModesText()}`,
        );
      }
      i++;
    } else if ((arg === "-u" || arg === "--url") && args[i + 1]) {
      url = args[i + 1];
      i++;
    }
  }

  if (!mode) {
    exitWithArgError("错误: 必须提供 --mode <mode>");
  }

  if (!url) {
    exitWithArgError("错误: 必须提供 --url <url>");
  }

  return { mode, url };
}
