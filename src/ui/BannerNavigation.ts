import type { BannerRef, DailyBannerGroup } from "../types";
import TimelineSelector from "./TimelineSelector";
import YearSelector from "./YearSelector";

interface NavigationIndexes {
  pathToBannerRef: Map<string, BannerRef>;
  years: string[];
  pathToYear: Map<string, string>;
  yearToGroups: Map<string, DailyBannerGroup[]>;
}

function buildIndexes(groups: DailyBannerGroup[]): NavigationIndexes {
  const pathToBannerRef = new Map<string, BannerRef>();
  const years: string[] = [];
  const pathToYear = new Map<string, string>();
  const yearToGroups = new Map<string, DailyBannerGroup[]>();

  for (const group of groups) {
    if (group.refs.length === 0) {
      continue;
    }

    const year = group.date.split("-")[0];
    if (!years.includes(year)) {
      years.push(year);
      yearToGroups.set(year, []);
    }

    yearToGroups.get(year)?.push(group);

    for (const ref of group.refs) {
      pathToBannerRef.set(ref.path, ref);
      pathToYear.set(ref.path, year);
    }
  }

  return {
    pathToBannerRef,
    years,
    pathToYear,
    yearToGroups,
  };
}

export default class BannerNavigation {
  private readonly yearSelector: YearSelector;
  private readonly timelineSelector: TimelineSelector;
  private readonly pathToBannerRef: Map<string, BannerRef>;
  private readonly pathToYear: Map<string, string>;
  private readonly yearToGroups: Map<string, DailyBannerGroup[]>;
  private readonly yearToLastVisitedPath: Map<string, string> = new Map();
  private activeBannerPath = "";
  private readonly onSwitch: (ref: BannerRef) => void;

  constructor(groups: DailyBannerGroup[], onSwitch: (ref: BannerRef) => void) {
    const indexes = buildIndexes(groups);
    this.onSwitch = onSwitch;
    this.pathToBannerRef = indexes.pathToBannerRef;
    this.pathToYear = indexes.pathToYear;
    this.yearToGroups = indexes.yearToGroups;

    this.yearSelector = new YearSelector(indexes.years, (year) => {
      const targetPath = this._resolvePathForYear(year);
      if (targetPath) {
        this.switch(targetPath);
      }
    });

    this.timelineSelector = new TimelineSelector((variant) => {
      this.switch(variant.path);
    });
  }

  public switch(path: string): void {
    if (!this.pathToBannerRef.has(path)) {
      console.warn(`Banner path not found: ${path}`);
      return;
    }

    if (this.activeBannerPath === path) {
      return;
    }

    const targetYear = this.pathToYear.get(path);
    const targetRef = this.pathToBannerRef.get(path);
    const targetGroups = targetYear
      ? this.yearToGroups.get(targetYear) || []
      : [];

    if (!targetYear || !targetRef || targetGroups.length === 0) {
      return;
    }

    this.yearSelector.setActiveYear(targetYear);
    this.timelineSelector.update(targetGroups, path);
    this.activeBannerPath = path;
    this.yearToLastVisitedPath.set(targetYear, path);

    this.onSwitch(targetRef);
  }

  public getActivePath(): string {
    return this.activeBannerPath;
  }

  public destroy(): void {
    this.timelineSelector.destroy();
    this.yearSelector.destroy();
  }

  private _resolvePathForYear(year: string): string | undefined {
    const lastVisited = this.yearToLastVisitedPath.get(year);
    if (lastVisited) {
      return lastVisited;
    }

    const groupsForYear = this.yearToGroups.get(year) || [];
    const allRefsForYear = groupsForYear.flatMap((group) => group.refs);
    if (allRefsForYear.length === 0) {
      return undefined;
    }

    const randomIndex = Math.floor(Math.random() * allRefsForYear.length);
    return allRefsForYear[randomIndex].path;
  }
}
