import type { BannerEntry, BannerRef } from "../../../src/types";

export interface ManifestRecord {
  file: string;
  entries: BannerEntry[];
}

export interface ManifestContext {
  manifests: ManifestRecord[];
  refs: Array<{
    manifestFile: string;
    entryDate: string;
    ref: BannerRef;
  }>;
}

export interface ValidationIssue {
  kind: string;
  path: string;
  message: string;
  manifestFile?: string;
  refId?: string;
}

export interface StepResult {
  name: string;
  checked: number;
  issues: ValidationIssue[];
  durationMs: number;
}

export interface CleanResult {
  apply: boolean;
  foundDirectories: string[];
  removedDirectories: string[];
  errors: ValidationIssue[];
  durationMs: number;
}
