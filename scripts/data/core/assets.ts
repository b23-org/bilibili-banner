import { existsSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { BannerConfig } from "../../../src/types";
import { ASSETS_ROOT, PUBLIC_ROOT } from "./paths";

export interface BannerDirectory {
  relativePath: string;
  absolutePath: string;
}

export function collectConfigSources(config: BannerConfig): string[] {
  const sources = new Set<string>();

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (!value || typeof value !== "object") return;

    for (const [key, child] of Object.entries(value)) {
      if (key === "src" && typeof child === "string") {
        sources.add(child.replace(/^\/+/, ""));
      } else {
        visit(child);
      }
    }
  }

  visit(config);
  return [...sources].sort();
}

export function scanBannerDirectories(): BannerDirectory[] {
  if (!existsSync(ASSETS_ROOT)) return [];

  const directories: BannerDirectory[] = [];

  for (const year of readdirSync(ASSETS_ROOT).sort()) {
    if (!/^\d{4}$/.test(year)) continue;
    const yearPath = resolve(ASSETS_ROOT, year);
    if (!statSync(yearPath).isDirectory()) continue;

    for (const month of readdirSync(yearPath).sort()) {
      if (!/^\d{2}$/.test(month)) continue;
      const monthPath = resolve(yearPath, month);
      if (!statSync(monthPath).isDirectory()) continue;

      for (const bannerId of readdirSync(monthPath).sort()) {
        const absolutePath = resolve(monthPath, bannerId);
        if (!statSync(absolutePath).isDirectory()) continue;
        directories.push({
          relativePath: `${year}/${month}/${bannerId}`,
          absolutePath,
        });
      }
    }
  }

  return directories;
}

export function scanBannerFiles(
  directories: BannerDirectory[],
): Map<string, string> {
  const files = new Map<string, string>();

  function walk(directory: string): void {
    for (const name of readdirSync(directory).sort()) {
      const absolutePath = resolve(directory, name);
      const stat = statSync(absolutePath);
      if (stat.isDirectory()) {
        walk(absolutePath);
      } else if (name !== ".DS_Store") {
        const publicPath = relative(PUBLIC_ROOT, absolutePath)
          .split(sep)
          .join("/");
        files.set(publicPath, absolutePath);
      }
    }
  }

  directories.forEach(({ absolutePath }) => {
    walk(absolutePath);
  });
  return files;
}
