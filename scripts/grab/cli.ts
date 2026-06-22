import { REGIONS } from "./regions";

export function getTidArg(): string | undefined {
  const args = process.argv;
  const index = args.findIndex((arg) => arg === "--tid" || arg === "-t");
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

export function validateTidArg(targetTid: string): boolean {
  const isValid =
    targetTid === "0" || REGIONS.some((r) => r.id.toString() === targetTid);
  if (!isValid) {
    console.error(`❌ 无效的 tid 参数: "${targetTid}"`);
    console.log("支持的分区参数列表如下:");
    console.log("  0 - 主站 (首页)");
    for (const r of REGIONS) {
      console.log(`  ${r.id} - ${r.name}`);
    }
    return false;
  }
  return true;
}
