import type { RefObject } from "preact";
import { useRef } from "preact/hooks";
import { BannerGallery } from "./BannerGallery";
import { FilterBar } from "./FilterBar";
import "./ArchivePane.css";

export interface ArchivePaneProps {
  /** 外部传入的滚动容器 Ref（如供 ActionDock 回到顶部与滚动监听使用） */
  scrollRef?: RefObject<HTMLDivElement>;
  /** 自定义外部类名 */
  className?: string;
}

/**
 * ArchivePane 独立 Scrollport 内容区容器 (Task 4.4)
 * - 页面唯一滚动区域 (flex: 1; overflow-y: auto; overflow-x: hidden;)
 * - 顶部容纳 FilterBar 筛选栏
 * - 下方容纳 BannerGallery 虚拟卡片流，并共享 scrollContainerRef
 */
export function ArchivePane({ scrollRef, className = "" }: ArchivePaneProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollRef ?? internalRef;

  return (
    <div ref={containerRef} className={`archive-pane ${className}`.trim()}>
      <div className="archive-pane__content">
        <FilterBar />
        <BannerGallery scrollContainerRef={containerRef} />
      </div>
    </div>
  );
}
