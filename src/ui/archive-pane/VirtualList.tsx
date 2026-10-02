import type { ComponentChildren, RefObject } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import "./VirtualList.css";

export interface VirtualListProps<T> {
  /** 待渲染的完整数据集 */
  items: T[];
  /** 每一项的固定像素高度 */
  itemHeight: number;
  /** 缓冲区大小（视口上下预渲染数量），默认为 3 */
  overscan?: number;
  /** 单项渲染函数 */
  renderItem: (item: T, index: number) => ComponentChildren;
  /** 外部滚动容器 Ref，若未传入则自动定位最近滚动父级容器 */
  scrollContainerRef?: RefObject<HTMLElement>;
  /** 外部附加 class */
  className?: string;
}

/**
 * 滑动窗口虚拟列表组件 (Task 4.2b)
 * - 固定行高模式，根据滚动位置动态计算切片
 * - 撑起全量高度，可见项绝对定位
 * - 视口节点恒定维持在 ~15–20 个节点
 * - 数据源切换时自动重置滚动并重算视口
 */
export function VirtualList<T>({
  items,
  itemHeight,
  overscan = 3,
  renderItem,
  scrollContainerRef,
  className = "",
}: VirtualListProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 15 });
  const rafIdRef = useRef<number | null>(null);
  const lastItemsRef = useRef(items);

  // 计算总高度
  const totalHeight = items.length * itemHeight;

  // 获取实际滚动容器
  const getContainer = useCallback((): HTMLElement | Window | null => {
    if (scrollContainerRef?.current) {
      return scrollContainerRef.current;
    }
    if (listRef.current) {
      let parent: HTMLElement | null = listRef.current.parentElement;
      while (parent) {
        const overflowY = window.getComputedStyle(parent).overflowY;
        if (
          overflowY === "auto" ||
          overflowY === "scroll" ||
          parent.classList.contains("archive-pane")
        ) {
          return parent;
        }
        parent = parent.parentElement;
      }
    }
    return typeof window !== "undefined" ? window : null;
  }, [scrollContainerRef]);

  // 更新可见项范围
  const updateRange = useCallback(() => {
    if (items.length === 0) {
      setRange({ start: 0, end: 0 });
      return;
    }

    const container = getContainer();
    if (!container) {
      setRange({ start: 0, end: Math.min(items.length, 15) });
      return;
    }

    let scrollTop = 0;
    let clientHeight = 800;
    let listTop = 0;

    if (container instanceof Window) {
      scrollTop = window.scrollY || document.documentElement.scrollTop;
      clientHeight = window.innerHeight;
      if (listRef.current) {
        listTop = listRef.current.getBoundingClientRect().top + scrollTop;
      }
    } else {
      scrollTop = container.scrollTop;
      clientHeight = container.clientHeight || 800;
      if (listRef.current) {
        const listRect = listRef.current.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        listTop = listRect.top - containerRect.top + container.scrollTop;
      }
    }

    const relativeScrollTop = Math.max(0, scrollTop - listTop);
    const visibleStart = Math.floor(relativeScrollTop / itemHeight);
    const visibleCount = Math.ceil(clientHeight / itemHeight);

    const start = Math.max(0, visibleStart - overscan);
    const end = Math.min(
      items.length - 1,
      visibleStart + visibleCount + overscan,
    );

    setRange((prev) => {
      if (prev.start === start && prev.end === end) {
        return prev;
      }
      return { start, end };
    });
  }, [items.length, itemHeight, overscan, getContainer]);

  // 数据源变更时，重置滚动位置并重算
  useEffect(() => {
    if (lastItemsRef.current !== items) {
      lastItemsRef.current = items;
      const container = getContainer();
      if (container) {
        if (container instanceof Window) {
          window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        } else {
          container.scrollTop = 0;
        }
      }
      updateRange();
    }
  }, [items, getContainer, updateRange]);

  // 监听滚动与尺寸变化
  useEffect(() => {
    const container = getContainer();
    if (!container) return;

    const onScrollOrResize = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(() => {
        updateRange();
        rafIdRef.current = null;
      });
    };

    container.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize, { passive: true });

    // 初始计算一次
    updateRange();

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      container.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [getContainer, updateRange]);

  if (items.length === 0) {
    return null;
  }

  const { start, end } = range;
  const visibleIndices: number[] = [];
  for (let i = start; i <= end && i < items.length; i++) {
    visibleIndices.push(i);
  }

  return (
    <div
      ref={listRef}
      className={`virtual-list ${className}`.trim()}
      style={{
        height: `${totalHeight}px`,
      }}
    >
      {visibleIndices.map((index) => {
        const item = items[index];
        return (
          <div
            key={index}
            className="virtual-list-item"
            style={{
              top: `${index * itemHeight}px`,
              height: `${itemHeight}px`,
            }}
          >
            {renderItem(item, index)}
          </div>
        );
      })}
    </div>
  );
}
