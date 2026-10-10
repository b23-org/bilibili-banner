import { store } from "../state/store";
import type { BannerRef } from "../types";
import { RenderSession } from "./RenderSession";

export class BannerEngine {
  private activeSession: RenderSession | null = null;

  /**
   * 播放指定 Banner，显式传入目标舞台容器
   * - 废除两阶段初始化，无持久化 DOM 引用
   * - 基于 RenderSession 实行 RAII 自闭环管理
   */
  public async display(
    container: HTMLElement,
    banner: BannerRef,
  ): Promise<void> {
    // 同一 Banner 且会话正常进行中，防抖去重直接忽略
    if (
      this.activeSession?.banner.id === banner.id &&
      !this.activeSession.isAborted
    ) {
      return;
    }

    // 1. 立即中止并释放旧会话
    this.activeSession?.abort();
    this.activeSession = null;

    // 2. 舞台立即呈现 loading 占位
    container.setAttribute("data-state", "loading");

    // 3. 构建并运行新会话
    const session = new RenderSession(banner, container);
    this.activeSession = session;

    try {
      await session.run();
      if (this.activeSession === session && !session.isAborted) {
        container.setAttribute("data-state", "running");
      }
    } catch (err) {
      if (session.isAborted) return; // 正常切走，静默丢弃
      store.markRefFailed(banner.id); // 兜底记入黑名单
      if (this.activeSession === session) {
        container.setAttribute("data-state", "failed");
      }
      console.error(`[BannerEngine] 渲染失败: ${banner.id}`, err);
    }
  }

  /**
   * 全局清理销毁
   */
  public dispose(): void {
    this.activeSession?.abort();
    this.activeSession = null;
  }
}

/** 全站导出的唯一原生单例 */
export const bannerEngine = new BannerEngine();
export default BannerEngine;
