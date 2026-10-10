import { resolve } from "node:path";

export const MANIFEST_ROOT = resolve("src/manifest");
export const PUBLIC_ROOT = resolve("public");
export const ASSETS_ROOT = resolve(PUBLIC_ROOT, "assets");

export function toProjectPath(path: string): string {
  return path.replace(`${resolve(".")}/`, "");
}
