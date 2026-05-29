import "./styles/index.css";
import BannerEngine from "./core/BannerEngine";
import BANNER_MANIFEST_JSON from "./data/banner";
import type { BannerRef, BannerTag, DailyBannerGroup } from "./types";
import BannerNavigation from "./ui/BannerNavigation";
import HelpModal from "./ui/HelpModal";
import TagFilter from "./ui/TagFilter";

const BANNER_MANIFEST = BANNER_MANIFEST_JSON as DailyBannerGroup[];

function applyTagFilter(
  groups: DailyBannerGroup[],
  tag: BannerTag | null,
): DailyBannerGroup[] {
  if (tag === null) return groups;
  return groups
    .map((g) => ({
      ...g,
      refs: g.refs.filter((r) => r.tags.includes(tag)),
    }))
    .filter((g) => g.refs.length > 0);
}

function buildNavigation(
  manifest: DailyBannerGroup[],
  engine: BannerEngine,
  initialPath?: string,
): BannerNavigation {
  const nav = new BannerNavigation(manifest, (ref) => {
    void engine.switch(ref);

    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("path", ref.path);
    window.history.replaceState({}, "", newUrl);
  });

  const allRefs = manifest.flatMap((g) => g.refs);
  if (allRefs.length === 0) {
    throw new Error("当前筛选条件下没有可用的 Banner");
  }

  let targetRef: BannerRef | undefined;
  if (initialPath) {
    targetRef = allRefs.find((r) => r.path === initialPath);
  }
  if (!targetRef) {
    targetRef = allRefs[Math.floor(Math.random() * allRefs.length)];
  }
  if (targetRef) {
    nav.switch(targetRef.path);
  }

  return nav;
}

function main() {
  const urlParams = new URLSearchParams(window.location.search);
  const requestedPath = urlParams.get("path") ?? undefined;

  const engine = new BannerEngine();
  let nav = buildNavigation(
    applyTagFilter(BANNER_MANIFEST, null),
    engine,
    requestedPath,
  );

  new TagFilter((tag) => {
    const currentPath = nav.getActivePath();

    const filtered = applyTagFilter(BANNER_MANIFEST, tag);
    const allNewRefs = filtered.flatMap((g) => g.refs);
    if (allNewRefs.length === 0) {
      throw new Error("当前筛选条件下没有可用的 Banner");
    }

    const pathInNew = allNewRefs.some((r) => r.path === currentPath);

    nav.destroy();

    try {
      nav = buildNavigation(
        filtered,
        engine,
        pathInNew ? currentPath : undefined,
      );
    } catch (e) {
      console.error("重建导航失败，降级至无筛选状态", e);
      nav = buildNavigation(applyTagFilter(BANNER_MANIFEST, null), engine);
    }
  });

  // 初始化帮助说明弹窗
  new HelpModal();
}

try {
  main();
} catch (e) {
  console.error("Banner metadata loading failed", e);
}
