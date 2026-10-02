import { REGIONS } from "./core/regions";
import type { GrabOptions } from "./support/types";

export type CliParseResult =
  | { readonly status: "success"; readonly options: GrabOptions }
  | { readonly status: "help" }
  | { readonly status: "error"; readonly errorMessage: string };

function computeStringVisualWidth(str: string): number {
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function padEndWithVisualWidth(str: string, targetWidth: number): string {
  const currentWidth = computeStringVisualWidth(str);
  const paddingLength = Math.max(0, targetWidth - currentWidth);
  return str + " ".repeat(paddingLength);
}

/**
 * 打印 CLI 使用帮助与分区对照表
 */
export function printUsageHelp(): void {
  const allRegions = [{ id: 0, name: "主站" }, ...REGIONS];
  const columns = 4;
  const colWidth = 22;
  let gridOutput = "";

  for (let i = 0; i < allRegions.length; i += columns) {
    const row = allRegions.slice(i, i + columns);
    const rowText = row
      .map((item) => {
        const text = `${item.id} - ${item.name}`;
        return padEndWithVisualWidth(text, colWidth);
      })
      .join("");
    gridOutput += `  ${rowText}\n`;
  }

  console.log(`
Usage: pnpm grab [options]

Options:
  -t, --tid <id,...>  指定要抓取的分区ID，多个分区用英文逗号分隔（例如 -t 0,1005）。
                      0 代表主站首页。
                      未指定该参数时，默认抓取主站及所有分区。
  --force             跳过去重检查，强制下载并覆盖 Banner。
  --rescan            强制全量重新扫描 public/assets 目录以重建去重索引缓存。
  -h, --help          显示此帮助信息。

  ------------------------------------------------------------------------

  支持的分区ID列表：
  
${gridOutput}`);
}

/**
 * 解析命令行参数数组
 */
export function parseCommandLineArguments(
  argv: readonly string[],
): CliParseResult {
  const args = argv.slice(2);
  const tids: number[] = [];
  let force = false;
  let rescan = false;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      return { status: "help" };
    }

    if (arg === "--force") {
      force = true;
      i++;
      continue;
    }

    if (arg === "--rescan") {
      rescan = true;
      i++;
      continue;
    }

    if (arg === "-t" || arg === "--tid") {
      const rawValue = args[i + 1];
      if (!rawValue || rawValue.startsWith("-")) {
        return {
          status: "error",
          errorMessage: `参数错误: ${arg} 需要提供一个或多个分区ID（逗号分隔）`,
        };
      }

      const tidSegments = rawValue
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      for (const segment of tidSegments) {
        const tid = Number.parseInt(segment, 10);
        if (Number.isNaN(tid)) {
          return {
            status: "error",
            errorMessage: `无效的分区ID: "${segment}" 不是数字`,
          };
        }

        const isValid = tid === 0 || REGIONS.some((r) => r.id === tid);
        if (!isValid) {
          return {
            status: "error",
            errorMessage: `无效的分区ID: "${tid}"，请使用 -h 查看支持的分区列表`,
          };
        }

        if (!tids.includes(tid)) {
          tids.push(tid);
        }
      }

      i += 2;
      continue;
    }

    i++;
  }

  return {
    status: "success",
    options: {
      tids,
      force,
      rescan,
    },
  };
}
