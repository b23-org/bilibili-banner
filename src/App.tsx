import type { JSX } from "preact";
import { useRef, useState } from "preact/hooks";
import { ArchivePane } from "./ui/archive-pane/ArchivePane";
import { BannerContainer } from "./ui/banner-container/BannerContainer";
import { Toast } from "./ui/components/Toast";
import { ActionDock } from "./ui/dock/ActionDock";
import { HelpModal } from "./ui/help/HelpModal";
import "./App.css";

/**
 * 根组件 App
 * - 渲染 Scrollport 双区布局（舞台区与内容区 DOM 平级）
 * - BannerContainer 内部直连全局 bannerEngine 单例
 * - 管理 ArchivePane 的 scrollRef，传递给 ActionDock 实现平滑返回顶部
 * - 维护 HelpModal 显隐状态
 */
export function App(): JSX.Element {
  const archivePaneScrollRef = useRef<HTMLDivElement>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <>
      <BannerContainer />
      <ArchivePane scrollRef={archivePaneScrollRef} />
      <ActionDock
        scrollContainerRef={archivePaneScrollRef}
        onOpenHelp={() => setIsHelpOpen(true)}
      />
      <HelpModal open={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <Toast />
    </>
  );
}

export default App;
