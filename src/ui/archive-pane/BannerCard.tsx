import { store } from "../../state/store";
import type { BannerConfig, BannerEntry } from "../../types";
import { BannerInfoBar } from "../components/BannerInfoBar";
import { usePreload } from "./usePreload";
import "./BannerCard.css";

export interface BannerCardProps {
  /** 当前 Banner 数据实体 */
  entry: BannerEntry;
  /** 自定义类名 */
  className?: string;
}

/**
 * 提取 Banner 配置中的背景与可选 Logo 资源路径
 * 适配 simple-image、official 2020、official 2021 等各种类型
 */
export function extractBannerResources(config: BannerConfig): {
  bgSrc?: string;
  logoSrc?: string;
} {
  let bgSrc: string | undefined;
  const logoSrc = config.logo?.src;

  switch (config.type) {
    case "simple-image":
      bgSrc = config.layer?.src;
      break;
    case "official_2020":
      bgSrc = config.layers?.[0]?.images?.[0]?.src;
      break;
    case "official_2021":
      bgSrc = config.layers?.[0]?.resources?.[0]?.src;
      break;
  }

  return { bgSrc, logoSrc };
}

/**
 * BannerCard 预览卡片组件 (Task 4.2c)
 * - 提取首个 ref 背景与 logo 进行 usePreload 并行预加载
 * - 骨架屏 (loading) / 失败态 (error) / 静态预览 (ready) 三态渲染
 * - 底部内嵌 BannerInfoBar (card 模式)
 * - 点击主体选中舞台，高亮边框联动
 */
export function BannerCard({ entry, className = "" }: BannerCardProps) {
  const ref = entry.refs[0];
  const { bgSrc, logoSrc } = ref ? extractBannerResources(ref.config) : {};

  // 待预加载的资源列表
  const srcs = [bgSrc, logoSrc].filter((s): s is string => Boolean(s));
  const preloadState = usePreload(srcs, ref?.id);

  // 判断是否当前激活的 Banner
  const isActive = entry.refs.some((r) => r.id === store.activeBannerId.value);

  // 判断是否处于定位光晕闪烁态
  const isHighlighted =
    store.highlightedBannerId.value !== null &&
    entry.refs.some((r) => r.id === store.highlightedBannerId.value);

  const handleClick = () => {
    if (ref?.id) {
      store.select(ref.id);
    }
  };

  const cardClasses = [
    "banner-card",
    isActive ? "is-active" : "",
    isHighlighted ? "is-highlight-pulse" : "",
    `banner-card--${preloadState}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClasses}>
      {/* 顶部静态预览区：仅该区域响应点击切换 Banner */}
      {/* biome-ignore lint/a11y/useSemanticElements: 预览图片区域作为互动卡片切换按钮 */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 仅支持鼠标点击交互 */}
      <div
        role="button"
        tabIndex={0}
        className="banner-card__preview"
        onClick={handleClick}
        aria-label={`${ref?.name || "Banner"} - ${entry.date}`}
      >
        {preloadState === "loading" && (
          <div className="banner-card__skeleton" />
        )}

        {preloadState === "error" && (
          <div className="banner-card__error">
            <svg
              className="banner-card__error-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>预览图加载失败</span>
          </div>
        )}

        {preloadState === "ready" && (
          <>
            {bgSrc && (
              <img
                className="banner-card__bg"
                src={bgSrc}
                alt={ref?.name || "Banner preview"}
                loading="lazy"
              />
            )}
            {logoSrc && (
              <div className="banner-card__logo-wrap">
                <img
                  className="banner-card__logo"
                  src={logoSrc}
                  alt="Logo"
                  loading="lazy"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部内嵌卡片信息栏 */}
      <BannerInfoBar mode="card" entry={entry} />
    </div>
  );
}
