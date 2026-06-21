class MessageBox {
  show(message: string, duration = 3000) {
    const box = document.createElement("div");
    box.className = "error-message-box";
    box.innerText = message;

    Object.assign(box.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      backgroundColor: "#ffffff",
      boxShadow: "0 0 30px rgba(0, 0, 0, 0.1)",
      borderRadius: "8px",
      border: "1px solid #E3E5E7",
      color: "#18191C",
      padding: "16px 32px",
      fontSize: "14px",
      zIndex: "10000",
      pointerEvents: "none",
      whiteSpace: "nowrap",
      transition: "opacity 0.3s ease",
      opacity: "0",
    });

    document.body.appendChild(box);

    // 触发重绘并淡入
    box.getBoundingClientRect();
    box.style.opacity = "1";

    setTimeout(() => {
      box.style.opacity = "0";
      box.addEventListener("transitionend", () => {
        box.remove();
      });
    }, duration);
  }
}

const SOURCE_IDS = ["design", "default", "29ERAmwloghvx7600"]; // 预置的本地漫画主题 ID

class MangaController {
  private mangaList: string[] = [];
  private currentSrc = "";
  private isCooldown = false;
  private cooldownTimer: number | undefined;
  private clickCount = 0;

  private mangaImg: HTMLImageElement;
  private changeBtn: HTMLButtonElement;

  constructor() {
    this.mangaImg = document.getElementById("manga-img") as HTMLImageElement;
    this.changeBtn = document.getElementById("change-btn") as HTMLButtonElement;
  }

  async init() {
    if (!this.mangaImg || !this.changeBtn) {
      console.error("404 页面 DOM 节点缺失，无法初始化漫画推荐。");
      return;
    }

    const chosenSourceId =
      SOURCE_IDS[Math.floor(Math.random() * SOURCE_IDS.length)];
    const listUrl = `/assets/error/${chosenSourceId}/list.json`;

    try {
      const response = await fetch(listUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.mangaList = (await response.json()) as string[];

      if (this.mangaList.length > 0) {
        this.renderInitialManga();
        this.changeBtn.addEventListener("click", () => this.changeManga());
      } else {
        console.warn("漫画列表为空。");
      }
    } catch (error) {
      console.error(`加载漫画包 ${chosenSourceId} 失败:`, error);
    }
  }

  /**
   * 无重复随机算法：随机挑选一张与当前不同的漫画路径
   */
  private getRandomMangaSrc(): string {
    const available = this.mangaList.filter((src) => {
      return this.currentSrc === "" || !this.currentSrc.endsWith(src);
    });

    const pool = available.length > 0 ? available : this.mangaList;
    const randomIndex = Math.floor(Math.random() * pool.length);
    return `/${pool[randomIndex]}`;
  }

  private renderInitialManga() {
    const firstSrc = this.getRandomMangaSrc();
    this.currentSrc = firstSrc;

    this.mangaImg.onload = () => {
      this.mangaImg.style.display = "inline";
      this.mangaImg.onload = null; // 一次性事件，清除监听
    };
    this.mangaImg.src = firstSrc;
  }

  private changeManga() {
    if (this.isCooldown) return;

    this.isCooldown = true;
    this.changeBtn.disabled = true;
    this.changeBtn.classList.add("off");

    const newSrc = this.getRandomMangaSrc();
    this.currentSrc = newSrc;

    this.clickCount++;
    if (this.clickCount === 100) {
      new MessageBox().show(
        `别刷了，其实一共就${this.mangaList.length + 1}张(笑)`,
        3000,
      );
    } else if (this.clickCount === 200) {
      new MessageBox().show(
        `好吧骗你的，其实一共就${this.mangaList.length}张(笑)`,
        3000,
      );
    }

    const releaseCooldown = () => {
      this.isCooldown = false;
      this.changeBtn.disabled = false;
      this.changeBtn.classList.remove("off");
      if (this.cooldownTimer !== undefined) {
        clearTimeout(this.cooldownTimer);
        this.cooldownTimer = undefined;
      }
    };

    // 动作 1：监听新图片加载完毕，平滑滚动至漫画顶端并释放冷却
    this.mangaImg.onload = () => {
      const scrollTarget = document.getElementById("up");
      if (scrollTarget) {
        scrollTarget.scrollIntoView({ behavior: "smooth" });
      }
      releaseCooldown();
      this.mangaImg.onload = null; // 一次性事件，清除监听
    };

    this.mangaImg.src = newSrc;

    // 动作 2：设置 3 秒强行冷却保护定时器（双重释放兜底）
    this.cooldownTimer = window.setTimeout(() => {
      releaseCooldown();
      this.mangaImg.onload = null; // 清除已过期的 onload
    }, 3000);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const controller = new MangaController();
  void controller.init();
});
