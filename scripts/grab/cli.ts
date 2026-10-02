import { REGIONS } from "./regions";

export interface CliArgs {
  tids: number[];
  force: boolean;
}

export type ParseResult =
  | { status: "success"; args: CliArgs }
  | { status: "help" }
  | { status: "error"; errorMsg?: string };

function getVisualWidth(str: string): number {
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

function padEndVisual(str: string, targetWidth: number): string {
  const width = getVisualWidth(str);
  const padLen = Math.max(0, targetWidth - width);
  return str + " ".repeat(padLen);
}

export function printHelp(): void {
  const items = [{ id: 0, name: "主站" }, ...REGIONS];
  const columns = 4;
  const colWidth = 22;
  let gridStr = "";

  for (let i = 0; i < items.length; i += columns) {
    const row = items.slice(i, i + columns);
    const rowStr = row
      .map((item) => {
        const text = `${item.id} - ${item.name}`;
        return padEndVisual(text, colWidth);
      })
      .join("");
    gridStr += `  ${rowStr}\n`;
  }

  console.log(`
Usage: pnpm grab [options]

Options:
  -t, --tid <id>      指定要抓取的分区ID，多个分区用逗号分隔（例如 -t 0,1005）。
                      0 代表主站首页。
                      未指定该参数时，默认抓取主站和所有分区。
  --force             跳过Banner去重步骤，无论是否存在都会下载。
                      未指定时默认开启去重。
  -h, --help          显示此帮助文档。

  ------------------------------------------------------------------------

  支持的分区ID列表：
  
${gridStr}`);
}

export function parseCliArgs(argv: string[]): ParseResult {
  const args = argv.slice(2);
  const options: CliArgs = {
    tids: [],
    force: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      return { status: "help" };
    }

    if (arg === "--force") {
      options.force = true;
      i++;
      continue;
    }

    if (arg === "-t" || arg === "--tid") {
      const value = args[i + 1];
      if (!value || value.startsWith("-")) {
        console.error(`❌ 参数错误: ${arg} 需要提供一个值`);
        return { status: "error" };
      }

      const tidStrs = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const tidStr of tidStrs) {
        const tid = Number.parseInt(tidStr, 10);
        if (Number.isNaN(tid)) {
          console.error(`❌ 无效的 tid 参数: "${tidStr}" 不是数字`);
          return { status: "error" };
        }

        const isValid = tid === 0 || REGIONS.some((r) => r.id === tid);
        if (!isValid) {
          console.error(`❌ 无效的 tid 参数: "${tid}"`);
          console.log("请使用 -h 查看支持的分区列表");
          return { status: "error" };
        }

        if (!options.tids.includes(tid)) {
          options.tids.push(tid);
        }
      }
      i += 2;
      continue;
    }

    i++; // 忽略其他未知参数
  }

  return { status: "success", args: options };
}
