import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import "./Popover.css";

export type PopoverPlacement =
  | "bottom"
  | "bottom-end"
  | "bottom-start"
  | "top"
  | "top-end"
  | "top-start";

export interface PopoverProps {
  /** 触发器内容，支持直接传节点或以函数形式接收当前展开状态 */
  trigger: ComponentChildren | ((open: boolean) => ComponentChildren);
  /** 浮层内容 */
  children: ComponentChildren;
  /** 弹出方向，默认 bottom-end */
  placement?: PopoverPlacement;
  /** 防误触悬浮延迟 (ms)，默认 200ms */
  showDelay?: number;
  /** 离开隐藏延迟 (ms)，默认 150ms */
  hideDelay?: number;
  /** 触发器外部包装容器自定义类名 */
  className?: string;
  /** 浮层容器自定义类名 */
  contentClassName?: string;
  /** 展开/收起状态改变回调 */
  onOpenChange?: (open: boolean) => void;
  /** 点击浮层内容时是否自动关闭，默认 false */
  closeOnContentClick?: boolean;
}

interface TriggerRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Popover 组件 — 复刻 B站 VPopover
 * - createPortal 挂载到 document.body
 * - getBoundingClientRect 绝对定位与滚动/尺寸自适应更新
 * - hover-intent 防误触延迟与连贯移动保持
 * - opacity + translate3d 平滑过渡动画
 */
export function Popover({
  trigger,
  children,
  placement = "bottom-end",
  showDelay = 200,
  hideDelay = 150,
  className = "",
  contentClassName = "",
  onOpenChange,
  closeOnContentClick = false,
}: PopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [triggerRect, setTriggerRect] = useState<TriggerRect>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  });

  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const unmountTimerRef = useRef<number | null>(null);

  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const clearShowTimer = () => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const clearUnmountTimer = () => {
    if (unmountTimerRef.current !== null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
  };

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof document === "undefined") {
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const bodyRect = document.body.getBoundingClientRect();
    setTriggerRect({
      top: rect.top - bodyRect.top,
      left: rect.left - bodyRect.left,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  const openPopover = useCallback(() => {
    clearHideTimer();
    clearUnmountTimer();
    updatePosition();
    setIsMounted(true);
    setIsOpen(true);
    onOpenChangeRef.current?.(true);
  }, [updatePosition]);

  // 保证首次挂载或重新展开时，浏览器采纳初始隐式帧后触发 0.3s 平滑进入过渡动画
  useEffect(() => {
    if (isMounted && isOpen && !isVisible) {
      if (contentRef.current) {
        void contentRef.current.offsetHeight;
      }
      const raf = requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => {
        cancelAnimationFrame(raf);
      };
    }
    return undefined;
  }, [isMounted, isOpen, isVisible]);

  const closePopover = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
    setIsVisible(false);
    setIsOpen(false);
    onOpenChangeRef.current?.(false);
    clearUnmountTimer();
    unmountTimerRef.current = window.setTimeout(() => {
      setIsMounted(false);
    }, 300);
  }, []);

  const closeImmediately = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
    setIsVisible(false);
    setIsOpen(false);
    onOpenChangeRef.current?.(false);
    clearUnmountTimer();
    unmountTimerRef.current = window.setTimeout(() => {
      setIsMounted(false);
    }, 150);
  }, []);

  // 触发器鼠标移入
  const handleTriggerMouseEnter = () => {
    clearHideTimer();
    clearUnmountTimer();
    if (isOpen) {
      setIsVisible(true);
      return;
    }
    clearShowTimer();
    showTimerRef.current = window.setTimeout(() => {
      openPopover();
    }, showDelay);
  };

  // 触发器鼠标移出
  const handleTriggerMouseLeave = () => {
    clearShowTimer();
    if (isOpen) {
      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => {
        closePopover();
      }, hideDelay);
    }
  };

  // 浮层内容鼠标移入
  const handleContentMouseEnter = () => {
    clearHideTimer();
    clearUnmountTimer();
    setIsVisible(true);
  };

  // 浮层内容鼠标移出
  const handleContentMouseLeave = () => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      closePopover();
    }, hideDelay);
  };

  // 浮层内容点击
  const handleContentClick = () => {
    if (closeOnContentClick) {
      closeImmediately();
    }
  };

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      clearShowTimer();
      clearHideTimer();
      clearUnmountTimer();
    };
  }, []);

  // 当弹窗挂载时，监听全局滚动、尺寸变化和外部点击
  useEffect(() => {
    if (!isMounted) {
      return;
    }

    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) {
        return;
      }
      if (triggerRef.current?.contains(target)) {
        return;
      }
      if (contentRef.current?.contains(target)) {
        return;
      }
      closeImmediately();
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener("mousedown", handleDocumentClick);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isMounted, updatePosition, closeImmediately]);

  const triggerContent =
    typeof trigger === "function" ? trigger(isOpen) : trigger;

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Popover 悬浮触发器容器需要监听 mouseenter/mouseleave */}
      <div
        ref={triggerRef}
        className={`v-popover-trigger-wrap ${isOpen ? "is-open" : ""} ${className}`.trim()}
        onMouseEnter={handleTriggerMouseEnter}
        onMouseLeave={handleTriggerMouseLeave}
      >
        {triggerContent}
      </div>

      {isMounted &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="v-popover-wrap"
            style={{
              position: "absolute",
              top: `${triggerRect.top}px`,
              left: `${triggerRect.left}px`,
              width: `${triggerRect.width}px`,
              height: `${triggerRect.height}px`,
              pointerEvents: "none",
              zIndex: 1000,
            }}
          >
            {/* biome-ignore lint/a11y/noStaticElementInteractions: 浮层内容容器需监听悬浮与冒泡点击 */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: 点击关闭属于辅助性鼠标交互 */}
            <div
              ref={contentRef}
              className={[
                "v-popover",
                `is-${placement}`,
                isVisible ? "is-visible" : "is-hidden",
                contentClassName,
              ]
                .filter(Boolean)
                .join(" ")}
              onMouseEnter={handleContentMouseEnter}
              onMouseLeave={handleContentMouseLeave}
              onClick={handleContentClick}
              style={{ pointerEvents: isVisible ? "auto" : "none" }}
            >
              <div className="v-popover-content">{children}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
