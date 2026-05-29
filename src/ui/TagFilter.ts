import type { BannerTag } from "../types";

const TAGS: Array<{ value: BannerTag | null; label: string }> = [
  { value: null, label: "全部" },
  { value: "img", label: "单图" },
  { value: "video", label: "视频" },
  { value: "split-layer", label: "多层视差" },
  { value: "interactive", label: "场景互动" },
];

export default class TagFilter {
  private container: HTMLElement;
  private activeTag: BannerTag | null = null;
  private onTagChange: (tag: BannerTag | null) => void;
  private chips: HTMLButtonElement[] = [];
  private abortController = new AbortController();

  constructor(onTagChange: (tag: BannerTag | null) => void) {
    const el = document.getElementById("tag-filter");
    if (!el) {
      throw new Error("Element with id 'tag-filter' not found");
    }
    this.container = el;
    this.onTagChange = onTagChange;
    this._render();
  }

  private _render(): void {
    for (const tagOption of TAGS) {
      const chip = document.createElement("button");
      chip.className = "tag-chip";
      if (tagOption.value === this.activeTag) {
        chip.classList.add("active");
      }
      chip.textContent = tagOption.label;
      chip.addEventListener(
        "click",
        () => this._handleChipClick(tagOption.value),
        { signal: this.abortController.signal },
      );
      this.container.appendChild(chip);
      this.chips.push(chip);
    }
  }

  private _handleChipClick(tag: BannerTag | null): void {
    if (tag === this.activeTag) {
      if (tag === null) return;
      this.activeTag = null;
    } else {
      this.activeTag = tag;
    }

    TAGS.forEach((tagOption, idx) => {
      const chip = this.chips[idx];
      if (tagOption.value === this.activeTag) {
        chip.classList.add("active");
      } else {
        chip.classList.remove("active");
      }
    });

    this.onTagChange(this.activeTag);
  }

  public destroy(): void {
    this.abortController.abort();
    this.container.innerHTML = "";
    this.chips = [];
  }
}
