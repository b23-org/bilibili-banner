import type { BannerEntry } from "../types";

const modules = import.meta.glob<BannerEntry[]>("./*.json", {
  eager: true,
  import: "default",
});

const BANNER_MANIFEST: BannerEntry[] = Object.values(modules)
  .flat()
  .sort((a, b) => a.date.localeCompare(b.date));

export default BANNER_MANIFEST;
