import type { RefObject } from "preact";
import { useEffect, useState } from "preact/hooks";
import { store } from "../../state/store";
import type { BannerEntry } from "../../types";
import { BannerCard } from "./BannerCard";
import { VirtualList } from "./VirtualList";
import "./BannerGallery.css";

export interface BannerGalleryProps {
  /** 外部滚动容器 Ref */
  scrollContainerRef?: RefObject<HTMLElement>;
  /** 自定义外部类名 */
  className?: string;
}

/**
 * 计算卡片固定行高（包含卡片高度与底部间距）
 * 预览区高度在 124px 到 192px 之间（对齐 7.5vw 缩放比例），加信息栏 54px 与间距 16px
 */
function calculateCardItemHeight(): number {
  if (typeof window === "undefined") {
    return 240;
  }
  const previewHeight = Math.min(
    192,
    Math.max(124, Math.round(window.innerWidth * 0.075)),
  );
  return previewHeight + 70;
}

/**
 * BannerGallery 卡片流展示容器 (Task 4.4)
 * - 响应式消费 store.filtered 计算 Signal
 * - 整合 VirtualList 维持 ~15–20 个轻量 DOM 节点
 * - 筛选或排序条件变化时滚动自动归零
 * - 无匹配数据时渲染友好空状态并提供重置入口
 */
export function BannerGallery({
  scrollContainerRef,
  className = "",
}: BannerGalleryProps) {
  const filteredEntries = store.filtered.value;
  const [itemHeight, setItemHeight] = useState(calculateCardItemHeight);

  // 监听窗口尺寸动态调整固定行高
  useEffect(() => {
    const handleResize = () => {
      setItemHeight(calculateCardItemHeight());
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // 筛选或排序变化时，将外层滚动容器归零
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (container) {
      container.scrollTop = 0;
    }
  }, [
    store.year.value,
    store.tag.value,
    store.order.value,
    scrollContainerRef,
  ]);

  // 空状态视图
  if (filteredEntries.length === 0) {
    return (
      <div className={`banner-gallery ${className}`.trim()}>
        <div className="banner-gallery__empty">
          <svg
            className="banner-gallery__empty-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m15 9-6 6" />
            <path d="m9 9 6 6" />
          </svg>
          <h3 className="banner-gallery__empty-title">
            未找到符合条件的 Banner
          </h3>
          <p className="banner-gallery__empty-desc">
            请尝试调整或重置年份、类型筛选条件
          </p>
          <button
            type="button"
            className="b-capsule is-active b-capsule--current"
            onClick={() => store.resetFilters()}
          >
            重置筛选条件
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`banner-gallery ${className}`.trim()}>
      <VirtualList<BannerEntry>
        items={filteredEntries}
        itemHeight={itemHeight}
        overscan={3}
        scrollContainerRef={scrollContainerRef}
        renderItem={(entry) => (
          <BannerCard key={entry.refs[0]?.id || entry.date} entry={entry} />
        )}
      />
    </div>
  );
}
