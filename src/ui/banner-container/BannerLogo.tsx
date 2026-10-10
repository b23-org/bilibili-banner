import type { JSX } from "preact";

/**
 * BannerLogo 组件
 * 提供 #logo DOM 容器供 LogoRenderer 挂载和渲染 Banner Logo 图片与链接
 */
export function BannerLogo(): JSX.Element {
  return <div id="logo" className="banner-logo" />;
}

export default BannerLogo;
