import type { BannerRef, DailyBannerGroup } from "../types";

export default class TimelineSelector {
  private container: HTMLElement;
  private onVariantSelect: (variant: BannerRef) => void;
  private _itemDataMap: WeakMap<HTMLElement, DailyBannerGroup> = new WeakMap();
  private _activeDropdownTimer?: number;
  private _isPaging = false;
  private _pagingTimer?: number;
  private currentData: DailyBannerGroup[] = [];

  private _boundHandleClick: (e: MouseEvent) => void;
  private _boundHandleMouseOver: (e: MouseEvent) => void;
  private _boundHandleMouseOut: (e: MouseEvent) => void;
  private _boundHandleWheel: (e: WheelEvent) => void;

  constructor(onVariantSelect: (variant: BannerRef) => void) {
    const el = document.getElementById("timeline-selector");
    if (!el) {
      throw new Error("Element with id 'timeline-selector' not found");
    }
    this.container = el;
    this.onVariantSelect = onVariantSelect;

    this._boundHandleClick = this._handleClick.bind(this);
    this._boundHandleMouseOver = this._handleMouseOver.bind(this);
    this._boundHandleMouseOut = this._handleMouseOut.bind(this);
    this._boundHandleWheel = this._handleWheel.bind(this);

    this._setupScrollWheel();
    this._setupEventDelegation();
  }

  public destroy(): void {
    this._cleanupDropdowns();
    this.container.removeEventListener("click", this._boundHandleClick);
    this.container.removeEventListener("mouseover", this._boundHandleMouseOver);
    this.container.removeEventListener("mouseout", this._boundHandleMouseOut);
    this.container.removeEventListener("wheel", this._boundHandleWheel);
    this.container.innerHTML = "";
    this._itemDataMap = new WeakMap();
    this.currentData = [];
  }

