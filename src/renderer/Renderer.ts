import type { BannerConfig, BannerRef } from "../types";
import { OfficialRenderer } from "./official/OfficialRenderer";
import { SimpleImageRenderer } from "./SimpleImageRenderer";

export interface Renderer {
  /**
   * 阶段一：纯资产准备阶段
   * - 并行加载图片、Blob 视频、音频等资产（含 Logo 资源）
   * - 绝不执行任何 DOM 操作，不碰目标容器
   * - 响应 AbortSignal，随时可被中止
   */
  prepare(banner: BannerRef, signal: AbortSignal): Promise<void>;

  /**
   * 阶段二：同步原子挂载阶段
   * - 一次性创建全部 DOM 结构插入容器
   * - 多帧图层的全部帧预挂载为兄弟节点
   * - 几何尺寸、基础样式与 LogoView 一次性挂载
   */
  mount(container: HTMLElement): void;

  /**
   * 阶段三：动画与交互启动阶段
   * - 启动 RAF、绑定事件监听、启动物理模拟或交互循环
   */
  start(): void;

  /**
   * 阶段四：资源销毁阶段（必须幂等，允许从任意前序阶段安全调用）
   * - 从 DOM 移除渲染节点与 LogoView 节点
   * - 取消 RAF，解绑全部事件监听与计时器
   * - 释放媒体元素、Blob URL 与派生节点
   */
  dispose(): void;
}

/**
 * 同步工厂函数：根据配置返回对应的 Renderer 实现
 */
export function createRenderer(config: BannerConfig): Renderer {
  switch (config.type) {
    case "simple-image":
      return new SimpleImageRenderer();
    case "official_2021":
      return new OfficialRenderer();
    default:
      throw new Error(
        `[createRenderer] 未知的 Banner 类型: ${(config as { type?: string }).type}`,
      );
  }
}
