import type { RefObject } from "preact";
import { useEffect, useState } from "preact/hooks";
import { store } from "../../state/store";
import { navigateToScrollTop } from "./scrollHelper";
import "./ActionDock.css";

export interface ActionDockProps {
  /** 滚动容器 Ref（监听滚动距离并执行平滑滚动） */
  scrollContainerRef?: RefObject<HTMLElement>;
  /** 点击帮助按钮时的回调 */
  onOpenHelp?: () => void;
}

/**
 * ActionDock 悬浮工具坞 (Task 5.1)
 * - 固定定位在视口右下角 (right: 28px; bottom: 32px; z-index: 900)
 * - 5 颗圆形按钮（上下垂直排列）：回到顶部、定位Banner、B站主页、GitHub 仓库、帮助说明
 * - 回到顶部：监听容器（或 window）scroll 事件，滚动超过 300px 时淡入，采用两段式平滑滚入
 * - 定位Banner：常驻显示，视口内直接触发 B站蓝呼吸光晕，视口外两段式滑入，筛选过滤时引导提示
 */
export function ActionDock({
  scrollContainerRef,
  onOpenHelp,
}: ActionDockProps) {
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const container = scrollContainerRef?.current;

    const getScrollTop = (): number => {
      if (container) {
        return container.scrollTop;
      }
      return window.scrollY || document.documentElement.scrollTop || 0;
    };

    const handleScroll = () => {
      setShowBackToTop(getScrollTop() > 300);
    };

    // 初始检查一次当前滚动高度
    handleScroll();

    if (container) {
      container.addEventListener("scroll", handleScroll, { passive: true });
      return () => {
        container.removeEventListener("scroll", handleScroll);
      };
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [scrollContainerRef, scrollContainerRef?.current]);

  // 回到顶部：复用两段式瞬移 + 平滑减速滚入
  const handleScrollToTop = () => {
    const container = scrollContainerRef?.current;
    if (container) {
      navigateToScrollTop({ container, targetTop: 0 });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // 定位Banner
  const handleLocateBanner = () => {
    const activeId = store.activeBannerId.value;
    if (!activeId) {
      return;
    }

    const filtered = store.filtered.value;
    const targetIndex = filtered.findIndex((entry) =>
      entry.refs.some((r) => r.id === activeId),
    );

    // 若当前活跃横幅被筛选条件过滤，引导用户清除筛选条件
    if (targetIndex === -1) {
      store.showToast("当前横幅已被筛选过滤，请清除筛选条件后查看");
      return;
    }

    const container = scrollContainerRef?.current;
    if (!container) {
      store.triggerHighlight(activeId);
      return;
    }

    // 计算卡片行高（动态适配 7.5vw，区间 124~192px + 70px 信息栏）
    const previewHeight = Math.min(
      192,
      Math.max(124, Math.round(window.innerWidth * 0.075)),
    );
    const itemHeight = previewHeight + 70;

    // 获取虚拟列表相对于滚动容器的顶部偏移量
    const listEl = container.querySelector(
      ".virtual-list",
    ) as HTMLElement | null;
    const listOffsetTop = listEl ? listEl.offsetTop : 80;

    const cardTop = listOffsetTop + targetIndex * itemHeight;
    const cardBottom = cardTop + itemHeight;
    const currentScrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;

    // 检查是否已经在当前窗口中
    const isInViewport =
      cardTop >= currentScrollTop &&
      cardBottom <= currentScrollTop + viewportHeight;

    if (isInViewport) {
      // 已经在当前窗口中：不进行滚动，直接触发高亮脉冲
      store.triggerHighlight(activeId);
      return;
    }

    // 不在当前窗口中：计算舒适的居中偏上停靠位置，执行两段式滚动并触发高亮
    const idealTop = Math.max(
      0,
      cardTop - Math.max(20, (viewportHeight - itemHeight) / 2),
    );
    navigateToScrollTop({ container, targetTop: idealTop });
    store.triggerHighlight(activeId);
  };

  return (
    <aside className="action-dock" aria-label="快捷操作坞">
      {/* 1. 回到顶部按钮 */}
      <button
        type="button"
        className={`action-dock__btn action-dock__btn--top ${showBackToTop ? "is-visible" : ""}`}
        onClick={handleScrollToTop}
        data-tooltip="回到顶部"
        aria-label="回到顶部"
        aria-hidden={!showBackToTop}
      >
        <svg
          className="action-dock__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      {/* 2. 定位当前 Banner 按钮 */}
      <button
        type="button"
        className="action-dock__btn action-dock__btn--locate"
        onClick={handleLocateBanner}
        data-tooltip="定位Banner"
        aria-label="定位Banner"
      >
        <svg
          className="action-dock__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
        </svg>
      </button>

      {/* 3. B 站主页 */}
      <a
        href="https://www.bilibili.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="action-dock__btn action-dock__btn--bilibili"
        data-tooltip="哔哩哔哩官网"
        aria-label="哔哩哔哩官网"
      >
        <span className="sr-only">哔哩哔哩官网</span>
        <svg
          className="action-dock__icon"
          viewBox="0 0 24 24"
          fill="currentColor"
          fillRule="evenodd"
          aria-hidden="true"
        >
          <path
            clipRule="evenodd"
            d="M4.977 3.561a1.31 1.31 0 111.818-1.884l2.828 2.728c.08.078.149.163.205.254h4.277a1.32 1.32 0 01.205-.254l2.828-2.728a1.31 1.31 0 011.818 1.884L17.82 4.66h.848A5.333 5.333 0 0124 9.992v7.34a5.333 5.333 0 01-5.333 5.334H5.333A5.333 5.333 0 010 17.333V9.992a5.333 5.333 0 015.333-5.333h.781L4.977 3.56zm.356 3.67a2.667 2.667 0 00-2.666 2.667v7.529a2.667 2.667 0 002.666 2.666h13.334a2.667 2.667 0 002.666-2.666v-7.53a2.667 2.667 0 00-2.666-2.666H5.333zm1.334 5.192a1.333 1.333 0 112.666 0v1.192a1.333 1.333 0 11-2.666 0v-1.192zM16 11.09c-.736 0-1.333.597-1.333 1.333v1.192a1.333 1.333 0 102.666 0v-1.192c0-.736-.597-1.333-1.333-1.333z"
          />
        </svg>
      </a>

      {/* 4. GitHub 源码仓库 */}
      <a
        href="https://github.com/b23-org/bilibili-banner"
        target="_blank"
        rel="noopener noreferrer"
        className="action-dock__btn action-dock__btn--github"
        data-tooltip="GitHub 源码仓库"
        aria-label="GitHub 源码仓库"
      >
        <span className="sr-only">GitHub 源码仓库</span>
        <svg
          className="action-dock__icon"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 1C5.923 1 1 5.923 1 12c0 4.867 3.149 8.979 7.521 10.436.55.096.756-.233.756-.522 0-.262-.013-1.128-.013-2.049-2.764.509-3.479-.674-3.699-1.292-.124-.317-.66-1.293-1.127-1.554-.385-.207-.936-.715-.014-.729.866-.014 1.485.797 1.691 1.128.99 1.663 2.571 1.196 3.204.907.096-.715.385-1.196.701-1.471-2.448-.275-5.005-1.224-5.005-5.432 0-1.196.426-2.186 1.128-2.956-.111-.275-.496-1.402.11-2.915 0 0 .921-.288 3.024 1.128a10.193 10.193 0 0 1 2.75-.371c.936 0 1.871.123 2.75.371 2.104-1.43 3.025-1.128 3.025-1.128.605 1.513.221 2.64.111 2.915.701.77 1.127 1.747 1.127 2.956 0 4.222-2.571 5.157-5.019 5.432.399.344.743 1.004.743 2.035 0 1.471-.014 2.654-.014 3.025 0 .289.206.632.756.522C19.851 20.979 23 16.854 23 12c0-6.077-4.922-11-11-11Z" />
        </svg>
      </a>

      {/* 5. 帮助说明 */}
      <button
        type="button"
        className="action-dock__btn action-dock__btn--help"
        onClick={() => onOpenHelp?.()}
        data-tooltip="帮助与说明"
        aria-label="帮助与说明"
      >
        <svg
          className="action-dock__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
    </aside>
  );
}

export default ActionDock;