  public update(filteredData: DailyBannerGroup[], activePath: string): void {
    const isDataChanged = this.currentData !== filteredData;
    this.currentData = filteredData;

    if (isDataChanged) {
      this._cleanupDropdowns();
      this.container.innerHTML = "";

      if (filteredData.length === 0) {
        return;
      }

      filteredData.forEach((item) => {
        const itemEl = this._createTimelineItem(item, activePath);
        this.container.appendChild(itemEl);

        if (item.refs.some((banner) => banner.path === activePath)) {
          setTimeout(() => {
            itemEl.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
              inline: "center",
            });
          }, 100);
        }
      });
    } else {
      this._syncRenderedState(activePath);
    }
  }

  private _cleanupDropdowns(): void {
    window.clearTimeout(this._activeDropdownTimer);
    this._itemDataMap = new WeakMap();
  }

  private _clearTimerBound = () =>
    window.clearTimeout(this._activeDropdownTimer);
  private _hideDropdownScheduledBound = () => this._hideDropdownScheduled();

  private _createTimelineItem(
    item: DailyBannerGroup,
    activePath: string,
  ): HTMLDivElement {
    const activeVariantIndex = Math.max(
      item.refs.findIndex((banner) => banner.path === activePath),
      0,
    );
    const activeBanner = item.refs[activeVariantIndex];
    const isActive = activeBanner.path === activePath;

    const itemEl = document.createElement("div");
    itemEl.className = `timeline-item ${isActive ? "active" : ""}`;

    const content = document.createElement("div");
    content.className = "item-content";

    const dateStr = document.createElement("span");
    dateStr.className = "item-date";
    dateStr.innerText = item.date;

    const name = document.createElement("span");
    name.className = "item-name";

    const nameText = document.createElement("span");
    nameText.innerText = activeBanner.name;
    name.appendChild(nameText);

    content.appendChild(dateStr);
    content.appendChild(name);
    itemEl.appendChild(content);

    if (item.refs.length > 1) {
      itemEl.classList.add("has-popover");

      const arrow = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      arrow.setAttribute("width", "12");
      arrow.setAttribute("height", "12");
      arrow.setAttribute("viewBox", "0 0 9 9");
      arrow.setAttribute("fill", "none");
      arrow.classList.add("variant-arrow");
      arrow.innerHTML = `<path fill-rule="evenodd" clip-rule="evenodd" d="M7.50588 3.40623C7.40825 3.3086 7.24996 3.3086 7.15232 3.40623L4.41244 6.14612L1.67255 3.40623C1.57491 3.3086 1.41662 3.3086 1.31899 3.40623C1.22136 3.50386 1.22136 3.66215 1.31899 3.75978L4.11781 6.5586C4.28053 6.72132 4.54434 6.72132 4.70706 6.5586L7.50588 3.75978C7.60351 3.66215 7.60351 3.50386 7.50588 3.40623Z" fill="currentColor"/>`;
      name.appendChild(arrow);

      const dropdown = document.createElement("div");
      dropdown.className = "popover-content";

      item.refs.forEach((variant: BannerRef) => {
        const btn = document.createElement("div");
        btn.className = `popover-item ${variant.path === activePath ? "active" : ""}`;
        btn.innerText = variant.name;
        btn.dataset.path = variant.path;

        btn.addEventListener("click", (e: MouseEvent) => {
          e.stopPropagation();
          this.onVariantSelect(variant);
        });

        dropdown.appendChild(btn);
      });

      dropdown.setAttribute("popover", "manual");
      itemEl.appendChild(dropdown);

      dropdown.addEventListener("mouseenter", this._clearTimerBound);
      dropdown.addEventListener("mouseleave", this._hideDropdownScheduledBound);
    }

    this._itemDataMap.set(itemEl, item);
    return itemEl;
  }

  private _setupEventDelegation(): void {
    this.container.addEventListener("click", this._boundHandleClick);
    this.container.addEventListener("mouseover", this._boundHandleMouseOver);
    this.container.addEventListener("mouseout", this._boundHandleMouseOut);
  }

  private _handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const itemEl = target.closest(".timeline-item") as HTMLElement;
    if (!itemEl) return;

    if (itemEl.classList.contains("active")) return;

    const itemData = this._itemDataMap.get(itemEl);
    if (!itemData) return;

    const firstVariant = itemData.refs[0];
    this.onVariantSelect(firstVariant);
  }

  private _handleMouseOver(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const itemEl = target.closest(".timeline-item.has-popover") as HTMLElement;

    if (itemEl && !itemEl.contains(e.relatedTarget as Node)) {
      this._showDropdownFor(itemEl);
    }
  }

  private _handleMouseOut(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const itemEl = target.closest(".timeline-item.has-popover") as HTMLElement;

    if (itemEl && !itemEl.contains(e.relatedTarget as Node)) {
      this._hideDropdownScheduled();
    }
  }

  private _showDropdownFor(itemEl: HTMLElement): void {
    window.clearTimeout(this._activeDropdownTimer);

    this.container.querySelectorAll(".popover-content").forEach((el) => {
      el.classList.remove("visible");
      // Popover API hide
      try {
        (el as HTMLElement & { hidePopover: () => void }).hidePopover();
      } catch (_e) {}
    });

    const dropdown = itemEl.querySelector(".popover-content") as HTMLDivElement;
    if (!dropdown) return;

    const rect = itemEl.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.left = `${rect.left + rect.width / 2}px`;

    // Popover API show
    try {
      (dropdown as HTMLDivElement & { showPopover: () => void }).showPopover();
    } catch (_e) {}

    // Force reflow for transition
    void dropdown.offsetWidth;
    dropdown.classList.add("visible");
  }

  private _hideDropdownScheduled(): void {
    window.clearTimeout(this._activeDropdownTimer);
    this._activeDropdownTimer = window.setTimeout(() => {
      this.container.querySelectorAll(".popover-content").forEach((el) => {
        el.classList.remove("visible");

        // Wait for transition to complete before hiding popover
        setTimeout(() => {
          try {
            if (!el.classList.contains("visible")) {
              (el as HTMLElement & { hidePopover: () => void }).hidePopover();
            }
          } catch (_e) {}
        }, 200);
      });
    }, 150);
  }

  private _setupScrollWheel(): void {
    this.container.addEventListener("wheel", this._boundHandleWheel);
  }

  private _handleWheel(e: WheelEvent): void {
    const box = this.container;
    if (!box || e.deltaY === 0) return;

    // Trackpads usually have deltaX, let native horizontal scrolling work
    if (e.deltaX !== 0) {
      return;
    }

    e.preventDefault();

    // Heuristic: Trackpad vertical scrolls have small deltaY and pixel mode
    if (e.deltaMode === 0 && Math.abs(e.deltaY) < 40) {
      box.scrollLeft += e.deltaY;
      return;
    }

    if (this._isPaging) return;

    const items = Array.from(
      box.querySelectorAll(".timeline-item"),
    ) as HTMLElement[];
    const boxRect = box.getBoundingClientRect();

    const visibleItems = items.filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.left >= boxRect.left && rect.right <= boxRect.right;
    });

    if (visibleItems.length < 3) {
      box.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 40 : 1);
      return;
    }

    let offset = 0;
    const padding = 50; // #selectBox horizontal padding

    if (e.deltaY > 0) {
      // Scroll right: Use 2nd from last visible item as the new left anchor
      const anchorItem = visibleItems[visibleItems.length - 2];
      if (anchorItem) {
        offset =
          anchorItem.getBoundingClientRect().left - boxRect.left - padding;
      }
    } else {
      // Scroll left: Use 2nd visible item as the new right anchor
      const anchorItem = visibleItems[1];
      if (anchorItem) {
        offset =
          anchorItem.getBoundingClientRect().right - (boxRect.right - padding);
      }
    }

    if (offset !== 0 && Math.abs(offset) > 10) {
      this._isPaging = true;
      box.scrollTo({
        left: box.scrollLeft + offset,
        behavior: "smooth",
      });

      window.clearTimeout(this._pagingTimer);
      this._pagingTimer = window.setTimeout(() => {
        this._isPaging = false;
      }, 400); // Wait for smooth scroll to mostly finish
    } else {
      box.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 40 : 1);
    }
  }

  private _syncRenderedState(activePath: string): void {
    this.container.querySelectorAll(".timeline-item").forEach((element) => {
      const itemEl = element as HTMLElement;
      const itemData = this._itemDataMap.get(itemEl);
      if (!itemData) {
        return;
      }

      const activeVariantIndex = Math.max(
        itemData.refs.findIndex((banner) => banner.path === activePath),
        0,
      );
      const activeBanner = itemData.refs[activeVariantIndex];
      const isActive = activeBanner.path === activePath;

      itemEl.classList.toggle("active", isActive);

      const nameText = itemEl.querySelector(
        ".item-name > span",
      ) as HTMLElement | null;
      if (nameText) {
        nameText.innerText = activeBanner.name;
      }

      const dropdown = itemEl.querySelector(
        ".popover-content",
      ) as HTMLDivElement | null;
      dropdown?.querySelectorAll(".popover-item").forEach((dropdownItem) => {
        const variantEl = dropdownItem as HTMLElement;
        variantEl.classList.toggle(
          "active",
          variantEl.dataset.path === activePath,
        );
      });
    });
  }
}
