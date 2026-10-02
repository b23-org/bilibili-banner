import type { JSX } from "preact";
import { useMemo, useRef, useState } from "preact/hooks";
import { BannerEngine } from "./core/BannerEngine";
import { ArchivePane } from "./ui/archive-pane/ArchivePane";
import { BannerContainer } from "./ui/banner-container/BannerContainer";
import { Toast } from "./ui/components/Toast";
import { ActionDock } from "./ui/dock/ActionDock";
import { HelpModal } from "./ui/help/HelpModal";
import "./App.css";

/**
 * 根组件 App (Task 6.2)
 * - 渲染 Scrollport 双区布局（舞台区与内容区 DOM 平级）
 * - 实例化 BannerEngine 单例，注入 BannerContainer
 * - 管理 ArchivePane 的 scrollRef，传递给 ActionDock 实现平滑返回顶部
 * - 维护 HelpModal 显隐状态
 */
export function App(): JSX.Element {
  const engine = useMemo(() => new BannerEngine(), []);
  const archivePaneScrollRef = useRef<HTMLDivElement>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <>
      <BannerContainer engine={engine} />
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
