import fs from "node:fs";
import path from "node:path";
import { extractFileNameFromUrl } from "../grab-shared/url";
import type { BannerData } from "./parse";

// ============ 模块私有工具 ============

function getBannerUrls(banner: BannerData): string[] {
  const urls: string[] = [];
  if (banner.preview) urls.push(banner.preview);
  if (banner.logo) urls.push(banner.logo);
  for (const layer of banner.layers || []) {
    for (const res of layer.resources || []) {
      if (res.src) urls.push(res.src);
    }
  }
  return urls;
}

function isBannerDuplicate(
  banner: BannerData,
  existingFiles: Set<string>,
): boolean {
  const urls = getBannerUrls(banner);
  if (urls.length === 0) return false;
  return urls.every((url) => existingFiles.has(extractFileNameFromUrl(url)));
}

function addBannerFilesToSet(
  banner: BannerData,
  existingFiles: Set<string>,
): void {
  const urls = getBannerUrls(banner);
  for (const url of urls) {
    existingFiles.add(extractFileNameFromUrl(url));
  }
}

// ============ 去重策略接口 ============

export interface GrabStrategy {
  shouldProcess(banner: BannerData): boolean;
  onSuccess(banner: BannerData): void;
}

// ============ 去重策略实现 ============

export function collectExistingFileNames(assetsDir: string): Set<string> {
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

export class DeduplicateStrategy implements GrabStrategy {
  constructor(private existingFiles: Set<string>) {}

  shouldProcess(banner: BannerData): boolean {
    return !isBannerDuplicate(banner, this.existingFiles);
  }

  onSuccess(banner: BannerData): void {
    addBannerFilesToSet(banner, this.existingFiles);
  }
}

export class ForceGrabStrategy implements GrabStrategy {
  shouldProcess(): boolean {
    return true;
  }

  onSuccess(): void {}
}
