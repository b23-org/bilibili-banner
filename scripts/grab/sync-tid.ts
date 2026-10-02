import fs from "node:fs";
import path from "node:path";
import { REGIONS, type RegionInfo } from "./core/regions";
import { PROJECT_ROOT } from "./support/config";

const KV_API_URL =
  "https://api.bilibili.com/x/kv-frontend/namespace/data?appKey=333.1339&nscode=10&unlimit=true";
const FETCH_TIMEOUT_MS = 5000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

interface DiffResult {
  added: RegionInfo[];
  removed: RegionInfo[];
  updated: { oldInfo: RegionInfo; newInfo: RegionInfo }[];
  unchanged: RegionInfo[];
}

interface ChannelItem {
  channelId?: number;
  tid?: number;
  name?: string;
  route?: string;
  [key: string]: unknown;
}

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

/**
 * 从 B站官方 KV 接口拉取最新分区数据
 */
async function fetchRegionsFromApi(): Promise<RegionInfo[]> {
  const response = await fetch(KV_API_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
    },
  });

  if (!response.ok) {
    throw new Error(
      `请求 KV 接口失败: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const resJson = (await response.json()) as {
    code: number;
    message: string;
    data?: {
      data?: Record<string, string>;
    };
  };

  if (resJson.code !== 0 || !resJson.data?.data) {
    throw new Error(
      `KV 接口返回异常: code=${resJson.code}, message=${resJson.message}`,
    );
  }

  const rawMap = resJson.data.data;
  const channelMap = new Map<number, RegionInfo>();

  for (const [key, rawVal] of Object.entries(rawMap)) {
    if (!key.startsWith("channel_list.")) continue;
    if (
      key === "channel_list.sort" ||
      key === "channel_list.popular_page_sort" ||
      key === "channel_list.all"
    ) {
      continue;
    }

    try {
      const item: ChannelItem =
        typeof rawVal === "string" ? JSON.parse(rawVal) : rawVal;
      if (
        typeof item.tid === "number" &&
        item.tid > 0 &&
        typeof item.name === "string" &&
        item.name.trim() !== ""
      ) {
        channelMap.set(item.tid, {
          id: item.tid,
          name: item.name.trim(),
        });
      }
    } catch {
      // 忽略单个无法解析的频道数据
    }
  }

  const regions = Array.from(channelMap.values()).sort((a, b) => a.id - b.id);

  if (regions.length < 10) {
    throw new Error(
      `解析出的分区数量异常 (${regions.length} < 10)，为防止误覆盖终止操作。`,
    );
  }

  return regions;
}

/**
 * 比对本地旧配置与线上最新配置
 */
function computeDiff(
  currentList: RegionInfo[],
  latestList: RegionInfo[],
): DiffResult {
  const currentMap = new Map(currentList.map((r) => [r.id, r]));
  const latestMap = new Map(latestList.map((r) => [r.id, r]));

  const added: RegionInfo[] = [];
  const removed: RegionInfo[] = [];
  const updated: { oldInfo: RegionInfo; newInfo: RegionInfo }[] = [];
  const unchanged: RegionInfo[] = [];

  for (const latest of latestList) {
    const current = currentMap.get(latest.id);
    if (!current) {
      added.push(latest);
    } else if (current.name !== latest.name) {
      updated.push({ oldInfo: current, newInfo: latest });
    } else {
      unchanged.push(latest);
    }
  }

  for (const current of currentList) {
    if (!latestMap.has(current.id)) {
      removed.push(current);
    }
  }

  return { added, removed, updated, unchanged };
}

/**
 * 打印对比摘要
 */
function printDiffReport(diff: DiffResult): void {
  const hasChanges =
    diff.added.length > 0 || diff.removed.length > 0 || diff.updated.length > 0;

  console.log("\n====== 分区差异比对结果 ======");
  if (!hasChanges) {
    console.log("\x1b[32m✔ 本地分区配置已与线上完全一致，无须更新。\x1b[0m\n");
    return;
  }

  if (diff.added.length > 0) {
    console.log(`\x1b[32m+ 新增分区 (${diff.added.length}):\x1b[0m`);
    for (const item of diff.added) {
      console.log(`    + [${item.id}] ${item.name}`);
    }
  }

  if (diff.updated.length > 0) {
    console.log(`\x1b[33m~ 分区名称变更 (${diff.updated.length}):\x1b[0m`);
    for (const item of diff.updated) {
      console.log(
        `    ~ [${item.newInfo.id}] "${item.oldInfo.name}" -> "${item.newInfo.name}"`,
      );
    }
  }

  if (diff.removed.length > 0) {
    console.log(`\x1b[31m- 移除分区 (${diff.removed.length}):\x1b[0m`);
    for (const item of diff.removed) {
      console.log(`    - [${item.id}] ${item.name}`);
    }
  }

  console.log("==============================\n");
}

/**
 * 生成 core/regions.ts 文件代码
 */
function generateRegionsCode(regions: RegionInfo[]): string {
  const itemsStr = regions
    .map((r) => `  { name: ${JSON.stringify(r.name)}, id: ${r.id} },`)
    .join("\n");

  return `export interface RegionInfo {
  name: string;
  id: number;
}

export const REGIONS: RegionInfo[] = [
${itemsStr}
];

/**
 * 根据分区 tid 检索分区元数据
 */
export function findRegionById(tid: number): RegionInfo | undefined {
  return REGIONS.find((region) => region.id === tid);
}

/**
 * 获取指定 tid 的可读展示名称（0 为首页主站）
 */
export function getRegionDisplayName(tid: number): string {
  if (tid === 0) return "主站";
  const found = findRegionById(tid);
  return found ? found.name : \`分区#\${tid}\`;
}
`;
}

/**
 * 生成 README.md 的 Markdown 4列表格
 */
function generateMarkdownTable(regions: RegionInfo[]): string {
  const allItems = [{ id: 0, name: "主站" }, ...regions];
  const columns = 4;
  const colIdWidth = 6;
  const colNameWidth = 8;

  const header = `| id     | 分区     | id     | 分区     | id     | 分区     | id     | 分区     |\n| ------ | -------- | ------ | -------- | ------ | -------- | ------ | -------- |`;

  const rows: string[] = [];
  for (let i = 0; i < allItems.length; i += columns) {
    const chunk = allItems.slice(i, i + columns);
    const rowCols = chunk.map((item) => {
      const idFormatted = `\`${item.id}\``;
      const idCol = padEndVisual(idFormatted, colIdWidth);
      const nameCol = padEndVisual(item.name, colNameWidth);
      return `${idCol} | ${nameCol}`;
    });

    // 若末行不足 4 列，补齐空单元格
    while (rowCols.length < columns) {
      const idCol = padEndVisual("", colIdWidth);
      const nameCol = padEndVisual("", colNameWidth);
      rowCols.push(`${idCol} | ${nameCol}`);
    }

    rows.push(`| ${rowCols.join(" | ")} |`);
  }

  return `${header}\n${rows.join("\n")}`;
}

/**
 * 更新 README.md 中的表格
 */
function updateReadme(regions: RegionInfo[]): boolean {
  const readmePath = path.resolve(PROJECT_ROOT, "README.md");
  if (!fs.existsSync(readmePath)) {
    console.warn(`[WARN] 未找到 README.md 文件: ${readmePath}`);
    return false;
  }

  const content = fs.readFileSync(readmePath, "utf8");
  const targetHeader = "当前支持的分区 id：\n\n";
  const startIndex = content.indexOf(targetHeader);

  if (startIndex === -1) {
    console.warn("[WARN] 未在 README.md 中找到表格标记定位点");
    return false;
  }

  const tableStart = startIndex + targetHeader.length;
  // 查找表格结束位置（直到下一个非表格行或引用块）
  const remaining = content.slice(tableStart);
  const tableEndMatch = remaining.match(/\n\n(?=>|\S|$)/);
  const tableEnd = tableEndMatch ? tableStart + tableEndMatch.index! : -1;

  if (tableEnd === -1) {
    console.warn("[WARN] 无法确定 README.md 中表格的结束边界");
    return false;
  }

  const newTable = generateMarkdownTable(regions);
  const updatedContent = `${content.slice(0, tableStart)}${newTable}${content.slice(tableEnd)}`;

  fs.writeFileSync(readmePath, updatedContent, "utf8");
  return true;
}

/**
 * 写入更新到 core/regions.ts
 */
function updateRegionsFile(regions: RegionInfo[]): void {
  const regionsPath = path.resolve(
    PROJECT_ROOT,
    "scripts/grab/core/regions.ts",
  );
  const code = generateRegionsCode(regions);
  fs.writeFileSync(regionsPath, code, "utf8");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run") || args.includes("--check");
  const isHelp = args.includes("-h") || args.includes("--help");

  if (isHelp) {
    console.log(`
Usage: pnpm grab-sync-tid [options]

从 B站官方接口拉取最新分区与 tid 映射，并自动更新 scripts/grab/core/regions.ts 与 README.md。

Options:
  --dry-run, --check  仅比对并输出差异，不执行写盘操作（若有差异退出码为 1）
  -h, --help          显示此帮助信息
`);
    return;
  }

  console.log("正在从 B站配置中心接口拉取最新分区列表...");
  const latestRegions = await fetchRegionsFromApi();
  console.log(`拉取成功，线上共包含 ${latestRegions.length} 个主分区。`);

  const diff = computeDiff(REGIONS, latestRegions);
  printDiffReport(diff);

  const hasChanges =
    diff.added.length > 0 || diff.removed.length > 0 || diff.updated.length > 0;

  if (isDryRun) {
    if (hasChanges) {
      console.log("\x1b[33m[Dry-run] 检测到分区数据变动，未写入文件。\x1b[0m");
      process.exitCode = 1;
    } else {
      console.log("\x1b[32m[Dry-run] 分区数据已是最新。\x1b[0m");
    }
    return;
  }

  if (!hasChanges) {
    console.log("本地数据已是最新，无需更新。");
    return;
  }

  console.log("正在更新 scripts/grab/core/regions.ts ...");
  updateRegionsFile(latestRegions);

  console.log("正在更新 README.md 分区对照表...");
  const readmeUpdated = updateReadme(latestRegions);

  console.log(
    `\x1b[32m✔ 自动更新完成！已同步 ${latestRegions.length} 个分区。${readmeUpdated ? " (README.md 已同步)" : ""}\x1b[0m`,
  );
}

void main().catch((err: unknown) => {
  console.error(
    `\x1b[31m❌ 同步分区失败:\x1b[0m`,
    err instanceof Error ? err.message : String(err),
  );
  process.exitCode = 1;
});
