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
 * HelpModal 帮助说明弹窗 (Task 5.2)
 * - 使用 createPortal 挂载到 document.body
 * - 纯自含模态逻辑（半透明遮罩、页面滚动锁定）
 * - 完整呈现历史档案库操作指南与开源许可信息
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
          {/* 项目简介 */}
          <section className="help-section">
            <h4 className="section-title">🏛️ 项目简介</h4>
            <p className="section-text">
              本项目是一个围绕 Bilibili 首页 Banner
              的历史档案与还原项目。收录并整理了自 2013 年至今的大部分
              Banner，结合页面快照与逆向分析结果，尽可能复现出不同时期 Banner
              的视觉表现与交互逻辑。
            </p>
          </section>

          {/* 基础操作指南 */}
          <section className="help-section">
            <h4 className="section-title">🕹️ 操作指南</h4>
            <ul className="help-list">
              <li className="help-item">
                <div className="help-text">
                  <span className="help-label">横幅切换与舞台</span>
                  <span className="help-desc">
                    点击下方档案流中的任意横幅卡片，上方常驻舞台即可无缝切换并运行对应的
                    Banner 特效。
                  </span>
                </div>
              </li>
              <li className="help-item">
                <div className="help-text">
                  <span className="help-label">多版本切换</span>
                  <span className="help-desc">
                    部分 Banner
                    收录了多个时期或动效版本。在卡片或舞台信息栏右侧悬停版本胶囊，即可选择不同版本。
                  </span>
                </div>
              </li>
              <li className="help-item">
                <div className="help-text">
                  <span className="help-label">分类与年份检索</span>
                  <span className="help-desc">
                    通过筛选栏可快速过滤不同年份及特性的 Banner：
                    <br />• <strong>场景互动</strong>
                    ：可与画面特定区域鼠标交互，触发独特音画动效。
                    <br />• <strong>动态</strong>
                    ：图层随鼠标移动产生旋转、缩放与视差位移。
                    <br />• <strong>视频</strong>
                    ：包含高清视频循环背景与媒体剪辑。
                    <br />• <strong>静态</strong>：经典纯平面画作横幅。
                  </span>
                </div>
              </li>
            </ul>
          </section>

          {/* 协议与声明 */}
          <section className="help-section">
            <h4 className="section-title">⚖️ 协议与声明</h4>
            <p className="help-desc">
              本项目代码部分采用 MIT License 协议开源。
              <br />
              项目中所使用的图片、视频、设计及原始素材版权均归 Bilibili 所有。
            </p>
          </section>
        </div>

        {/* 底部按钮栏 */}
        <div className="help-modal-footer">
          <button
            type="button"
            className="help-modal-primary-btn"
            onClick={onClose}
          >
            我知道了
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default HelpModal;
