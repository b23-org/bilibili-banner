/**
 * cloudflare/build.ts
 *
 * CI pre-deploy preparation script. Runs before `pnpm build`, before the
 * Cloudflare Pages deploy step.
 *
 * 1. Append `sharp: true` and `workerd: true` to pnpm-workspace.yaml's
 *    `allowBuilds` section so that wrangler-action can run their install
 *    scripts without manual approval.
 * 2. Copy cloudflare/_headers → public/_headers so that Cloudflare Pages
 *    picks up the custom response headers.
 */

import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// 1. Patch pnpm-workspace.yaml
// ---------------------------------------------------------------------------
const workspacePath = resolve(root, "pnpm-workspace.yaml");
let yaml = readFileSync(workspacePath, "utf8");

const entries: Record<string, string> = {
  sharp: "true",
  workerd: "true",
};

for (const [pkg, value] of Object.entries(entries)) {
  const pattern = new RegExp(`^(\\s+)${pkg}:.*$`, "m");
  if (pattern.test(yaml)) {
    // Already present – ensure it is set to the expected value.
    yaml = yaml.replace(pattern, `$1${pkg}: ${value}`);
    console.log(
      `pnpm-workspace.yaml: updated existing entry "${pkg}: ${value}"`,
    );
  } else {
    // Append under the `allowBuilds:` block.
    yaml = yaml.replace(
      /^(allowBuilds:\s*\n)((?:[ \t]+\S[^\n]*\n)*)/m,
      (_, header, body) => `${header}${body}  ${pkg}: ${value}\n`,
    );
    console.log(`pnpm-workspace.yaml: appended "${pkg}: ${value}"`);
  }
}

writeFileSync(workspacePath, yaml, "utf8");

// ---------------------------------------------------------------------------
// 2. Copy _headers to public/
// ---------------------------------------------------------------------------
const src = resolve(__dirname, "_headers");

// Copy to public/ as requested
const destPublic = resolve(root, "public", "_headers");
copyFileSync(src, destPublic);
console.log(`Copied cloudflare/_headers → public/_headers`);
