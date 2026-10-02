import { existsSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { ASSETS_ROOT, toProjectPath } from "../core/paths";
import type { CleanResult, ValidationIssue } from "../core/types";

interface DirectoryState {
  absolutePath: string;
  relativePath: string;
  depth: number;
}

function visibleChildren(directory: string) {
  return readdirSync(directory, { withFileTypes: true }).filter(
    ({ name }) => name !== ".DS_Store",
  );
}

/**
 * 递归扫描目录树，并收集删除所有空子目录后仍为空的目录。
 * 返回值表示当前目录是否可被视为空目录。
 */
function collectEmptyDirectories(
  directory: string,
  depth: number,
  results: DirectoryState[],
): boolean {
  const children = visibleChildren(directory);
  let empty = true;

  for (const child of children) {
    if (!child.isDirectory()) {
      empty = false;
      continue;
    }

    const childPath = resolve(directory, child.name);
    const childIsEmpty = collectEmptyDirectories(childPath, depth + 1, results);

    if (!childIsEmpty) {
      empty = false;
    }
  }

  if (empty) {
    results.push({
      absolutePath: directory,
      relativePath: toProjectPath(directory),
      depth,
    });
  }

  return empty;
}

function findEmptyDirectories(): DirectoryState[] {
  if (!existsSync(ASSETS_ROOT)) return [];

  const results: DirectoryState[] = [];

  for (const child of visibleChildren(ASSETS_ROOT)) {
    if (!child.isDirectory()) continue;

    collectEmptyDirectories(resolve(ASSETS_ROOT, child.name), 1, results);
  }

  return results.sort(
    (left, right) =>
      right.depth - left.depth ||
      left.relativePath.localeCompare(right.relativePath),
  );
}

export function processEmptyDirectories(apply: boolean): CleanResult {
  const startedAt = performance.now();
  const candidates = findEmptyDirectories();
  const removedDirectories: string[] = [];
  const errors: ValidationIssue[] = [];

  if (apply) {
    for (const candidate of candidates) {
      try {
        if (
          existsSync(candidate.absolutePath) &&
          visibleChildren(candidate.absolutePath).length === 0
        ) {
          rmSync(candidate.absolutePath, { recursive: true });
          removedDirectories.push(candidate.relativePath);
        }
      } catch (error) {
        errors.push({
          kind: "clean-directory-failed",
          path: candidate.relativePath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    apply,
    foundDirectories: candidates.map(({ relativePath }) => relativePath),
    removedDirectories,
    errors,
    durationMs: performance.now() - startedAt,
  };
}
