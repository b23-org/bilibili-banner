import fs from "node:fs";
import path from "node:path";
import type { CliArgs } from "./cli";
import { downloadAssets } from "./download";
import { fetchBanners } from "./fetch";
import { extractFileNameFromUrl, PROJECT_ROOT, removeDir } from "./helpers";
import {
  handleBannerSnapshot,
  publishStagedDir,
  updateManifest,
} from "./publish";
import type { BannerSnapshot, GrabBannerEntry } from "./types";

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function handleExtensions(snapshots: BannerSnapshot[]): void {
  const extensionsDir = path.resolve(PROJECT_ROOT, "temp/extensions");
  let hasExtensions = false;
  const allKeys = new Set<string>();

  for (const snapshot of snapshots) {
    if (!snapshot.extensions || Object.keys(snapshot.extensions).length === 0)
      continue;

    if (!hasExtensions) {
      fs.mkdirSync(extensionsDir, { recursive: true });
      hasExtensions = true;
    }

    const keys = Object.keys(snapshot.extensions);
    for (const key of keys) {
      allKeys.add(key);
      const filePath = path.join(extensionsDir, `${key}.json`);
      fs.writeFileSync(
        filePath,
        JSON.stringify(snapshot.extensions[key], null, 2),
        "utf8",
      );
    }
  }

  if (hasExtensions) {
    console.log(
      `\x07\x1b[33m\n================================\n⚠️ 检测到扩展字段 extensions: [${Array.from(allKeys).join(", ")}]\n已保存到 temp/extensions/ 目录\n请手动检查是否需要特殊代码适配\n================================\n\x1b[0m`,
    );
  }
}

function collectExistingFileNames(assetsDir: string): Set<string> {
  const fileNames = new Set<string>();
  if (!fs.existsSync(assetsDir)) return fileNames;

  function traverse(dir: string): void {
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of list) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile()) {
        fileNames.add(entry.name);
      }
    }
  }

  traverse(assetsDir);
  return fileNames;
}

function isDuplicateEntry(
  entry: GrabBannerEntry,
  existingFiles: Set<string>,
): boolean {
  if (entry.urls.length === 0) return false;
  return entry.urls.every((url) =>
    existingFiles.has(extractFileNameFromUrl(url)),
  );
}

function deduplicateEntries(entries: GrabBannerEntry[]): GrabBannerEntry[] {
  const assetsDir = path.resolve(PROJECT_ROOT, "public/assets");
  const existingFiles = collectExistingFileNames(assetsDir);
  return entries.filter((entry) => !isDuplicateEntry(entry, existingFiles));
}

export async function runGrab(options: CliArgs): Promise<boolean> {
  const { tids, force } = options;
  const date = today();
  const d = new Date();
  const hour = String(d.getHours()).padStart(2, "0");

  const snapshots = await fetchBanners(tids);
  if (snapshots.length === 0) {
    console.log("没有收集到任何 Banner 数据。");
    return true;
  }

  // 早期 banner 偶尔存在扩展字段，目前几乎不再出现，保留逻辑以防万一
  handleExtensions(snapshots);

  // 处理 snapshot，生成 entry，包含后续步骤需要的所有信息
  let entries = snapshots.flatMap((s) => handleBannerSnapshot(s, date, hour));
  console.log(`共收集到 ${entries.length} 个 banner 数据`);
  // 基于本地历史数据去重
  if (!force) {
    entries = deduplicateEntries(entries);
  }

  if (entries.length === 0) {
    console.log("没有需要下载的新 Banner 资源。");
    return true;
  }

  // 统一并发下载
  const entryStagedDirMap = await downloadAssets(entries);

  console.log("正在发布资源...");

  for (const entry of entries) {
    const stagedDir = entryStagedDirMap.get(entry);
    if (!stagedDir) continue;

    try {
      // 发布目录
      publishStagedDir(stagedDir, entry.targetDirName);

      // 更新 Manifest
      updateManifest(date, [entry.ref]);
    } catch (err: unknown) {
      console.error(
        `发布 [${entry.ref.name}] 失败:`,
        err instanceof Error ? err.message : String(err),
      );
      removeDir(stagedDir);
    }
  }

  console.log("所有抓取流程执行完成！");
  return true;
}
