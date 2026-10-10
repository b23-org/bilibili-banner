import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { bannerEngine } from "../../core/BannerEngine";
import { store } from "../../state/store";
import { BannerInfoBar } from "../components/BannerInfoBar";
import { BannerLogo } from "./BannerLogo";
import "./BannerContainer.css";

export type BannerContainerProps = Record<string, never>;

/**
 * BannerContainer 舞台区组件
 * - 渲染 #banner-container 常驻舞台根节点（对齐 B站官方规格与 Scrollport 布局）
 * - 直连全局单例 bannerEngine
 * - 响应式监听 store.activeRef.value，自动触发 bannerEngine.display(container, ref)
 * - 包含加载中 (.loading-banner) 与加载失败 (.failed-banner) 占位 UI
 * - 挂载 BannerLogo 供 LogoView 渲染 Logo
 * - 挂载 BannerInfoBar (mode="stage") 展示当前 Banner 详情与多版本选择 Popover
 */
export function BannerContainer(): JSX.Element {
  const containerRef = useRef<HTMLElement>(null);
  const activeRef = store.activeRef.value;

  // 首次挂载并响应 store.activeRef.value 切换
  useEffect(() => {
    const currentRef = store.activeRef.value;
    if (containerRef.current && currentRef) {
      void bannerEngine.display(containerRef.current, currentRef);
    }
  }, [activeRef]);

  return (
    <div className="banner-stage">
      {/* 顶部横幅舞台视口（由 bannerEngine 驱动渲染） */}
      <main id="banner-container" ref={containerRef}>
        {/* 加载中占位 */}
        <div className="loading-banner" aria-hidden="true" />

        {/* 加载失败占位 */}
        <div className="failed-banner">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="load-failed-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            role="img"
            aria-label="加载失败"
          >
            <title>加载失败</title>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="load-failed-title">加载失败</p>
        </div>

        {/* 供 LogoView 挂载的 Logo 容器 */}
        <BannerLogo />
      </main>

      {/* 舞台正下方常驻信息栏（与卡片预览图下方 info 区一致，不覆盖横幅画面） */}
      <div className="banner-stage__info">
        <BannerInfoBar mode="stage" />
      </div>
    </div>
  );
}

export default BannerContainer;
