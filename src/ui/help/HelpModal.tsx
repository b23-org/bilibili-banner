import type { JSX } from "preact";
import { createPortal } from "preact/compat";
import { useEffect } from "preact/hooks";
import "./HelpModal.css";

export interface HelpModalProps {
  /** 弹窗是否可见 */
  open: boolean;
  /** 关闭弹窗的回调函数 */
  onClose: () => void;
}

/**
 * HelpModal 帮助说明弹窗
 * - 使用 createPortal 挂载到 document.body
 * - 呈现本站介绍、横幅类型说明、交互指南与版权声明
 */
export function HelpModal({
  open,
  onClose,
}: HelpModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;

    // 打开时阻止底层页面滚动
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  // 点击遮罩空白区域关闭弹窗
  const handleBackdropClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: 点击遮罩空白处关闭弹窗属于辅助鼠标操作
    <div
      className="help-modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
    >
      <div className="help-modal-card">
        {/* 头部标题 */}
        <div className="help-modal-header">
          <h3 id="help-modal-title" className="help-modal-title">
            帮助与说明
          </h3>
        </div>

        {/* 内容区 */}
        <div className="help-modal-body">
          {/* 1. 关于本站 */}
          <section className="help-section">
            <h4 className="section-title">🏛️ 关于本站</h4>
            <p className="section-text">
              本项目是一个围绕 Bilibili 首页顶栏 Banner
              的历史还原与归档项目。收录并系统整理了自 2013
              年至今的大部分Banner数据，结合页面快照与逆向分析结果，尽可能精确地还原不同时期
              B 站Banner的视觉表现与交互体验。
            </p>
          </section>

          {/* 2. 横幅类型介绍 */}
          <section className="help-section">
            <h4 className="section-title">🎨 横幅类型</h4>
            <ul className="help-list">
              <li className="help-item">
                <span className="help-desc">
                  <strong>静态</strong>：只有单张图片的 banner
                </span>
              </li>
              <li className="help-item">
                <span className="help-desc">
                  <strong>视频</strong>：以视频为主体的 banner
                </span>
              </li>
              <li className="help-item">
                <span className="help-desc">
                  <strong>动态</strong>
                  ：多个图片组成的，可跟随鼠标移动产生位移、变化，或带有粒子效果
                </span>
              </li>
              <li className="help-item">
                <span className="help-desc">
                  <strong>场景互动</strong>：包含深度交互机制的
                  banner，画面特定区域可点击触发独立动画、音效、全屏展开或内置小游戏
                </span>
              </li>
            </ul>
          </section>

          {/* 3. 交互指南（仅动态和场景互动类型） */}
          <section className="help-section">
            <h4 className="section-title">🕹️ 交互指南</h4>
            <ul className="help-list">
              <li className="help-item">
                <div className="help-text">
                  <span className="help-label">动态Banner</span>
                  <span className="help-desc">
                    <strong>交互方式：</strong>
                    将鼠标移入上方横幅舞台，并在画面内左右移动光标。
                    <br />
                    <strong>动效反馈：</strong>
                    各图层随鼠标位置产生视差位移、旋转、缩放与景深虚化；光标移出横幅后自动平滑复位。
                  </span>
                </div>
              </li>
              <li className="help-item">
                <div className="help-text">
                  <span className="help-label">场景互动Banner</span>
                  <span className="help-desc">
                    <strong>交互方式：</strong>
                    注意并点击画面中特定的可交互热区（如发光物件、角色手持道具、场景开关等）。
                    <br />
                    <strong>动效反馈：</strong>
                    点击可触发专属的分支动画、全景展开视角、音效/音乐播放或内置小游戏。
                  </span>
                </div>
              </li>
            </ul>
          </section>

          {/* 4. 协议与声明 */}
          <section className="help-section">
            <h4 className="section-title">⚖️ 协议与声明</h4>
            <div className="help-desc help-desc--license">
              <p>
                <strong>开源协议：</strong>本项目核心复现代码及界面实现采用 MIT
                License 协议开源。
              </p>
              <p>
                <strong>版权归属：</strong>项目中所使用的图片、音视频、3D
                模型、设计素材及相关商业标识，其版权与知识产权均归上海宽娱数码科技有限公司（Bilibili）所有。
              </p>
              <p>
                <strong>非商业免责：</strong>
                本站仅作为技术交流、动效复原学习与历史设计归档之非营利性开源项目，不用于任何商业用途。
              </p>
            </div>
          </section>
        </div>

        {/* 底部按钮栏 */}
        <div className="help-modal-footer">
          <button
            type="button"
            className="help-modal-primary-btn"
            onClick={onClose}
          >
            知道了
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default HelpModal;
