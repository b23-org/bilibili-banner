import type { DailyBannerGroup } from "../../types";

const modules = import.meta.glob<DailyBannerGroup[]>("./*.json", {
  eager: true,
  import: "default",
});

const BANNER_MANIFEST: DailyBannerGroup[] = Object.values(modules)
  .flat()
  .sort((a, b) => a.date.localeCompare(b.date));

export default BANNER_MANIFEST;
