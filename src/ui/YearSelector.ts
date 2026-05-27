export default class YearSelector {
  private container: HTMLElement;
  private currentYear: string = "";
  private onYearChange: (year: string) => void;

  private _boundHandleClick: (e: MouseEvent) => void;
  private _boundHandleWheel: (e: WheelEvent) => void;

  constructor(years: string[], onYearChange: (year: string) => void) {
    const el = document.getElementById("year-selector");
    if (!el) {
      throw new Error("Element with id 'year-selector' not found");
    }
    this.container = el;
    this.onYearChange = onYearChange;

    this._boundHandleClick = this._handleClick.bind(this);
    this._boundHandleWheel = this._handleWheel.bind(this);

    this._setupScrollWheel();
    this._setupEventDelegation();

    if (years.length > 0) {
      this._renderYears(years);
    }
  }

  public destroy(): void {
    this.container.removeEventListener("click", this._boundHandleClick);
    this.container.removeEventListener("wheel", this._boundHandleWheel);
    this.container.innerHTML = "";
  }

  public setActiveYear(year: string): void {
    if (!year) return;

    this.currentYear = year;
    this.container.querySelectorAll(".year-item").forEach((el) => {
      const yearItem = el as HTMLElement;
      yearItem.classList.toggle("active", yearItem.dataset.year === year);
    });
  }

  private _renderYears(years: string[]): void {
    this.container.innerHTML = "";

    years.forEach((year) => {
      const yearEl = document.createElement("div");
      yearEl.className = `year-item ${year === this.currentYear ? "active" : ""}`;
      yearEl.innerText = year;
      yearEl.dataset.year = year;

      if (this.container) {
        this.container.appendChild(yearEl);
      }
    });
  }

  private _setupEventDelegation(): void {
    this.container.addEventListener("click", this._boundHandleClick);
  }

  private _handleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.classList.contains("year-item")) return;

    const year = target.dataset.year;
    if (!year || this.currentYear === year) return;

    this.setActiveYear(year);
    this.onYearChange(year);
  }

  private _setupScrollWheel(): void {
    this.container.addEventListener("wheel", this._boundHandleWheel);
  }

  private _handleWheel(e: WheelEvent): void {
    if (e.deltaY !== 0) {
      e.preventDefault();
      this.container.scrollLeft += e.deltaY;
    }
  }
}
