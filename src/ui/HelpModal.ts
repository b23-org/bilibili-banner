export default class HelpModal {
  private triggerBtn: HTMLButtonElement | null = null;
  private modal: HTMLElement | null = null;
  private closeBtn: HTMLButtonElement | null = null;
  private abortController = new AbortController();

  constructor() {
    this.triggerBtn = document.getElementById("help-btn") as HTMLButtonElement;
    if (this.triggerBtn) {
      this._initDOM();
      this._bindEvents();
    } else {
      console.warn("HelpModal trigger button 'help-btn' not found in DOM.");
    }
  }

  private _initDOM(): void {
    // 动态创建最外层遮罩容器
    this.modal = document.createElement("div");
    this.modal.id = "help-modal";
    this.modal.className = "modal-backdrop";

    this.modal.innerHTML = `
      <div class="modal-content">
        <button class="modal-close-btn" type="button" aria-label="关闭">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="close-icon-svg">
            <title>关闭</title>
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <h3 class="modal-title">Bilibili Banner 档案馆</h3>
        <div class="modal-body">
          <div class="help-section">
            <h4 class="section-title">🏛️ 项目简介</h4>
            <p class="section-text">
              本项目是一个围绕 Bilibili 首页 Banner 的历史档案与还原项目。收录并整理了自 2013 年至今的大部分首页 Banner，结合公开页面、历史快照与逆向分析结果，尽可能复现不同阶段的视觉表现与交互逻辑。
            </p>
          </div>

          <div class="help-section">
            <h4 class="section-title">🕹️ 操作指南</h4>
            <ul class="help-list">
              <li class="help-item">
                <div class="help-text">
                  <span class="help-label">场景互动</span>
                  <span class="help-desc">在“场景互动”类型的 Banner 中，您可以通过直接点击画面进行趣味性的交互。</span>
                </div>
              </li>
              <li class="help-item">
                <div class="help-text">
                  <span class="help-label">多层视差</span>
                  <span class="help-desc">在“多层视差”类型的 Banner 中，画面图层会跟随您的鼠标左右移动而产生立体的深度变化。</span>
                </div>
              </li>
              <li class="help-item">
                <div class="help-text">
                  <span class="help-label">横向翻页</span>
                  <span class="help-desc">鼠标悬停在下方时间轴上时，您可以使用鼠标滚轮、或拖动滚动条来快速横向翻页查找 Banner。</span>
                </div>
              </li>
            </ul>
          </div>

          <div class="help-section">
            <h4 class="section-title">⚖️ 协议与声明</h4>
            <p class="section-text copyright-notice">
              · 本项目代码部分采用 MIT License 协议开源。<br />
              · 项目中所使用的图片、视频、设计及原始素材版权均归 Bilibili 所有。
            </p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);
    this.closeBtn = this.modal.querySelector(
      ".modal-close-btn",
    ) as HTMLButtonElement;
  }

  private _bindEvents(): void {
    const signal = this.abortController.signal;

    // 点击 i 按钮打开弹窗
    this.triggerBtn?.addEventListener("click", () => this.open(), { signal });

    // 点击关闭按钮关闭弹窗
    this.closeBtn?.addEventListener("click", () => this.close(), { signal });

    // 点击遮罩层空白处关闭弹窗
    this.modal?.addEventListener(
      "click",
      (e: MouseEvent) => {
        if (e.target === this.modal) {
          this.close();
        }
      },
      { signal },
    );

    // 键盘 Esc 键关闭弹窗
    document.addEventListener(
      "keyup",
      (e: KeyboardEvent) => {
        if (e.key === "Escape" && this.modal?.classList.contains("show")) {
          this.close();
        }
      },
      { signal },
    );
  }

  public open(): void {
    this.modal?.classList.add("show");
  }

  public close(): void {
    this.modal?.classList.remove("show");
  }

  public destroy(): void {
    this.abortController.abort();
    if (this.modal?.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }
  }
}
