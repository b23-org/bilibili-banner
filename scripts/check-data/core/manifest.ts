import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv, { type ErrorObject } from "ajv";
import * as TJS from "ts-json-schema-generator";
import type { BannerEntry } from "../../../src/types";
import { MANIFEST_ROOT } from "./paths";
import type { ManifestContext, StepResult, ValidationIssue } from "./types";

function describeSchemaError(error: ErrorObject): string {
  const location = error.instancePath || "/";
  return `${location} ${error.message ?? "不符合 Schema"}`;
}

export function validateManifests(): {
  context: ManifestContext | null;
  result: StepResult;
} {
  const startedAt = performance.now();
  const issues: ValidationIssue[] = [];
  const manifests: ManifestContext["manifests"] = [];

  if (!existsSync(MANIFEST_ROOT)) {
    issues.push({
      kind: "manifest-root-missing",
      path: "src/manifest",
      message: "Manifest 目录不存在",
    });
    return {
      context: null,
      result: {
        name: "JSON Schema 校验",
        checked: 0,
        issues,
        durationMs: performance.now() - startedAt,
      },
    };
  }

  let validate: ReturnType<Ajv["compile"]>;
  try {
    const generator = TJS.createGenerator({
      path: resolve("src/types.ts"),
      tsconfig: resolve("tsconfig.json"),
      expose: "all",
      topRef: true,
      jsDoc: "extended",
      sortProps: true,
    });
    const schema = generator.createSchema("BannerEntry");
    validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
  } catch (error) {
    issues.push({
      kind: "schema-generation-failed",
      path: "src/types.ts",
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      context: null,
      result: {
        name: "JSON Schema 校验",
        checked: 0,
        issues,
        durationMs: performance.now() - startedAt,
      },
    };
  }

  const manifestFiles = readdirSync(MANIFEST_ROOT)
    .filter((file) => file.endsWith(".json"))
    .sort();

  let checked = 0;

  for (const file of manifestFiles) {
    const relativePath = `src/manifest/${file}`;
    let value: unknown;

    try {
      value = JSON.parse(readFileSync(resolve(MANIFEST_ROOT, file), "utf8"));
    } catch (error) {
      issues.push({
        kind: "json-parse-error",
        path: relativePath,
        manifestFile: file,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (!Array.isArray(value)) {
      issues.push({
        kind: "manifest-shape-error",
        path: relativePath,
        manifestFile: file,
        message: "Manifest 顶层必须是数组",
      });
      continue;
    }

    const entries: BannerEntry[] = [];
    value.forEach((entry, index) => {
      checked++;
      if (!validate(entry)) {
        for (const error of validate.errors ?? []) {
          issues.push({
            kind: "schema-validation-error",
            path: `${relativePath}[${index}]${error.instancePath}`,
            manifestFile: file,
            message: describeSchemaError(error),
          });
        }
        return;
      }
      entries.push(entry as BannerEntry);
    });

    if (entries.length === value.length) {
      manifests.push({ file, entries });
    }
  }

  const context =
    issues.length === 0
      ? {
          manifests,
          refs: manifests.flatMap(({ file, entries }) =>
            entries.flatMap((entry) =>
              entry.refs.map((ref) => ({
                manifestFile: file,
                entryDate: entry.date,
                ref,
              })),
            ),
          ),
        }
      : null;

  return {
    context,
    result: {
      name: "JSON Schema 校验",
      checked,
      issues,
      durationMs: performance.now() - startedAt,
    },
  };
}
