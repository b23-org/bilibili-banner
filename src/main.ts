import "./styles/index.css";
import BannerEngine from "./core/BannerEngine";
import BANNER_MANIFEST_JSON from "./data/banner";
import type { BannerRef, DailyBannerGroup } from "./types";
import BannerNavigation from "./ui/BannerNavigation";

const BANNER_MANIFEST = BANNER_MANIFEST_JSON as DailyBannerGroup[];

function getRandomBannerPath(groups: DailyBannerGroup[]): BannerRef {
  const allRefs = groups.flatMap((group) => group.refs);
  if (allRefs.length === 0) {
    throw new Error("No banners found");
  }

  const idx = Math.floor(Math.random() * allRefs.length);
  return allRefs[idx];
}

function applyDynamicFilter(
  groups: DailyBannerGroup[],
  isDynamicOnly: boolean,
): DailyBannerGroup[] {
  if (!isDynamicOnly) return groups;
  return groups
    .map((g) => ({
      ...g,
      refs: g.refs.filter(
        (r) => r.type === "official_2020" || r.type === "official_2021",
      ),
    }))
    .filter((g) => g.refs.length > 0);
}

function main() {
  const urlParams = new URLSearchParams(window.location.search);
  const isDynamicOnly = urlParams.get("dynamic") === "true";
  const requestedPath = urlParams.get("path");

  const manifest = applyDynamicFilter(BANNER_MANIFEST, isDynamicOnly);

  const engine = new BannerEngine();
  const nav = new BannerNavigation(manifest, (ref) => {
    void engine.switch(ref);

    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("path", ref.path);
    if (isDynamicOnly) {
      newUrl.searchParams.set("dynamic", "true");
    }
    window.history.replaceState({}, "", newUrl);
  });

  let initialRef: BannerRef | undefined;
  if (requestedPath) {
    const allRefs = manifest.flatMap((group) => group.refs);
    initialRef = allRefs.find((ref) => ref.path === requestedPath);
  }

  if (!initialRef) {
    initialRef = getRandomBannerPath(manifest);
  }

  nav.switch(initialRef.path);
}

try {
  main();
} catch (e) {
  console.error("Banner metadata loading failed", e);
}
