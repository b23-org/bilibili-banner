import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, "../..");

export function removeDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

export function prepareEmptyDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

export function createStagedDir(date: string, prefix = "grab"): string {
  return path.resolve(PROJECT_ROOT, `temp/${prefix}-${date}-${Date.now()}`);
}

export function extractFileName(url: string): string {
  return url.split("/").pop()?.split("?")[0] || "unknown";
}
